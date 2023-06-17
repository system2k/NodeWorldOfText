var utils = require("../utils/utils.js");
var arrayIsEntirely = utils.arrayIsEntirely;
var advancedSplit = utils.advancedSplit;
var encodeCharProt = utils.encodeCharProt;
var decodeCharProt = utils.decodeCharProt;
var san_nbr = utils.san_nbr;
var change_char_in_array = utils.change_char_in_array;

var enums = require("../utils/enums.js");

var WebSocket = require("ws");

var db;
var db_edits;
var handle_error;
var intv;
var wss;
var memTileCache;
var broadcastMonitorEvent;
var wsSend;

var server_exiting = false;
var editlog_cell_props = false;
var send_microedits = false;

var fetch_tile_queue = [];
var totalTilesCached = 0;
var tileCacheLimit = 4000;

// caller ids. this returns information to a request that uploaded the edits to the server
// [response_callback, response_data, completion_callback, total_units, current_units]
// total_units must be >0
var cids = {};

var ratelimits = {};

// This object contains all tiles that are currently loaded during the iteration
// of all tiles in a world. If an edit has been made to a loaded tile, it gets
// added to the central tile cache.
// Unique tile id tuple: "world_id,tile_y,_tile_x"
var tileIterationTempMem = {};

var tileCacheTimeLimit = 1000 * 60 * 1;

module.exports.main = function(server) {
	db = server.db;
	db_edits = server.db_edits;
	handle_error = server.handle_error;
	intv = server.intv;
	wss = server.wss;
	memTileCache = server.memTileCache;
	broadcastMonitorEvent = server.broadcastMonitorEvent;
	wsSend = server.wsSend;

	databaseClock();
	editLogClock();

	intv.clear_tdb_ratelims = setInterval(function() {
		var now = Date.now();
		for(var i in ratelimits) {
			var keys = ratelimits[i];
			for(var x in keys) {
				if(keys[x] <= now) {
					delete keys[x];
				}
			}
		}
	}, 1000 * 60 * 0.5);

	intv.tile_cache_invalidation = setInterval(function() {
		try {
			performCacheInvalidation();
		} catch(e) {
			handle_error(e);
		}
	}, 1000 * 60 * 3);

	sendTileUpdatesToClients();
}

module.exports.server_exit = async function() {
	server_exiting = true;
	// Cycle the clocks again to ensure they execute one last time
	// They already should re-cycle anyway on server exit.
	await Promise.all([
		databaseClock(),
		editLogClock()
	]);
}

var tileClientUpdateQueue = {};
var microTileUpdateRefs = {};
var linkBandwidthInPeriod = 0;
var linkBandwidthPeriod = 0;

function deepTileCopy(tile) {
	var props = {};
	for(var cy in tile.prop_cell_props) {
		props[cy] = {};
		for(var cx in tile.prop_cell_props[cy]) {
			props[cy][cx] = tile.prop_cell_props[cy][cx];
		}
	}
	var obj = {
		content: tile.content.slice(0),
		color: tile.prop_color.slice(0),
		char: tile.prop_char.slice(0),
		props,
		writability: tile.writability
	};
	return obj;
}

function prepareMicroTileUpdateMessage(worldID, tileX, tileY, cacheTile) {
	var pos = tileY + "," + tileX;
	if(!microTileUpdateRefs[worldID]) {
		microTileUpdateRefs[worldID] = {};
	}
	// keep a copy of the tile for comparison when broadcasting micro-updates
	if(!microTileUpdateRefs[worldID][pos]) {
		microTileUpdateRefs[worldID][pos] = deepTileCopy(cacheTile);
	}
}

function prepareTileUpdateMessage(tileObj, worldObj, channel) {
	var worldID = worldObj.id;
	var updateObj = tileClientUpdateQueue[worldID];
	if(!updateObj) {
		updateObj = {};
		tileClientUpdateQueue[worldID] = updateObj;
	}
	if(!channel) channel = "00000000000000";
	for(var i = 0; i < tileObj.length; i++) {
		var tileElm = tileObj[i];
		var tile = tileElm.tile;
		var tileX = tileElm.tileX;
		var tileY = tileElm.tileY;
		var pos = tileY + "," + tileX;
		updateObj[pos] = [tile, channel];
	}
}

function generateFullTileUpdate(worldQueue, worldID) {
	var cliUpdData = {};
	var totalUpdatedTiles = 0;
	var channel = "Unavailable";
	for(var coord in worldQueue) {
		var tileUpdate = worldQueue[coord];
		delete worldQueue[coord];
		totalUpdatedTiles++;
		if(totalUpdatedTiles > 100) {
			continue;
		}
		var tile = tileUpdate[0];
		channel = tileUpdate[1];
		var content = tile.content.join("");
		var properties = {
			writability: tile.writability
		};
		if(!arrayIsEntirely(tile.prop_char, null)) {
			properties.char = encodeCharProt(tile.prop_char);
		}
		if(!arrayIsEntirely(tile.prop_color, 0)) {
			properties.color = tile.prop_color;
		}
		if(tile.prop_bgcolor !== null) {
			properties.bgcolor = tile.prop_bgcolor;
		}
		if(Object.keys(tile.prop_cell_props).length > 0) {
			properties.cell_props = tile.prop_cell_props;
		}
		var currentPeriod = Math.floor(Date.now() / 1000);
		if(currentPeriod == linkBandwidthPeriod) {
			if(linkBandwidthInPeriod > 3000000) {
				delete properties.cell_props;
			}
		} else {
			linkBandwidthInPeriod = 0;
		}
		linkBandwidthPeriod = currentPeriod;
		var cprops = tile.prop_cell_props;
		for(var y in cprops) {
			for(var x in cprops[y]) {
				var link = cprops[y][x].link;
				if(!link) continue;
				if(link.type == "url") {
					linkBandwidthInPeriod += link.url.length;
				}
			}
		}
		cliUpdData[coord] = {
			content,
			properties
		};
	}

	delete tileClientUpdateQueue[worldID];
	return {
		channel: channel,
		kind: "tileUpdate",
		source: "write",
		tiles: cliUpdData
	};
}
function generateMicroTileUpdate(worldQueue, worldID) {
	var cliUpdData = {};
	var microRefs = microTileUpdateRefs[worldID];
	var totalUpdatedTiles = [];
	for(var coord in worldQueue) {
		var tileUpdate = worldQueue[coord];
		var tileRef = microRefs[coord];
		if(!tileRef) continue; // possible bug in this case
		delete microRefs[coord];
		delete worldQueue[coord];
		if(totalUpdatedTiles > 100) {
			continue;
		}
		var upds = [];
		var tile = tileUpdate[0];
		var channel = tileUpdate[1];
		var updChar = [];
		var updProt = [];
		var updLink = [];
		for(var u = 0; u < CONST.tileArea; u++) {
			var partAU = tileRef.content[u];
			var partBU = tile.content[u];
			var partAC = tileRef.color[u];
			var partBC = tile.prop_color[u];
			var partAP = tileRef.char[u];
			var partBP = tile.prop_char[u];
			var cy = Math.floor(u / CONST.tileCols);
			var cx = u % CONST.tileCols;
			var partAL = tileRef.props[cy] ? tileRef.props[cy][cx] : null;
			var partBL = tile.prop_cell_props[cy] ? tile.prop_cell_props[cy][cx] : null;
			if(partAU != partBU || partAC != partBC) {
				updChar.push([u, partBU, partBC]);
			}
			if(partAP != partBP) {
				updProt.push([u, partBP]);
			}
			if(partAL && !partBL) {
				updLink.push([u, null]);
			} else if(!partAL && partBL) {
				updLink.push([u, partBL.link]);
			} else if(partAL && partBL) {
				var l1 = partAL.link;
				var l2 = partBL.link;
				if(l1.type != l2.type) {
					updLink.push([u, partBL.link]);
				} else {
					if(l1.type == "coord") {
						if(l1.link_tileX != l2.link_tileX && l1.link_tileY != l2.link_tileY) {
							updLink.push([u, partBL.link]);
						}
					} else if(l1.type == "url") {
						if(l1.url != l2.url) {
							updLink.push([u, partBL.link]);
						}
					}
				}
			}
		}
		if(updChar.length) {
			upds.push({
				type: "char",
				data: updChar
			});
		}
		if(updProt.length) {
			upds.push({
				type: "prot",
				data: updProt
			});
		}
		if(updLink.length) {
			upds.push({
				type: "link",
				data: updLink
			});
		}
		if(tileRef.writability != tile.writability) {
			upds.push({
				type: "writability",
				data: tile.writability
			});
		}
		cliUpdData[coord] = upds;
	}
	delete tileClientUpdateQueue[worldID];
	delete microTileUpdateRefs[worldID];
	return {
		kind: "update",
		tiles: cliUpdData
	};
}

function filterUpdatePacketDistance(client, packet) {
	if(!packet) return null;
	if(!client.sdata.localFilter) {
		// client has chosen to exepmt itself from local update filtering
		var world = client.sdata.world;
		var user = client.sdata.user;
		// TODO: create a standard function for this
		var isSuperuser = user && user.superuser;
		var isOwner = user && user.id == world.ownerId;
		var isMember = user && world.members.map[user.id];
		var isKeyedMember = world.opts.memKey && world.opts.memKey == client.sdata.keyQuery;
		if(isSuperuser || isOwner || isMember || isKeyedMember) return null;
	}
	var tiles = packet.tiles;
	var newPacket = {
		channel: packet.channel,
		kind: packet.kind,
		source: packet.source,
		tiles: {}
	};
	var isFiltered = false;
	var center = client.sdata.center;
	var boundary = client.sdata.boundary;
	var x1 = boundary[0];
	var y1 = boundary[1];
	var x2 = boundary[2];
	var y2 = boundary[3];
	for(var idx in tiles) {
		var pos = idx.split(",");
		var tileX = san_nbr(pos[1]);
		var tileY = san_nbr(pos[0]);
		var dist = (center[0] - tileX) ** 2 + (center[1] - tileY) ** 2;
		if(dist > 128 * 128) {
			// not in range from center point
			isFiltered = true;
			continue;
		}
		if(x1 && y1 && x2 && y2) {
			// not in range of boundary
			if(!(tileX >= x1 && tileX <= x2 && tileY >= y1 && tileY <= y2)) {
				isFiltered = true;
				continue;
			}
		}
		newPacket.tiles[idx] = tiles[idx];
	}
	if(isFiltered) {
		return newPacket;
	}
	return null;
}

function sendTileUpdatesToClients() {
	if(server_exiting) return;
	var hasUpdates = Object.keys(tileClientUpdateQueue).length > 0;
	if(!hasUpdates) {
		intv.client_update_clock = setTimeout(sendTileUpdatesToClients, 1000 / 30);
		return;
	}
	for(var world in tileClientUpdateQueue) {
		var worldQueue = tileClientUpdateQueue[world];
		var worldID = parseInt(world);

		var cliUpdPkt = null;
		if(send_microedits) {
			cliUpdPkt = generateMicroTileUpdate(worldQueue, world);
		} else {
			cliUpdPkt = generateFullTileUpdate(worldQueue, world);
		}
		var pktBroadcast = JSON.stringify(cliUpdPkt);

		wss.clients.forEach(function(client) {
			if(!client.sdata) return;
			if(!client.sdata.userClient) return;
			if(!client.sdata.receiveContentUpdates) return;
			if(client.sdata.world.id == worldID && client.readyState == WebSocket.OPEN) {
				var filteredPacket = filterUpdatePacketDistance(client, cliUpdPkt);
				if(filteredPacket) {
					// this client was found to be too far away from the location of the edits,
					// so we must re-serialize the update message
					if(Object.keys(filteredPacket.tiles).length > 0) {
						wsSend(client, JSON.stringify(filteredPacket));
					}
				} else {
					wsSend(client, pktBroadcast);
				}
			}
		});
	}
	intv.client_update_clock = setTimeout(sendTileUpdatesToClients, 1000 / 30);
}

function set_ratelimit(type, key, duration) {
	if(!ratelimits[type]) ratelimits[type] = {};
	var now = Date.now();
	ratelimits[type][key] = now + duration;
}
function check_ratelimit(type, key) {
	var now = Date.now();
	if(!ratelimits[type]) return false;
	if(!ratelimits[type][key]) return false;
	if(ratelimits[type][key] <= now) {
		delete ratelimits[type][key];
		return false;
	}
	return true;
}

function is_consistent(array) {
	var consistentValue;
	var cvSet = false;
	for(var i = 0; i < array.length; i++) {
		if(!cvSet) {
			cvSet = true;
			consistentValue = array[i];
			continue;
		}
		if(array[i] != consistentValue) {
			return false;
		}
	}
	return true;
}

function normalize_tile(tile_db_data) {
	// tile_db_data must contain: (rowid, content, writability, properties)
	var data = {
		tile_id: null, // rowid; id must be set once inserted to database. null if does not exist yet.
		tile_exists: false, // is set to true once the tile is added to database
		content: null,
		writability: null,
		prop_color: null,
		prop_bgcolor: null, // this is nullable - it can only either be null or an array of 128 integers.
		prop_char: null,
		prop_cell_props: null,

		url_bytes: 0,
		url_cells: 0,

		props_updated: false,
		content_updated: false,
		writability_updated: false,
		inserting: false,
		last_accessed: -1
	};
	if(tile_db_data) {
		var parsed_props = JSON.parse(tile_db_data.properties);
		if(parsed_props.color) {
			data.prop_color = parsed_props.color;
		} else {
			data.prop_color = new Array(CONST.tileArea).fill(0);
		}
		if(parsed_props.bgcolor) {
			data.prop_bgcolor = parsed_props.bgcolor;
		}
		if(parsed_props.char) {
			data.prop_char = decodeCharProt(parsed_props.char);
		} else {
			data.prop_char = new Array(CONST.tileArea).fill(null);
		}
		if(parsed_props.cell_props) {
			data.prop_cell_props = parsed_props.cell_props;
			var props = data.prop_cell_props;
			// record statistics for raw URL-link data
			for(var y in props) {
				for(var x in props[y]) {
					var link = props[y][x].link;
					if(!link) continue;
					if(link.type == "url") {
						data.url_bytes += Buffer.byteLength(link.url);
						data.url_cells++;
					}
				}
			}
		} else {
			data.prop_cell_props = {};
		}
		data.tile_exists = true;
		data.content = advancedSplit(tile_db_data.content);
		data.writability = tile_db_data.writability;
		data.tile_id = tile_db_data.rowid;
	} else {
		data.prop_color = new Array(CONST.tileArea).fill(0);
		data.prop_bgcolor = null; // not going to be used often, so we will skimp on memory
		data.prop_char = new Array(CONST.tileArea).fill(null); // precise protection data
		data.prop_cell_props = {};
		data.tile_exists = false;
		data.content = new Array(CONST.tileArea).fill(" "); // text data
		data.writability = null;
		data.tile_id = null;
	}
	return data;
}

async function loadTileCacheData(world_id, tileX, tileY) {
	var tile = await db.get("SELECT rowid as rowid, content, properties, writability FROM tile WHERE tileX=? AND tileY=? AND world_id=?", [tileX, tileY, world_id]);
	return normalize_tile(tile);
}

// free all in-memory tiles if they haven't been written to in a while
function performCacheInvalidation() {
	var date = Date.now();
	for(var worldID in memTileCache) {
		for(var tileY in memTileCache[worldID]) {
			for(var tileX in memTileCache[worldID][tileY]) {
				var tile = memTileCache[worldID][tileY][tileX];
				if(tile.props_updated || tile.content_updated || tile.writability_updated || tile.inserting) continue;
				if(date - tile.last_accessed > tileCacheTimeLimit) {
					deleteTileDIM(worldID, tileX, tileY);
				}
			}
		}
	}
}

function handleTooManyCachedTiles() {
	// free every single tile
	if(totalTilesCached <= tileCacheLimit) return;
	broadcastMonitorEvent("Database", "Too many cached tiles detected");
	for(var worldID in memTileCache) {
		for(var tileY in memTileCache[worldID]) {
			for(var tileX in memTileCache[worldID][tileY]) {
				var tile = memTileCache[worldID][tileY][tileX];
				if(tile.props_updated || tile.content_updated || tile.writability_updated || tile.inserting) continue;
				deleteTileDIM(worldID, tileX, tileY);
			}
		}
	}
}

// determine if a tile is in queue to be loaded
function lookupTileQueue(tileUID) {
	for(var i = 0; i < fetch_tile_queue.length; i++) {
		if(fetch_tile_queue[i][0] == tileUID) return fetch_tile_queue[i];
	}
	return null;
}

function IOProgress(callID) {
	if(!cids[callID]) return;
	cids[callID][4]++;
	if(cids[callID][4] >= cids[callID][3]) {
		var response = cids[callID][0];
		var completion = cids[callID][2];
		cids[callID][2] = null;
		if(response) response(cids[callID][1]);
		if(completion) completion();
	}
}

function tileWriteEdits(cacheTile, editObj) {
	var editArray = editObj[1];
	var data = editObj[2];
	var sharedObj = editObj[3];
	var callID = editObj[4];

	var accepted = cids[callID][1][0];
	var rejected = cids[callID][1][1];

	var tileY = san_nbr(editArray[0]);
	var tileX = san_nbr(editArray[1]);
	var charY = editArray[2];
	var charX = editArray[3];
	var time = editArray[4]; // not used
	var char = editArray[5];
	var editID = editArray[6]; // returned to the client in a response
	var color = editArray[7]; // integer (0 - 16777215 or -1)
	var bgcolor = editArray[8]; // integer (-1 - 16777215) or null

	var world = data.world;
	var user = data.user;
	var public_only = data.public_only;
	var preserve_links = data.preserve_links;
	var can_color_text = data.can_color_text;
	var can_color_cell = data.can_color_cell;
	var no_log_edits = data.no_log_edits;

	var is_owner = data.is_owner;
	var is_member = data.is_member;

	var index = charY * CONST.tileCols + charX;
	var char_writability = cacheTile.prop_char[index];

	// permission checking - compute the writability of the cell, accounting for tile and world writing permissions
	if(char_writability == null) char_writability = cacheTile.writability;
	if(char_writability == null) char_writability = world.writability;

	// tile is owner-only, but user is not owner
	if(char_writability == 2 && !is_owner) {
		if(rejected) rejected[editID] = enums.write.noWritePerm;
		IOProgress(callID);
		return;
	}
	// tile is member-only, but user is not member (nor owner)
	if(char_writability == 1 && !is_owner && !is_member) {
		if(rejected) rejected[editID] = enums.write.noWritePerm;
		IOProgress(callID);
		return;
	}

	// this edit request is only allowed to write on public areas
	if(public_only && char_writability != 0) {
		if(rejected) rejected[editID] = enums.write.noWritePerm;
		IOProgress(callID);
		return;
	}

	var char_updated = change_char_in_array(cacheTile.content, char, index);
	if(char_updated) {
		cacheTile.content_updated = true;
	}

	if(!can_color_text) color = 0;
	if(!can_color_cell) bgcolor = -1;
	if(color !== -1) {
		var prevCol = cacheTile.prop_color[index];
		cacheTile.prop_color[index] = color;
		if(prevCol != color) {
			cacheTile.props_updated = true;
			char_updated = true;
		}
	}

	if(bgcolor !== null) {
		var bdColUpdated = false;
		if(cacheTile.prop_bgcolor) {
			var prevBgCol = cacheTile.prop_bgcolor[index];
			cacheTile.prop_bgcolor[index] = bgcolor;
			if(is_consistent(cacheTile.prop_bgcolor) && cacheTile.prop_bgcolor[0] == -1) {
				cacheTile.prop_bgcolor = null;
				bdColUpdated = true;
			}
			if(prevBgCol != bgcolor) {
				bdColUpdated = true;
			}
		} else if(bgcolor != -1) { // -1 : no background color
			cacheTile.prop_bgcolor = new Array(CONST.tileArea).fill(-1);
			cacheTile.prop_bgcolor[index] = bgcolor;
			bdColUpdated = true;
		}
		if(bdColUpdated) {
			cacheTile.props_updated = true;
			char_updated = true;
		}
	}

	// detect overriden links
	if(!preserve_links) {
		var props = cacheTile.prop_cell_props;
		if(props[charY]) {
			// clear properties for this char
			if(props[charY][charX]) {
				var link = props[charY][charX].link;
				if(link && link.type == "url") {
					cacheTile.url_cells--;
					cacheTile.url_bytes -= Buffer.byteLength(link.url);
				}
				delete props[charY][charX];
				cacheTile.props_updated = true;
				char_updated = true;
			}
			// the row for this tile is empty
			if(Object.keys(props[charY]).length == 0) {
				delete props[charY];
				cacheTile.props_updated = true;
			}
		}
	}

	if(accepted) {
		accepted.push(editID);
	}
	if(char_updated && !no_log_edits && sharedObj.editLog) {
		var ar = [tileY, tileX, charY, charX, Date.now(), char, editID];
		if(color) ar.push(color);
		if(bgcolor != -1) {
			if(!color) ar.push(0);
			ar.push(bgcolor);
		}
		sharedObj.editLog.push(ar); // TODO: remove need for shared objects
	}
	if(char_updated) {
		cacheTile.last_accessed = Date.now();
		sharedObj.tileUpdates[tileY + "," + tileX] = cacheTile;
	}
	IOProgress(callID);
}

function tileWriteLinks(cacheTile, editObj) {
	var data = editObj[1];
	var sharedObj = editObj[2];
	var callID = editObj[3];

	var respData = cids[callID][1];

	var tileX = data.tileX;
	var tileY = data.tileY;
	var charX = data.charX;
	var charY = data.charY;
	var user = data.user;
	var world = data.world;
	var is_member = data.is_member;
	var is_owner = data.is_owner;
	var type = data.type;
	var url = data.url;
	var link_tileX = data.link_tileX;
	var link_tileY = data.link_tileY;

	var index = charY * CONST.tileCols + charX;
	var char_writability = cacheTile.prop_char[index];
	if(char_writability == null) char_writability = cacheTile.writability;
	if(char_writability == null) char_writability = world.writability;

	var can_link = true;

	// if the areas are protected and the user's perms do not match
	if(char_writability == 2 && !is_owner) {
		can_link = false;
	}
	if(char_writability == 1 && !is_member) {
		can_link = false;
	}

	if(!can_link) {
		respData[0] = true;
		respData[1] = "PERM";
		IOProgress(callID);
		return;
	}

	var cellProps = cacheTile.prop_cell_props;

	if(!cellProps[charY]) cellProps[charY] = {};
	if(!cellProps[charY][charX]) cellProps[charY][charX] = {};

	if(typeof url != "string") url = "";
	if(type == "url") {
		var byteLen = Buffer.byteLength(url);
		var byteMax = 65536;
		var maxBytesGuarantee = 100;
		var linkBytesMax = 10000;

		var newByteLen = byteLen;
		if(byteLen > linkBytesMax) newByteLen = linkBytesMax;
		cacheTile.url_cells++;
		// simulate a case where the rest of the cells are occupied by a URL link,
		// and determine the maximum size that all the cells can be.
		var remainingCells = CONST.tileArea - cacheTile.url_cells;
		var peek = Math.floor((byteMax - cacheTile.url_bytes - newByteLen) / remainingCells);
		if(peek < maxBytesGuarantee) {
			// we have determined that this URL link may potentially be too long,
			// depriving the max guarantee from the rest of the cells that don't have a URL link.
			var remainingBytes = byteMax - cacheTile.url_bytes - (maxBytesGuarantee * remainingCells);
			// truncate the length of the URL link to guarantee that the rest of the non-URL-link cells in the tile
			// have the potential to have their byte count at most maxBytesGuarantee.
			if(remainingBytes < newByteLen) newByteLen = remainingBytes;
			if(newByteLen < maxBytesGuarantee) newByteLen = maxBytesGuarantee; // edge case
		}
		// the URL link was found to be too long, so truncate it
		if(newByteLen < byteLen) {
			url = Buffer.from(url).subarray(0, newByteLen).toString();
			cacheTile.url_bytes += newByteLen;
		} else {
			cacheTile.url_bytes += byteLen;
		}

		cellProps[charY][charX].link = {
			type: "url",
			url: url
		}
	} else if(type == "coord") {
		cellProps[charY][charX].link = {
			type: "coord",
			link_tileY: link_tileY,
			link_tileX: link_tileX
		}
	}
	cacheTile.props_updated = true;
	cacheTile.last_accessed = Date.now();

	respData[0] = false;
	respData[1] = true;
	sharedObj.tile = cacheTile;
	IOProgress(callID);
}

function tileWriteProtections(cacheTile, editObj) {
	var data = editObj[1];
	var sharedObj = editObj[2];
	var callID = editObj[3];

	var respData = cids[callID][1];

	var tileX = data.tileX;
	var tileY = data.tileY;
	var charX = data.charX;
	var charY = data.charY;
	var user = data.user;
	var world = data.world;
	var precise = data.precise;
	var protect_type = data.protect_type;

	var feature_perm = world.feature.memberTilesAddRemove;
	var is_owner = data.is_owner;
	var is_member = data.is_member;

	var can_owner = is_owner;
	var can_member = (is_member && feature_perm) || is_owner;

	var tile_writability = cacheTile.writability;
	if(tile_writability == null) tile_writability = world.writability;

	var has_modified = false;

	if(precise) {
		var idx = charY * CONST.tileCols + charX;
		var char_writability = cacheTile.prop_char[idx];
		if(char_writability == null) char_writability = tile_writability;
		var area_perm = can_owner || (can_member && char_writability < 2);
		if(protect_type == 2 && area_perm && can_owner) {
			cacheTile.prop_char[idx] = 2;
			cacheTile.props_updated = true;
			has_modified = true;
		}
		if(protect_type == 1 && area_perm && can_member) {
			cacheTile.prop_char[idx] = 1;
			cacheTile.props_updated = true;
			has_modified = true;
		}
		if(protect_type == 0 && area_perm && can_member) {
			cacheTile.prop_char[idx] = 0;
			cacheTile.props_updated = true;
			has_modified = true;
		}
		if(protect_type == null && area_perm && can_member) {
			if(cacheTile.writability != null) {
				for(var n = 0; n < cacheTile.prop_char.length; n++) {
					if(cacheTile.prop_char[n] == null) {
						cacheTile.prop_char[n] = cacheTile.writability;
					}
				}
				cacheTile.writability = null;
				cacheTile.writability_updated = true;
				cacheTile.props_updated = true;
			}
			cacheTile.prop_char[idx] = null;
			has_modified = true;
			cacheTile.props_updated = true;
		}
		if(cacheTile.prop_char[0] != null && is_consistent(cacheTile.prop_char)) {
			cacheTile.writability = cacheTile.prop_char[0];
			for(var i = 0; i < cacheTile.prop_char.length; i++) {
				cacheTile.prop_char[i] = null;
			}
			has_modified = true;
			cacheTile.props_updated = true;
			cacheTile.writability_updated = true;
		}
	} else {
		var full_protection_complete = true;
		for(var i = 0; i < CONST.tileArea; i++) {
			var char_writability = cacheTile.prop_char[i];
			if(char_writability == null) char_writability = tile_writability;
			var area_perm = can_owner || (can_member && char_writability < 2);
			if(protect_type == 2) {
				if(area_perm && can_owner) {
					cacheTile.prop_char[i] = 2;
					cacheTile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == 1) {
				if(area_perm && can_member) {
					cacheTile.prop_char[i] = 1;
					cacheTile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == 0) {
				if(area_perm && can_member) {
					cacheTile.prop_char[i] = 0;
					cacheTile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == null) {
				if(area_perm && can_member) {
					cacheTile.prop_char[i] = null;
					has_modified = true;
					cacheTile.props_updated = true;
				} else {
					full_protection_complete = false;
				}
			}
		}
		if(full_protection_complete) {
			// user can change protection of all chars in the tile, so change the protection of the tile itself
			for(var i = 0; i < cacheTile.prop_char.length; i++) {
				cacheTile.prop_char[i] = null;
			}
			cacheTile.props_updated = true;
			cacheTile.writability = protect_type;
			cacheTile.writability_updated = true;
		}
	}

	cacheTile.last_accessed = Date.now();

	// no permission to modify
	if(!has_modified) {
		respData[0] = true;
		respData[1] = "PERM";
		IOProgress(callID);
		return;
	}

	respData[0] = false;
	respData[1] = true;
	sharedObj.tile = cacheTile;
	IOProgress(callID);
}

function tileWriteClear(cacheTile, editObj) {
	var data = editObj[1];
	var sharedObj = editObj[2];
	var callID = editObj[3];

	for(var x = 0; x < CONST.tileArea; x++) {
		cacheTile.content[x] = " ";
		cacheTile.prop_color[x] = 0;
	}
	cacheTile.prop_bgcolor = null;

	for(var d in cacheTile.prop_cell_props) {
		delete cacheTile.prop_cell_props[d];
	}
	cacheTile.url_cells = 0;
	cacheTile.url_bytes = 0;

	cacheTile.content_updated = true;
	cacheTile.props_updated = true;
	cacheTile.last_accessed = Date.now();

	sharedObj.tile = cacheTile;
	IOProgress(callID);
}

function processTileEdit(worldID, tileX, tileY, editData) {
	var cacheTile = isTileDIM(worldID, tileX, tileY);
	if(send_microedits) {
		prepareMicroTileUpdateMessage(worldID, tileX, tileY, cacheTile);
	}
	// the first element of an editData array must be the edit type
	for(var i = 0; i < editData.length; i++) {
		var editObj = editData[i];
		var editType = editObj[0];
		// these should all be synchronous operations
		switch(editType) {
			case types.write:
				tileWriteEdits(cacheTile, editObj);
				break;
			case types.link:
				tileWriteLinks(cacheTile, editObj);
				break;
			case types.protect:
				tileWriteProtections(cacheTile, editObj);
				break;
			case types.clear:
				tileWriteClear(cacheTile, editObj);
				break;
		}
	}
}

function appendToUnloadedTileCache(worldID, tileX, tileY, editData) {
	var tile_uid = worldID + "," + tileY + "," + tileX;
	var qList = lookupTileQueue(tile_uid);
	if(qList) {
		qList[1].push(editData);
	} else {
		doFetchTile([tile_uid, [editData]]);
	}
}

function doFetchTile(queueArray) {
	fetch_tile_queue.push(queueArray);

	var tile_uid = queueArray[0];
	var pending_edits = queueArray[1];

	var tile_vec3 = tile_uid.split(",");
	var world_id = parseInt(tile_vec3[0]);
	var tile_y = parseInt(tile_vec3[1]);
	var tile_x = parseInt(tile_vec3[2]);

	loadTileCacheData(world_id, tile_x, tile_y).then(function(tile) {
		var idx = fetch_tile_queue.indexOf(queueArray);
		if(idx > -1) {
			fetch_tile_queue.splice(idx, 1);
		}
		addTileMem(world_id, tile_x, tile_y, tile);
		processTileEdit(world_id, tile_x, tile_y, pending_edits);
		handleTooManyCachedTiles();
	}).catch(function(e) {
		handle_error(e);
	});
}

function arrayIsEntirely(arr, elm) {
	for(var i = 0; i < arr.length; i++) {
		if(arr[i] != elm) return false;
	}
	return true;
}

var editLogQueue = [];
function appendToEditLogQueue(tileX, tileY, userID, data, worldID, date) {
	editLogQueue.push([tileX, tileY, userID, data, worldID, date]);
}

async function flushBulkWriteQueue() {
	await db.run("BEGIN");
	try {
		var elm = bulkWriteQueue[0];
		bulkWriteQueue.shift();
		var edits = elm[0];
		var response = elm[1];
		for(var i = 0; i < edits.length; i++) {
			var command = edits[i];
			var sql = command[0];
			var params = command[1];
			var callback = command[2];
			try {
				var resp = await db.run(sql, params);
				if(callback) callback(resp);
			} catch(e) {
				handle_error(e, true);
			}
		}
	} catch(e) {
		handle_error(e, true);
	}
	await db.run("COMMIT");
	bulkWriteBusy = false;
	if(bulkWriteQueue.length) {
		stimulateBulkWriteQueue();
	}
	response();
}

var bulkWriteQueue = [];
var bulkWriteBusy = false;
function stimulateBulkWriteQueue() {
	if(bulkWriteBusy) return;
	bulkWriteBusy = true;
	flushBulkWriteQueue();
}
function bulkWriteEdits(edits) {
	return new Promise(function(res) {
		bulkWriteQueue.push([edits, res]);
		stimulateBulkWriteQueue();
	});
}

async function iterateDatabaseChanges() {
	let writeQueue = [];
	let modTileCount = 0;
	for(let worldID in memTileCache) {
		for(let tileY in memTileCache[worldID]) {
			for(let tileX in memTileCache[worldID][tileY]) {
				let tile = memTileCache[worldID][tileY][tileX];
				if(!tile.props_updated && !tile.content_updated && !tile.writability_updated) continue;
				modTileCount++;
				let empty_content = false;
				let empty_color = false;
				let empty_bgcolor = false;
				let empty_props = false;
				let empty_char = false;
				if(tile.tile_exists) {
					let writeQueuePending = [];
					if(arrayIsEntirely(tile.prop_color, 0)) {
						empty_color = true;
					}
					if(arrayIsEntirely(tile.prop_char, null)) {
						empty_char = true;
					}
					if(tile.prop_bgcolor === null) {
						empty_bgcolor = true;
					}
					if(Object.keys(tile.prop_cell_props).length == 0) {
						empty_props = true;
					}
					if(arrayIsEntirely(tile.content, " ")) {
						empty_content = true;
					}
					if(tile.props_updated) {
						tile.props_updated = false;
						let propObj = {};
						if(!empty_color) {
							propObj.color = tile.prop_color;
						}
						if(!empty_char) {
							propObj.char = encodeCharProt(tile.prop_char);
						}
						if(!empty_bgcolor) {
							propObj.bgcolor = tile.prop_bgcolor;
						}
						if(!empty_props) {
							propObj.cell_props = tile.prop_cell_props;
						}
						writeQueuePending.push(["UPDATE tile SET properties=? WHERE rowid=?", [JSON.stringify(propObj), tile.tile_id]]);
					}
					if(tile.content_updated) {
						tile.content_updated = false;
						writeQueuePending.push(["UPDATE tile SET content=? WHERE rowid=?", [tile.content.join(""), tile.tile_id]]);
					}
					if(tile.writability_updated) {
						tile.writability_updated = false;
						writeQueuePending.push(["UPDATE tile SET writability=? WHERE rowid=?", [tile.writability, tile.tile_id]]);
					}
					// this is an empty tile - we can just remove it from the database
					if(empty_content && empty_color && empty_bgcolor && empty_char && empty_props && tile.writability === null) {
						writeQueuePending.splice(0);
						writeQueuePending.push(["DELETE FROM tile WHERE rowid=?", tile.tile_id, function() {
							tile.tile_exists = false;
							tile.tile_id = null;
						}]);
					}
					writeQueue.push(...writeQueuePending);
				} else {
					tile.props_updated = false;
					tile.content_updated = false;
					tile.writability_updated = false;
					let propObj = {};
					if(!arrayIsEntirely(tile.prop_color, 0)) {
						propObj.color = tile.prop_color;
					} else {
						empty_color = true;
					}
					if(!arrayIsEntirely(tile.prop_char, null)) {
						propObj.char = encodeCharProt(tile.prop_char);
					} else {
						empty_char = true;
					}
					if(tile.prop_bgcolor !== null) {
						propObj.bgcolor = tile.prop_bgcolor;
					} else {
						empty_bgcolor = true;
					}
					if(Object.keys(tile.prop_cell_props).length > 0) {
						propObj.cell_props = tile.prop_cell_props;
					} else {
						empty_props = true;
					}
					if(arrayIsEntirely(tile.content, " ")) {
						empty_content = true;
					}
					if(empty_content && empty_color && empty_bgcolor && empty_char && empty_props && tile.writability === null) {
						continue; // do not insert empty tile
					}
					tile.inserting = true; // don't cache invalidate tile as it's being inserted
					writeQueue.push(["INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?, ?)",
						[worldID, tile.content.join(""), tileY, tileX, JSON.stringify(propObj), tile.writability, Date.now()], function(newTile) {
							tile.inserting = false;
							tile.tile_exists = true;
							tile.tile_id = newTile.lastID;
						}]);
				}
			}
		}
	}
	if(writeQueue.length) {
		await bulkWriteEdits(writeQueue);
	}
	return modTileCount;
}

async function commitEditLog() {
	var eLogLen = editLogQueue.length;
	var editTransaction = false;
	var editsByWorld = {};
	var numRows = 0;
	if(eLogLen > 1) editTransaction = true;
	if(editTransaction) await db_edits.run("BEGIN");
	for(var i = 0; i < eLogLen; i++) {
		var edit = editLogQueue[0];
		editLogQueue.shift();
		var tileX = edit[0];
		var tileY = edit[1];
		var user = edit[2];
		var data = edit[3];
		var worldID = edit[4];
		if(!editsByWorld[worldID]) {
			editsByWorld[worldID] = 0;
		}
		editsByWorld[worldID]++;
		var date = edit[5];
		if(editsByWorld[worldID] <= 2048) {
			await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)", [user, worldID, tileY, tileX, date, data]);
			numRows++;
		}
	}
	if(editTransaction) await db_edits.run("COMMIT");
	return numRows;
}

var databaseBusy = false;
var editLogBusy = false;
async function databaseClock(serverExit) {
	if(databaseBusy) return;
	databaseBusy = true;
	try {
		var modCount = await iterateDatabaseChanges();
		broadcastMonitorEvent("Database", "Clock cycle executed (" + modCount + " tiles)");
		broadcastMonitorEvent("raw", {
			type: "dbCount",
			tiles: totalTilesCached,
			worlds: Object.keys(memTileCache).length
		});
	} catch(e) {
		handle_error(e, true);
	}
	databaseBusy = false;
	if(server_exiting) {
		if(!serverExit) await databaseClock(true);
	} else {
		intv.database_clock = setTimeout(databaseClock, 1000 * 5);
	}
}

async function editLogClock(serverExit) {
	if(editLogBusy) return;
	editLogBusy = true;
	try {
		var eCount = await commitEditLog();
		broadcastMonitorEvent("EditLog", "Clock cycle executed (" + eCount + " rows)");
	} catch(e) {
		handle_error(e, true);
	}
	editLogBusy = false;
	if(server_exiting) {
		if(!serverExit) await editLogClock(true);
	} else {
		intv.editlog_clock = setTimeout(editLogClock, 1000 * 5);
	}
}

function isTileDIM(worldID, tileX, tileY) {
	var iteratedTileCache = tileIterationTempMem[worldID + "," + tileY + "," + tileX];
	// already exists in the iteration cache. add to main tile cache.
	if(iteratedTileCache) {
		addTileMem(worldID, tileX, tileY, iteratedTileCache);
		return iteratedTileCache;
	}
	if(!memTileCache[worldID]) return false;
	if(!memTileCache[worldID][tileY]) return false;
	if(!memTileCache[worldID][tileY][tileX]) return false;
	return memTileCache[worldID][tileY][tileX];
}
function addTileMem(worldID, tileX, tileY, cacheTileData) {
	if(!memTileCache[worldID]) {
		memTileCache[worldID] = {};
	}
	if(!memTileCache[worldID][tileY]) {
		memTileCache[worldID][tileY] = {};
	}
	if(!memTileCache[worldID][tileY][tileX]) {
		memTileCache[worldID][tileY][tileX] = cacheTileData;
		totalTilesCached++;
	}
}
function deleteTileDIM(worldID, tileX, tileY) {
	delete memTileCache[worldID][tileY][tileX];
	totalTilesCached--;
	if(!Object.keys(memTileCache[worldID][tileY]).length) delete memTileCache[worldID][tileY];
	if(!Object.keys(memTileCache[worldID]).length) delete memTileCache[worldID];
}

function processTileIORequest(call_id, type, data) {
	switch(type) {
		case types.write:
			var tile_edits = data.tile_edits;
			if(!tile_edits.length) return IOProgress(call_id);
			var world = data.world;
			cids[call_id][1] = [[], data.rejected];
			cids[call_id][3] = tile_edits.length;
			var sharedObj = {
				editLog: [],
				tileUpdates: {} // used for keeping track of which tiles have been modified by this edit
			};
			cids[call_id][2] = function() { // when the write is completed
				if(!data.no_update && Object.keys(sharedObj.tileUpdates).length > 0) {
					var updTile = [];
					for(var i in sharedObj.tileUpdates) {
						var pos = i.split(",");
						var tileX = parseInt(pos[1]);
						var tileY = parseInt(pos[0]);
						var tile = sharedObj.tileUpdates[i];
						updTile.push({
							tileX,
							tileY,
							tile
						});
					}
					prepareTileUpdateMessage(updTile, world, data.channel);
				}
				if(!data.no_log_edits) {
					var tileGroups = {};
					for(var i = 0; i < sharedObj.editLog.length; i++) {
						var edit = sharedObj.editLog[i];
						var tileX = edit[1];
						var tileY = edit[0];
						if(!tileGroups[tileY + "," + tileX]) tileGroups[tileY + "," + tileX] = [];
						tileGroups[tileY + "," + tileX].push(edit);
					}
					for(var i in tileGroups) {
						var pos = i.split(",");
						var tileX = parseInt(pos[1]);
						var tileY = parseInt(pos[0]);
						appendToEditLogQueue(tileX, tileY, 0, JSON.stringify(tileGroups[i]), world.id, tileGroups[i][0][4]);
					}
				}
			}
			for(var e = 0; e < tile_edits.length; e++) {
				var edit = tile_edits[e];
				var tileY = edit[0];
				var tileX = edit[1];
				if(isTileDIM(world.id, tileX, tileY)) {
					processTileEdit(world.id, tileX, tileY, [[types.write, edit, data, sharedObj, call_id]]);
				} else {
					appendToUnloadedTileCache(world.id, tileX, tileY, [types.write, edit, data, sharedObj, call_id]);
				}
			}
			break;
		case types.link:
			var world = data.world;
			var tileX = data.tileX;
			var tileY = data.tileY;

			cids[call_id][1] = [false, false];
			cids[call_id][3] = 1;
			var sharedObj = {
				editLog: [],
				tile: null
			};
			cids[call_id][2] = function() {
				if(sharedObj.tile) {
					if(!data.no_update) {
						prepareTileUpdateMessage([{tileX, tileY, tile: sharedObj.tile}], world, data.channel);
					}
					if(!data.no_log_edits && editlog_cell_props) {
						var linkArch = {
							kind: "link",
							charX: data.charX,
							charY: data.charY
						};
						if(data.type == "url") {
							linkArch.link_type = 0;
							linkArch.link_tileX = null;
							linkArch.link_tileY = null;
							linkArch.url = data.url;
						} else if(data.type == "coord") {
							linkArch.link_type = 1;
							linkArch.link_tileX = data.link_tileX;
							linkArch.link_tileY = data.link_tileY;
							linkArch.url = "";
						}
						var editData = "@" + JSON.stringify(linkArch);
						appendToEditLogQueue(tileX, tileY, 0, editData, world.id, Date.now());
					}
				}
			}

			if(isTileDIM(world.id, tileX, tileY)) {
				processTileEdit(world.id, tileX, tileY, [[types.link, data, sharedObj, call_id]]);
			} else {
				appendToUnloadedTileCache(world.id, tileX, tileY, [types.link, data, sharedObj, call_id]);
			}
			break;
		case types.protect:
			var world = data.world;
			var tileX = data.tileX;
			var tileY = data.tileY;

			cids[call_id][1] = [false, false];
			cids[call_id][3] = 1;
			var sharedObj = {
				editLog: [],
				tile: null
			};
			cids[call_id][2] = function() {
				if(sharedObj.tile) {
					if(!data.no_update) {
						prepareTileUpdateMessage([{tileX, tileY, tile: sharedObj.tile}], world, data.channel);
					}
					if(!data.no_log_edits && editlog_cell_props) {
						var protArch = {
							kind: "protect",
							protect_type: data.protect_type,
							precise: !!data.precise,
							charX: data.charX,
							charY: data.charY
						};
						var editData = "@" + JSON.stringify(protArch);
						appendToEditLogQueue(tileX, tileY, 0, editData, world.id, Date.now());
					}
				}
			}

			if(isTileDIM(world.id, tileX, tileY)) {
				processTileEdit(world.id, tileX, tileY, [[types.protect, data, sharedObj, call_id]]);
			} else {
				appendToUnloadedTileCache(world.id, tileX, tileY, [types.protect, data, sharedObj, call_id]);
			}
			break;
		case types.clear:
			var tileX = data.tileX;
			var tileY = data.tileY;
			var world = data.world;

			cids[call_id][3] = 1;
			var sharedObj = {
				tile: null
			};
			cids[call_id][2] = function() {
				prepareTileUpdateMessage([{tileX, tileY, tile: sharedObj.tile}], world, null);
				if(!data.no_log_edits) {
					appendToEditLogQueue(tileX, tileY, 0, "@{\"kind\":\"clear_tile\"}", world.id, Date.now());
				}
			}

			if(isTileDIM(world.id, tileX, tileY)) {
				processTileEdit(world.id, tileX, tileY, [[types.clear, data, sharedObj, call_id]]);
			} else {
				appendToUnloadedTileCache(world.id, tileX, tileY, [types.clear, data, sharedObj, call_id]);
			}
			break;
	}
}

function asyncWait(ms) {
	return new Promise(function(res) {
		setTimeout(res, ms);
	});
}

var tileIterationsLoopStarted = false;
async function beginTileIterationsLoop() {
	if(tileIterationsLoopStarted) return;
	tileIterationsLoopStarted = true;
	var chunkSize = 512;
	while(true) {
		if(server_exiting) break;
		if(!activeTileIterationsQueue.length) {
			tileIterationsLoopStarted = false;
			break;
		}
		var context = activeTileIterationsQueue[tileIterationsIndex];

		if(context.suspended) {
			activeTileIterationsQueue.splice(tileIterationsIndex, 1);
			IOProgress(context.call_id);
			if(tileIterationsIndex >= activeTileIterationsQueue.length) {
				tileIterationsIndex = 0;
			}
			continue;
		}
	
		if(context.index == 0) {
			if(context.type == types.publicclear) {
				appendToEditLogQueue(0, 0, context.user.id, "@{\"kind\":\"clear_public\"}", context.world.id, Date.now());
			} else if(context.type == types.eraseworld) {
				appendToEditLogQueue(0, 0, context.user.id, "@{\"kind\":\"clear_all\"}", context.world.id, Date.now());
			}
			var initPos = await db.get("SELECT tileX, tileY FROM tile WHERE world_id=? LIMIT 1", [context.world.id]);
			if(!initPos) {
				activeTileIterationsQueue.splice(tileIterationsIndex, 1);
				IOProgress(context.call_id);
				if(tileIterationsIndex >= activeTileIterationsQueue.length) {
					tileIterationsIndex = 0;
				}
				continue;
			}
			context.posX = initPos.tileX - 1; // start before first tile
			context.posY = initPos.tileY;
		}

		var writeQueue = [];
		if(context.type == types.publicclear) {
			var data = await db.all("SELECT rowid AS rowid, content, tileX, tileY, properties, writability FROM tile WHERE world_id=? AND (tileY, tileX) > (?, ?) LIMIT ?",
				[context.world.id, context.posY, context.posX, chunkSize]);
			for(var d = 0; d < data.length; d++) {
				var tile = data[d];
				var tileObj = normalize_tile(tile);
				var tileX = tile.tileX;
				var tileY = tile.tileY;
				var dimTile = isTileDIM(context.world.id, tileX, tileY);
				if(dimTile) {
					for(var i = 0; i < dimTile.content.length; i++) {
						var charX = i % CONST.tileCols;
						var charY = Math.floor(i / CONST.tileCols);
						var cellProt = dimTile.prop_char[i];
						if(cellProt == null) cellProt = dimTile.writability;
						if(cellProt == null) cellProt = context.world.writability;
						if(cellProt == 0) {
							dimTile.content[i] = " ";
							dimTile.prop_color[i] = 0;
							if(dimTile.prop_bgcolor) {
								dimTile.prop_bgcolor[i] = -1;
							}
							dimTile.content_updated = true;
							dimTile.props_updated = true;
							if(dimTile.prop_cell_props[charY]) {
								if(dimTile.prop_cell_props[charY][charX]) {
									var link = dimTile.prop_cell_props[charY][charX].link;
									if(link && link.type == "url") {
										dimTile.url_cells--;
										dimTile.url_bytes -= Buffer.byteLength(link.url);
									}
									delete dimTile.prop_cell_props[charY][charX];
								}
								if(Object.keys(dimTile.prop_cell_props[charY]).length == 0) {
									delete dimTile.prop_cell_props[charY];
								}
							}
						}
					}
					if(dimTile.prop_bgcolor !== null && arrayIsEntirely(dimTile.prop_bgcolor, -1)) {
						dimTile.prop_bgcolor = null;
					}
					dimTile.last_accessed = Date.now();
				} else {
					if(lookupTileQueue(context.world.id + "," + tileX + "," + tileY)) {
						continue;
					}
					tileIterationTempMem[context.world.id + "," + tileY + "," + tileX] = tileObj;
					for(var i = 0; i < tileObj.content.length; i++) {
						var charX = i % CONST.tileCols;
						var charY = Math.floor(i / CONST.tileCols);
						var cellProt = tileObj.prop_char[i];
						if(cellProt == null) cellProt = tileObj.writability;
						if(cellProt == null) cellProt = context.world.writability;
						if(cellProt == 0) {
							tileObj.content[i] = " ";
							tileObj.prop_color[i] = 0;
							if(tileObj.prop_bgcolor) {
								tileObj.prop_bgcolor[i] = -1;
							}
							if(tileObj.prop_cell_props[charY]) {
								if(tileObj.prop_cell_props[charY][charX]) {
									// TODO: we're not following DRY here too well
									var link = tileObj.prop_cell_props[charY][charX].link;
									if(link && link.type == "url") {
										tileObj.url_cells--;
										tileObj.url_bytes -= Buffer.byteLength(link.url);
									}
									delete tileObj.prop_cell_props[charY][charX];
								}
								if(Object.keys(tileObj.prop_cell_props[charY]).length == 0) {
									delete tileObj.prop_cell_props[charY];
								}
							}
							tileObj.props_updated = true;
							tileObj.content_updated = true;
						}
					}
					if(tileObj.prop_bgcolor !== null && arrayIsEntirely(tileObj.prop_bgcolor, -1)) {
						tileObj.prop_bgcolor = null;
					}
					if(tileObj.props_updated) {
						tileObj.props_updated = false;
						var propObj = {};
						if(!arrayIsEntirely(tileObj.prop_color, 0)) {
							propObj.color = tileObj.prop_color;
						}
						if(!arrayIsEntirely(tileObj.prop_char, null)) {
							propObj.char = encodeCharProt(tileObj.prop_char);
						}
						if(tileObj.prop_bgcolor !== null) {
							propObj.bgcolor = tileObj.prop_bgcolor;
						}
						if(Object.keys(tileObj.prop_cell_props).length > 0) {
							propObj.cell_props = tileObj.prop_cell_props;
						}
						writeQueue.push(["UPDATE tile SET properties=? WHERE rowid=?", [JSON.stringify(propObj), tileObj.tile_id]]);
					}
					if(tileObj.content_updated) {
						tileObj.content_updated = false;
						writeQueue.push(["UPDATE tile SET content=? WHERE rowid=?", [tileObj.content.join(""), tileObj.tile_id]]);
					}
					if(tileObj.writability_updated) {
						tileObj.writability_updated = false;
						writeQueue.push(["UPDATE tile SET writability=? WHERE rowid=?", [tileObj.writability, tileObj.tile_id]]);
					}
				}
			}
			if(writeQueue.length) {
				await bulkWriteEdits(writeQueue);
			}
			for(var i in tileIterationTempMem) {
				delete tileIterationTempMem[i];
			}
			if(data.length < chunkSize) { // reached end of world
				activeTileIterationsQueue.splice(tileIterationsIndex, 1);
				IOProgress(context.call_id);
				if(tileIterationsIndex >= activeTileIterationsQueue.length) {
					tileIterationsIndex = 0;
				}
				continue;
			}
			var lastTile = data[data.length - 1];
			context.posX = lastTile.tileX;
			context.posY = lastTile.tileY;
		} else if(context.type == types.eraseworld) {
			var data = await db.all("SELECT tileX, tileY FROM tile WHERE world_id=? AND (tileY, tileX) > (?, ?) LIMIT ?",
				[context.world.id, context.posY, context.posX, chunkSize]);
			var localTiles = {};
			for(var i = 0; i < data.length; i++) {
				var coords = data[i];
				var tileX = coords.tileX;
				var tileY = coords.tileY;
				if(lookupTileQueue(context.world.id + "," + tileX + "," + tileY)) {
					continue;
				}
				localTiles[tileY + "," + tileX] = 1;
			}
			// begin to delete tiles from memory
			for(var i in localTiles) {
				var pos = i.split(",");
				var tileX = parseInt(pos[1]);
				var tileY = parseInt(pos[0]);
				var ctile = isTileDIM(context.world.id, tileX, tileY);
				if(!ctile) {
					writeQueue.push(["DELETE FROM tile WHERE world_id=? AND tileX=? and tileY=?", [context.world.id, tileX, tileY]]);
					continue;
				}
				ctile.prop_cell_props = {};
				ctile.url_bytes = 0;
				ctile.url_cells = 0;
				for(var x = 0; x < CONST.tileArea; x++) {
					ctile.content[x] = " ";
					ctile.prop_char[x] = null;
					ctile.prop_color[x] = 0;
					if(ctile.prop_bgcolor !== null) {
						ctile.prop_bgcolor = -1;
					}
					ctile.writability = null;
				}
				if(ctile.prop_bgcolor !== null && arrayIsEntirely(ctile.prop_bgcolor, -1)) {
					ctile.prop_bgcolor = null;
				}
				ctile.content_updated = true;
				ctile.writability_updated = true;
				ctile.props_updated = true;
			}
			if(writeQueue.length) {
				await bulkWriteEdits(writeQueue);
			}
			if(data.length < chunkSize) {
				activeTileIterationsQueue.splice(tileIterationsIndex, 1);
				IOProgress(context.call_id);
				if(tileIterationsIndex >= activeTileIterationsQueue.length) {
					tileIterationsIndex = 0;
				}
				continue;
			}
			var lastTile = data[data.length - 1];
			context.posX = lastTile.tileX;
			context.posY = lastTile.tileY;
		}
	
		context.index++;
		tileIterationsIndex++;
		if(tileIterationsIndex >= activeTileIterationsQueue.length) {
			tileIterationsIndex = 0;
		}

		await asyncWait(50);
		continue;
	}
}

var activeTileIterationsQueue = [];
var tileIterationsIndex = 0;
// interleaved
function appendToTileIterationsQueue(world, callID, type, user) {
	activeTileIterationsQueue.push({
		world,
		call_id: callID,
		type,
		index: 0,
		posX: 0,
		posY: 0,
		suspended: false,
		user
	});
	if(!tileIterationsLoopStarted) {
		beginTileIterationsLoop();
	}
}

function processTileIteration(call_id, type, data) {
	switch(type) {
		case types.publicclear:
			var world = data.world;
			var user = data.user;
			if(!user.superuser) {
				if(check_ratelimit("world_clear", world.id)) {
					IOProgress(call_id);
					return;
				}
				set_ratelimit("world_clear", world.id, 1000 * 60 * 2);
			}
			// if any tile iteration operation is occuring, cancel
			for(var i = 0; i < activeTileIterationsQueue.length; i++) {
				var queue = activeTileIterationsQueue[i];
				if(queue.world.id == world.id) {
					IOProgress(call_id);
					return;
				}
			}
			appendToTileIterationsQueue(world, call_id, types.publicclear, user);
			break;
		case types.eraseworld:
			var world = data.world;
			var user = data.user;
			if(!user.superuser) {
				if(check_ratelimit("world_clear", world.id)) {
					IOProgress(call_id);
					return;
				}
				set_ratelimit("world_clear", world.id, 1000 * 60 * 2);
			}
			// cancel if full-world erasing is in operation. suspend any public clear operation.
			for(var i = 0; i < activeTileIterationsQueue.length; i++) {
				var queue = activeTileIterationsQueue[i];
				if(queue.world.id == world.id) {
					if(queue.type == types.publicclear) {
						queue.suspended = true;
					} else {
						return IOProgress(call_id);
					}
				}
			}
			appendToTileIterationsQueue(world, call_id, types.eraseworld, user);
			break;
	}
}

function coordinateAdd(tileX1, tileY1, charX1, charY1, tileX2, tileY2, charX2, charY2) {
	return [
		tileX1 + tileX2 + Math.floor((charX1 + charX2) / 16),
		tileY1 + tileY2 + Math.floor((charY1 + charY2) / 8),
		(charX1 + charX2) % 16,
		(charY1 + charY2) % 8
	];
}

function reserveCallId(id) {
	if(!cids[id]) cids[id] = [null, null, null, 0, 0];
}

var current_call_id = 0;
function newCallId() {
	return current_call_id++;
}

async function editResponse(id) {
	return new Promise(function(res) {
		if(!cids[id]) {
			return console.log("An error occurred while sending back an edit response");
		}
		if(cids[id][3] && cids[id][4] >= cids[id][3]) { // I/O is already completed
			res(cids[id][1]);
			if(cids[id][2]) { // completion callback
				var completion = cids[id][2];
				cids[id][2] = null;
				if(completion) completion();
			}
			delete cids[id];
		} else {
			cids[id][0] = function(resData) {
				res(resData);
				delete cids[id];
			}
		}
	});
}

module.exports.write = function(type, data) {
	var call_id = newCallId();
	reserveCallId(call_id);
	switch(type) {
		case types.none:
			break;
		case types.write:
		case types.link:
		case types.protect:
		case types.clear:
			processTileIORequest(call_id, type, data);
			break;
		case types.publicclear:
		case types.eraseworld:
			processTileIteration(call_id, type, data);
			break;
		default:
			break;
	}
	return editResponse(call_id);
}

var types_enum = 0;
var types = {
	none: types_enum++,
	write: types_enum++,
	link: types_enum++,
	protect: types_enum++,
	clear: types_enum++,
	publicclear: types_enum++,
	eraseworld: types_enum++
};

module.exports.types = types;