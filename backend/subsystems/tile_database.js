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
var linkBandwidthInPeriod = 0;
var linkBandwidthPeriod = 0;

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

		var cliUpdPkt = generateFullTileUpdate(worldQueue, world);
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

function normalizeTile(tile_db_data) {
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
	return normalizeTile(tile);
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
					deleteCachedTile(worldID, tileX, tileY);
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
				deleteCachedTile(worldID, tileX, tileY);
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
	var call = cids[callID];
	call.current++;
	if(call.current >= call.total) {
		var response = call.responseCall;
		var completion = call.completionCall;
		call.completionCall = null;
		if(completion) completion();
		if(response) response(call.responseData);
	}
}

function clearTileContent(tile) {
	tile.prop_cell_props = {};
	tile.url_bytes = 0;
	tile.url_cells = 0;
	for(var x = 0; x < CONST.tileArea; x++) {
		tile.content[x] = " ";
		tile.prop_char[x] = null;
		tile.prop_color[x] = 0;
		if(tile.prop_bgcolor !== null) {
			tile.prop_bgcolor[x] = -1;
		}
		tile.writability = null;
	}
	if(tile.prop_bgcolor !== null && arrayIsEntirely(tile.prop_bgcolor, -1)) {
		tile.prop_bgcolor = null;
	}
	tile.content_updated = true;
	tile.writability_updated = true;
	tile.props_updated = true;
	tile.last_accessed = Date.now();
}

function clearTilePublicContent(world, tile) {
	for(var x = 0; x < tile.content.length; x++) {
		var charX = x % CONST.tileCols;
		var charY = Math.floor(x / CONST.tileCols);
		var cellProt = tile.prop_char[x];
		if(cellProt == null) cellProt = tile.writability;
		if(cellProt == null) cellProt = world.writability;
		if(cellProt == 0) {
			tile.content[x] = " ";
			tile.prop_color[x] = 0;
			if(tile.prop_bgcolor !== null) {
				tile.prop_bgcolor[x] = -1;
			}
			tile.content_updated = true;
			tile.props_updated = true;
			if(tile.prop_cell_props[charY]) {
				if(tile.prop_cell_props[charY][charX]) {
					var link = tile.prop_cell_props[charY][charX].link;
					if(link && link.type == "url") {
						tile.url_cells--;
						tile.url_bytes -= Buffer.byteLength(link.url);
					}
					delete tile.prop_cell_props[charY][charX];
				}
				if(Object.keys(tile.prop_cell_props[charY]).length == 0) {
					delete tile.prop_cell_props[charY];
				}
			}
		}
	}
	if(tile.prop_bgcolor !== null && arrayIsEntirely(tile.prop_bgcolor, -1)) {
		tile.prop_bgcolor = null;
	}
	tile.last_accessed = Date.now();
}

function writeChar(world, tile, charX, charY, char, color, bgColor, isOwner, isMember, options) {
	var public_only = options.public_only;
	var preserve_links = options.preserve_links;
	var can_color_text = options.can_color_text;
	var can_color_cell = options.can_color_cell;

	var index = charY * CONST.tileCols + charX;
	var char_writability = tile.prop_char[index];

	// permission checking - compute the writability of the cell, accounting for tile and world writing permissions
	if(char_writability == null) char_writability = tile.writability;
	if(char_writability == null) char_writability = world.writability;

	// tile is owner-only, but user is not owner
	if(char_writability == 2 && !isOwner) {
		return -1;
	}
	// tile is member-only, but user is not member (nor owner)
	if(char_writability == 1 && !isOwner && !isMember) {
		return -1;
	}

	// this edit request is only allowed to write on public areas
	if(public_only && char_writability != 0) {
		return -1;
	}

	var char_updated = change_char_in_array(tile.content, char, index);
	if(char_updated) {
		tile.content_updated = true;
	}

	if(!can_color_text) color = 0;
	if(!can_color_cell) bgColor = -1;
	if(color !== -1) {
		var prevCol = tile.prop_color[index];
		tile.prop_color[index] = color;
		if(prevCol != color) {
			tile.props_updated = true;
			char_updated = true;
		}
	}

	if(bgColor !== null) {
		var bgColUpdated = false;
		if(tile.prop_bgcolor) {
			var prevBgCol = tile.prop_bgcolor[index];
			tile.prop_bgcolor[index] = bgColor;
			if(is_consistent(tile.prop_bgcolor) && tile.prop_bgcolor[0] == -1) {
				tile.prop_bgcolor = null;
				bgColUpdated = true;
			}
			if(prevBgCol != bgColor) {
				bgColUpdated = true;
			}
		} else if(bgColor != -1) { // -1 : no background color
			tile.prop_bgcolor = new Array(CONST.tileArea).fill(-1);
			tile.prop_bgcolor[index] = bgColor;
			bgColUpdated = true;
		}
		if(bgColUpdated) {
			tile.props_updated = true;
			char_updated = true;
		}
	}

	// detect overriden links
	if(!preserve_links) {
		var props = tile.prop_cell_props;
		if(props[charY]) {
			// clear properties for this char
			if(props[charY][charX]) {
				var link = props[charY][charX].link;
				if(link && link.type == "url") {
					tile.url_cells--;
					tile.url_bytes -= Buffer.byteLength(link.url);
				}
				delete props[charY][charX];
				tile.props_updated = true;
				char_updated = true;
			}
			// the row for this tile is empty
			if(Object.keys(props[charY]).length == 0) {
				delete props[charY];
				tile.props_updated = true;
			}
		}
	}

	return char_updated;
}

function tileWriteEdits(callID, tile, options, editData) {
	var accepted = cids[callID].responseData[0];
	var rejected = cids[callID].responseData[1];
	var sharedData = cids[callID].sharedData;

	var world = options.world;
	var user = options.user;
	var public_only = options.public_only;
	var preserve_links = options.preserve_links;
	var can_color_text = options.can_color_text;
	var can_color_cell = options.can_color_cell;
	var no_log_edits = options.no_log_edits;

	var is_owner = options.is_owner;
	var is_member = options.is_member;

	for(var e = 0; e < editData.length; e++) {
		var edit = editData[e];

		var tileY = edit[0];
		var tileX = edit[1];
		var charY = edit[2];
		var charX = edit[3];
		var time = edit[4]; // not used
		var char = edit[5];
		var editID = edit[6]; // returned to the client in a response
		var color = edit[7]; // integer (0 - 16777215 or -1)
		var bgcolor = edit[8]; // integer (-1 - 16777215) or null

		var charUpdated = writeChar(world, tile, charX, charY, char, color, bgcolor, is_owner, is_member, options);
		if(charUpdated == -1) {
			rejected[editID] = enums.write.noWritePerm;
		} else {
			accepted.push(editID);
			if(charUpdated && !no_log_edits) {
				var ar = [tileY, tileX, charY, charX, 0, char, editID];
				if(color) ar.push(color);
				if(bgcolor != -1) {
					if(!color) ar.push(0);
					ar.push(bgcolor);
				}
				sharedData.editLog.push(ar);
			}
			if(charUpdated) {
				tile.last_accessed = Date.now();
				sharedData.updatedTiles[tileY + "," + tileX] = tile;
			}
		}
	}
	IOProgress(callID);
}

function tileWriteLinks(callID, tile, options) {
	var respData = cids[callID].responseData;
	var sharedData = cids[callID].sharedData;

	var tileX = options.tileX;
	var tileY = options.tileY;
	var charX = options.charX;
	var charY = options.charY;
	var user = options.user;
	var world = options.world;
	var is_member = options.is_member;
	var is_owner = options.is_owner;
	var type = options.type;
	var url = options.url;
	var link_tileX = options.link_tileX;
	var link_tileY = options.link_tileY;

	var index = charY * CONST.tileCols + charX;
	var char_writability = tile.prop_char[index];
	if(char_writability == null) char_writability = tile.writability;
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

	var cellProps = tile.prop_cell_props;

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
		tile.url_cells++;
		// simulate a case where the rest of the cells are occupied by a URL link,
		// and determine the maximum size that all the cells can be.
		var remainingCells = CONST.tileArea - tile.url_cells;
		var peek = Math.floor((byteMax - tile.url_bytes - newByteLen) / remainingCells);
		if(peek < maxBytesGuarantee) {
			// we have determined that this URL link may potentially be too long,
			// depriving the max guarantee from the rest of the cells that don't have a URL link.
			var remainingBytes = byteMax - tile.url_bytes - (maxBytesGuarantee * remainingCells);
			// truncate the length of the URL link to guarantee that the rest of the non-URL-link cells in the tile
			// have the potential to have their byte count at most maxBytesGuarantee.
			if(remainingBytes < newByteLen) newByteLen = remainingBytes;
			if(newByteLen < maxBytesGuarantee) newByteLen = maxBytesGuarantee; // edge case
		}
		// the URL link was found to be too long, so truncate it
		if(newByteLen < byteLen) {
			url = Buffer.from(url).subarray(0, newByteLen).toString();
			tile.url_bytes += newByteLen;
		} else {
			tile.url_bytes += byteLen;
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
	tile.props_updated = true;
	tile.last_accessed = Date.now();

	respData[0] = false;
	respData[1] = true;
	sharedData.updatedTile = tile;
	IOProgress(callID);
}

function setCellProtection(tile, charX, charY, protectType, defaultWritability, canOwner, canMember) {
	var has_modified = false;
	var idx = charY * CONST.tileCols + charX;
	var char_writability = tile.prop_char[idx];
	if(char_writability == null) char_writability = defaultWritability;
	var area_perm = canOwner || (canMember && char_writability < 2);
	if(protectType == 2 && area_perm && canOwner) {
		tile.prop_char[idx] = 2;
		tile.props_updated = true;
		has_modified = true;
	}
	if(protectType == 1 && area_perm && canMember) {
		tile.prop_char[idx] = 1;
		tile.props_updated = true;
		has_modified = true;
	}
	if(protectType == 0 && area_perm && canMember) {
		tile.prop_char[idx] = 0;
		tile.props_updated = true;
		has_modified = true;
	}
	if(protectType == null && area_perm && canMember) {
		tile.prop_char[idx] = null;
		has_modified = true;
		tile.props_updated = true;
	}
	return has_modified;
}

function tileWriteProtections(callID, tile, options) {
	var respData = cids[callID].responseData;
	var sharedData = cids[callID].sharedData;

	var tileX = options.tileX;
	var tileY = options.tileY;
	var charX = options.charX;
	var charY = options.charY;
	var charWidth = options.charWidth;
	var charHeight = options.charHeight;
	var user = options.user;
	var world = options.world;
	var precise = options.precise;
	var protect_type = options.protect_type;

	var feature_perm = world.feature.memberTilesAddRemove;
	var is_owner = options.is_owner;
	var is_member = options.is_member;

	var can_owner = is_owner;
	var can_member = (is_member && feature_perm) || is_owner;

	var tile_writability = tile.writability;
	if(tile_writability == null) tile_writability = world.writability;

	var has_modified = false;

	if(!charWidth || charWidth < 0) charWidth = 1;
	if(!charHeight || charHeight < 0) charHeight = 1;
	if(charWidth > CONST.tileCols) charWidth = CONST.tileCols;
	if(charHeight > CONST.tileRows) charHeight = CONST.tileRows;

	if(precise) {
		// We are unprotecting a cell. The cell's protection level must then
		// match the world's writability, not the tile's.
		var idx = charY * CONST.tileCols + charX;
		var char_writability = tile.prop_char[idx];
		if(char_writability == null) char_writability = tile_writability;
		var area_perm = can_owner || (can_member && char_writability < 2);
		if(protect_type == null && area_perm && can_member) {
			if(tile.writability != null) {
				for(var n = 0; n < tile.prop_char.length; n++) {
					if(tile.prop_char[n] == null) {
						tile.prop_char[n] = tile.writability;
					}
				}
				tile.writability = null;
				tile.writability_updated = true;
				tile.props_updated = true;
			}
		}
		// we may be protecting a range of cells.
		// a single cell counts as a 1x1 region.
		for(var y = 0; y < charHeight; y++) {
			var curCharY = charY + y;
			if(charY >= CONST.tileRows) break;
			for(var x = 0; x < charWidth; x++) {
				var curCharX = charX + x;
				if(charX >= CONST.tileCols) break;
				var stat = setCellProtection(tile, curCharX, curCharY, protect_type, tile_writability, can_owner, can_member);
				if(stat) {
					has_modified = true;
				}
			}
		}
		// all the cells have the same protection level.
		// we can make the tile's writability that value.
		if(tile.prop_char[0] != null && is_consistent(tile.prop_char)) {
			tile.writability = tile.prop_char[0];
			for(var i = 0; i < tile.prop_char.length; i++) {
				tile.prop_char[i] = null;
			}
			has_modified = true;
			tile.props_updated = true;
			tile.writability_updated = true;
		}
	} else {
		var full_protection_complete = true;
		// despite the fact we are setting the protection of a full tile,
		// there may be certain cells that the user doesn't have permission to modify.
		for(var i = 0; i < CONST.tileArea; i++) {
			var char_writability = tile.prop_char[i];
			if(char_writability == null) char_writability = tile_writability;
			var area_perm = can_owner || (can_member && char_writability < 2);
			if(protect_type == 2) {
				if(area_perm && can_owner) {
					tile.prop_char[i] = 2;
					tile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == 1) {
				if(area_perm && can_member) {
					tile.prop_char[i] = 1;
					tile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == 0) {
				if(area_perm && can_member) {
					tile.prop_char[i] = 0;
					tile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == null) {
				if(area_perm && can_member) {
					tile.prop_char[i] = null;
					has_modified = true;
					tile.props_updated = true;
				} else {
					full_protection_complete = false;
				}
			}
		}
		// since the protection level of every cell changed,
		// then all we have to do is change the writability and discard our cell values.
		if(full_protection_complete) {
			for(var i = 0; i < tile.prop_char.length; i++) {
				tile.prop_char[i] = null;
			}
			tile.props_updated = true;
			tile.writability = protect_type;
			tile.writability_updated = true;
		}
	}

	tile.last_accessed = Date.now();

	// no permission to modify
	if(!has_modified) {
		respData[0] = true;
		respData[1] = "PERM";
		IOProgress(callID);
		return;
	}

	respData[0] = false;
	respData[1] = true;
	sharedData.updatedTile = tile;
	IOProgress(callID);
}

function tileWriteClear(callID, tile, options) {
	var sharedData = cids[callID].sharedData;

	var charRange = options.charRange;

	if(!charRange) {
		for(var x = 0; x < CONST.tileArea; x++) {
			tile.content[x] = " ";
			tile.prop_color[x] = 0;
		}
		tile.prop_bgcolor = null;
	
		for(var d in tile.prop_cell_props) {
			delete tile.prop_cell_props[d];
		}
		tile.url_cells = 0;
		tile.url_bytes = 0;
		tile.content_updated = true;
		tile.props_updated = true;
	} else {
		// validated via clear_areas module
		var charX1 = charRange[0];
		var charY1 = charRange[1];
		var charX2 = charRange[2];
		var charY2 = charRange[3];
		for(var y = charY1; y <= charY2; y++) {
			for(var x = charX1; x <= charX2; x++) {
				var idx = y * CONST.tileCols + x;
				tile.content[idx] = " ";
				tile.prop_color[idx] = 0;
				if(tile.prop_bgcolor !== null) {
					tile.prop_bgcolor[idx] = -1;
				}
				if(tile.prop_cell_props[y]) {
					if(tile.prop_cell_props[y][x]) {
						var link = tile.prop_cell_props[y][x].link;
						if(link && link.type == "url") {
							tile.url_cells--;
							tile.url_bytes -= Buffer.byteLength(link.url);
						}
						delete tile.prop_cell_props[y][x];
					}
				}
				
			}
		}
		if(tile.prop_bgcolor !== null && arrayIsEntirely(tile.prop_bgcolor, -1)) {
			tile.prop_bgcolor = null;
		}
	}

	tile.content_updated = true;
	tile.props_updated = true;

	tile.last_accessed = Date.now();

	sharedData.updatedTile = tile;
	IOProgress(callID);
}

function processPendingEdits(worldID, tileX, tileY, pendingEdits) {
	var tile = getCachedTile(worldID, tileX, tileY);
	// the first element of an editData array must be the edit type
	for(var i = 0; i < pendingEdits.length; i++) {
		var editDesc = pendingEdits[i];

		var editType = editDesc[0];
		var callID = editDesc[1];
		var options = editDesc[2];
		var editData = editDesc[3];

		// these should all be synchronous operations
		switch(editType) {
			case types.write:
				tileWriteEdits(callID, tile, options, editData);
				break;
			case types.link:
				tileWriteLinks(callID, tile, options);
				break;
			case types.protect:
				tileWriteProtections(callID, tile, options);
				break;
			case types.clear:
				tileWriteClear(callID, tile, options);
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
		setCachedTile(world_id, tile_x, tile_y, tile);
		processPendingEdits(world_id, tile_x, tile_y, pending_edits);
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

function getCachedTile(worldID, tileX, tileY) {
	var iteratedTileCache = tileIterationTempMem[worldID + "," + tileY + "," + tileX];
	// already exists in the iteration cache. add to main tile cache.
	if(iteratedTileCache) {
		setCachedTile(worldID, tileX, tileY, iteratedTileCache);
		return iteratedTileCache;
	}
	if(!memTileCache[worldID]) return false;
	if(!memTileCache[worldID][tileY]) return false;
	if(!memTileCache[worldID][tileY][tileX]) return false;
	return memTileCache[worldID][tileY][tileX];
}
function setCachedTile(worldID, tileX, tileY, cacheTileData) {
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
function deleteCachedTile(worldID, tileX, tileY) {
	delete memTileCache[worldID][tileY][tileX];
	totalTilesCached--;
	if(!Object.keys(memTileCache[worldID][tileY]).length) delete memTileCache[worldID][tileY];
	if(!Object.keys(memTileCache[worldID]).length) delete memTileCache[worldID];
}

function processTileWriteRequest(call_id, data) {
	var tile_edits = data.tile_edits;
	if(!tile_edits.length) return IOProgress(call_id);
	var world = data.world;

	var buckets = {};
	for(var i = 0; i < tile_edits.length; i++) {
		var edit = tile_edits[i];
		var tileY = edit[0];
		var tileX = edit[1];
		var tup = tileY + "," + tileX;
		if(!buckets[tup]) {
			buckets[tup] = [];
		}
		buckets[tup].push(edit);
	}

	cids[call_id].responseData = [[], data.rejected];
	cids[call_id].total = Object.keys(buckets).length;
	cids[call_id].sharedData = {
		editLog: [],
		updatedTiles: {}
	};
	cids[call_id].completionCall = function() { // when the write is completed
		var sharedData = cids[call_id].sharedData;
		var updatedTiles = sharedData.updatedTiles;
		if(Object.keys(updatedTiles).length > 0) {
			var updTile = [];
			for(var i in updatedTiles) {
				var pos = i.split(",");
				var tileX = parseInt(pos[1]);
				var tileY = parseInt(pos[0]);
				var tile = updatedTiles[i];
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
			for(var i = 0; i < sharedData.editLog.length; i++) {
				var edit = sharedData.editLog[i];
				var tileX = edit[1];
				var tileY = edit[0];
				if(!tileGroups[tileY + "," + tileX]) tileGroups[tileY + "," + tileX] = [];
				tileGroups[tileY + "," + tileX].push(edit);
			}
			for(var i in tileGroups) {
				var pos = i.split(",");
				var tileX = parseInt(pos[1]);
				var tileY = parseInt(pos[0]);
				appendToEditLogQueue(tileX, tileY, 0, JSON.stringify(tileGroups[i]), world.id, Date.now());
			}
		}
	}
	for(var i in buckets) {
		var tup = i.split(",");
		var tileY = parseInt(tup[0]);
		var tileX = parseInt(tup[1]);
		var edits = buckets[i];
		var tile = getCachedTile(world.id, tileX, tileY);
		if(tile) {
			tileWriteEdits(call_id, tile, data, edits);
		} else {
			appendToUnloadedTileCache(world.id, tileX, tileY, [types.write, call_id, data, edits]);
		}
	}
}

function processTileLinkRequest(call_id, data) {
	var world = data.world;
	var tileX = data.tileX;
	var tileY = data.tileY;

	cids[call_id].responseData = [false, false];
	cids[call_id].total = 1;
	cids[call_id].sharedData = {
		updatedTile: null
	};
	cids[call_id].completionCall = function() {
		var updatedTile = cids[call_id].sharedData.updatedTile;
		if(updatedTile) {
			prepareTileUpdateMessage([{tileX, tileY, tile: updatedTile}], world, data.channel);
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
	var tile = getCachedTile(world.id, tileX, tileY);
	if(tile) {
		tileWriteLinks(call_id, tile, data);
	} else {
		appendToUnloadedTileCache(world.id, tileX, tileY, [types.link, call_id, data]);
	}
}

function processTileProtectRequest(call_id, data) {
	var world = data.world;
	var tileX = data.tileX;
	var tileY = data.tileY;

	cids[call_id].responseData = [false, false];
	cids[call_id].total = 1;
	cids[call_id].sharedData = {
		updatedTile: null
	};
	cids[call_id].completionCall = function() {
		var updatedTile = cids[call_id].sharedData.updatedTile;
		if(updatedTile) {
			prepareTileUpdateMessage([{tileX, tileY, tile: updatedTile}], world, data.channel);
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
	var tile = getCachedTile(world.id, tileX, tileY);
	if(tile) {
		tileWriteProtections(call_id, tile, data);
	} else {
		appendToUnloadedTileCache(world.id, tileX, tileY, [types.protect, call_id, data]);
	}
}

function processTileClearRequest(call_id, data) {
	var tileX = data.tileX;
	var tileY = data.tileY;
	var world = data.world;

	cids[call_id].total = 1;
	cids[call_id].sharedData = {
		updatedTile: null
	};
	cids[call_id].completionCall = function() {
		var updatedTile = cids[call_id].sharedData.updatedTile;
		if(updatedTile) {
			prepareTileUpdateMessage([{tileX, tileY, tile: updatedTile}], world, null);
			if(!data.no_log_edits) {
				var editData = "@" + JSON.stringify({
					kind: "clear_tile",
					charRange: data.charRange || void 0
				});
				appendToEditLogQueue(tileX, tileY, 0, editData, world.id, Date.now());
			}
		}
	}
	var tile = getCachedTile(world.id, tileX, tileY);
	if(tile) {
		tileWriteClear(call_id, tile, data);
	} else {
		appendToUnloadedTileCache(world.id, tileX, tileY, [types.clear, call_id, data]);
	}
}

function asyncWait(ms) {
	return new Promise(function(res) {
		setTimeout(res, ms);
	});
}

async function processNextPublicClearBatch(context) {
	var writeQueue = [];
	var chunkSize = 16;
	var data = await db.all("SELECT rowid AS rowid, content, tileX, tileY, properties, writability FROM tile WHERE world_id=? AND (tileY, tileX) > (?, ?) LIMIT ?",
		[context.world.id, context.posY, context.posX, chunkSize]);
	for(var d = 0; d < data.length; d++) {
		var tile = data[d];
		var tileObj = normalizeTile(tile);
		var tileX = tile.tileX;
		var tileY = tile.tileY;
		var dimTile = getCachedTile(context.world.id, tileX, tileY);
		if(dimTile) {
			clearTilePublicContent(context.world, dimTile);
		} else {
			// do not handle tiles that are currently loading
			if(lookupTileQueue(context.world.id + "," + tileX + "," + tileY)) {
				continue;
			}
			tileIterationTempMem[context.world.id + "," + tileY + "," + tileX] = tileObj;
			clearTilePublicContent(context.world, tileObj);
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
		context.suspended = true;
		return;
	}
	var lastTile = data[data.length - 1];
	context.posX = lastTile.tileX;
	context.posY = lastTile.tileY;
}

async function processNextEraseWorldBatch(context) {
	var writeQueue = [];
	var chunkSize = 16;
	var data = await db.all("SELECT tileX, tileY FROM tile WHERE world_id=? AND (tileY, tileX) > (?, ?) LIMIT ?",
		[context.world.id, context.posY, context.posX, chunkSize]);
	for(var i = 0; i < data.length; i++) {
		var coords = data[i];
		var tileX = coords.tileX;
		var tileY = coords.tileY;
		// do not handle tiles that are currently loading
		if(lookupTileQueue(context.world.id + "," + tileX + "," + tileY)) {
			continue;
		}
		var ctile = getCachedTile(context.world.id, tileX, tileY);
		if(ctile) {
			clearTileContent(ctile);
		} else {
			writeQueue.push(["DELETE FROM tile WHERE world_id=? AND tileX=? and tileY=?", [context.world.id, tileX, tileY]]);
		}
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
		context.suspended = true;
		return;
	}
	var lastTile = data[data.length - 1];
	context.posX = lastTile.tileX;
	context.posY = lastTile.tileY;
}

var tileIterationsLoopStarted = false;
async function beginTileIterationsLoop() {
	if(tileIterationsLoopStarted) return;
	tileIterationsLoopStarted = true;
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

		if(context.type == types.publicclear) {
			if(context.index == 0) {
				appendToEditLogQueue(0, 0, context.user.id, "@{\"kind\":\"clear_public\"}", context.world.id, Date.now());
			}
			await processNextPublicClearBatch(context);
		} else if(context.type == types.eraseworld) {
			if(context.index == 0) {
				appendToEditLogQueue(0, 0, context.user.id, "@{\"kind\":\"clear_all\"}", context.world.id, Date.now());
			}
			await processNextEraseWorldBatch(context);
		}

		if(context.suspended) {
			continue;
		}
	
		context.index++;
		tileIterationsIndex++;
		if(tileIterationsIndex >= activeTileIterationsQueue.length) {
			tileIterationsIndex = 0;
		}

		await asyncWait(50);
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

function processPublicClearIteration(call_id, data) {
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
}

function processEraseWorldIteration(call_id, data) {
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
}

function reserveCallId(id) {
	if(!cids[id]) {
		cids[id] = {
			responseCall: null,
			responseData: null,
			completionCall: null,
			total: 0,
			current: 0,
			sharedData: null
		};
	}
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
		var call = cids[id];
		if(call.total && call.current >= call.total) { // I/O is already completed
			if(call.completionCall) { // completion callback
				var completion = call.completionCall;
				call.completionCall = null;
				if(completion) completion();
			}
			delete cids[id];
			res(call.responseData);
		} else {
			call.responseCall = function(resData) {
				delete cids[id];
				res(resData);
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
			processTileWriteRequest(call_id, data);
			break;
		case types.link:
			processTileLinkRequest(call_id, data);
			break;
		case types.protect:
			processTileProtectRequest(call_id, data);
			break;
		case types.clear:
			processTileClearRequest(call_id, data);
			break;
		case types.publicclear:
			processPublicClearIteration(call_id, data);
			break;
		case types.eraseworld:
			processEraseWorldIteration(call_id, data);
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