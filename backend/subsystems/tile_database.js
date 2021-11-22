var db;
var db_edits;
var decodeCharProt;
var handle_error;
var intv;
var wss;
var WebSocket;
var san_nbr;
var fixColors;
var get_bypass_key;
var encodeCharProt;
var advancedSplit;
var change_char_in_array;
var memTileCache;
var parseTextcode;
var broadcastMonitorEvent;

var server_exiting = false;
var editlog_cell_props = false;
var main_world_name = "";

module.exports.main = function(vars) {
	db = vars.db;
	db_edits = vars.db_edits;
	decodeCharProt = vars.decodeCharProt;
	handle_error = vars.handle_error;
	intv = vars.intv;
	wss = vars.wss;
	WebSocket = vars.WebSocket;
	san_nbr = vars.san_nbr;
	fixColors = vars.fixColors;
	get_bypass_key = vars.get_bypass_key;
	encodeCharProt = vars.encodeCharProt;
	advancedSplit = vars.advancedSplit;
	change_char_in_array = vars.change_char_in_array;
	memTileCache = vars.memTileCache;
	parseTextcode = vars.parseTextcode;
	broadcastMonitorEvent = vars.broadcastMonitorEvent;

	databaseClock();

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
	await databaseClock();
}

var tileClientUpdateQueue = {};

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
		updateObj[tileY + "," + tileX] = [tile, channel];
	}
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
		var cliUpdData = {};
		var totalUpdatedTiles = 0;
		for(var coord in worldQueue) {
			var tileUpdate = worldQueue[coord];
			delete worldQueue[coord];
			totalUpdatedTiles++;
			if(totalUpdatedTiles > 100) {
				continue;
			}
			var tile = tileUpdate[0];
			var channel = tileUpdate[1];
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
			if(Object.keys(tile.prop_cell_props).length > 0) {
				properties.cell_props = tile.prop_cell_props;
			}
			cliUpdData[coord] = {
				content,
				properties
			};
		}
		delete tileClientUpdateQueue[world];
		// broadcast to clients
		wss.clients.forEach(function(client) {
			if(!client.sdata.userClient) return;
			if(client.sdata.world.id == worldID && client.readyState == WebSocket.OPEN) {
				try {
					client.send(JSON.stringify({
						channel: channel,
						kind: "tileUpdate",
						source: "write",
						tiles: cliUpdData
					}));
				} catch(e) {
					handle_error(e);
				}
			}
		});
	}
	intv.client_update_clock = setTimeout(sendTileUpdatesToClients, 1000 / 30);
}

// caller ids. this returns information to a request that uploaded the edits to the server
// [response_callback, response_data, completion_callback, total_units, current_units]
// total_units must be >0
var cids = {};

var ratelimits = {};
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
		prop_char: null,
		prop_cell_props: null,

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
		if(parsed_props.char) {
			data.prop_char = decodeCharProt(parsed_props.char);
		} else {
			data.prop_char = new Array(CONST.tileArea).fill(null);
		}
		if(parsed_props.cell_props) {
			data.prop_cell_props = parsed_props.cell_props;
		} else {
			data.prop_cell_props = {};
		}
		data.tile_exists = true;
		data.content = advancedSplit(tile_db_data.content);
		data.writability = tile_db_data.writability;
		data.tile_id = tile_db_data.rowid;
	} else {
		data.prop_color = new Array(CONST.tileArea).fill(0);
		data.prop_char = new Array(CONST.tileArea).fill(null);
		data.prop_cell_props = {};
		data.tile_exists = false;
		data.content = new Array(CONST.tileArea).fill(" ");
		data.writability = null;
		data.tile_id = null;
	}
	return data;
}

async function loadTileCacheData(world_id, tileX, tileY) {
	var tile = await db.get("SELECT rowid as rowid, content, properties, writability FROM tile WHERE tileX=? AND tileY=? AND world_id=?", [tileX, tileY, world_id]);
	return normalize_tile(tile);
}

var fetch_tile_queue = [];
var totalTilesCached = 0;
var tileCacheLimit = 4000;

// This object contains all tiles that are currently loaded during the iteration
// of all tiles in a world. If an edit has been made to a loaded tile, it gets
// added to the central tile cache.
// Unique tile id tuple: "world_id,tile_y,_tile_x"
var tileIterationTempMem = {};

var tileCacheTimeLimit = 1000 * 60 * 1;
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
	broadcastMonitorEvent("[Database] Too many cached tiles detected");
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
	var time = editArray[4];
	var char = editArray[5];
	var editID = editArray[6];
	var color = editArray[7];

	var world = data.world;
	var user = data.user;
	var public_only = data.public_only;
	var preserve_links = data.preserve_links;
	var can_color_text = data.can_color_text;
	var no_log_edits = data.no_log_edits;
	// TODO: move is_owner stuff up a level to write_data.js
	var is_owner = data.is_owner || (user.superuser && world.name == main_world_name);
	var is_member = data.is_member || (user.superuser && world.name == main_world_name);

	var index = charY * CONST.tileCols + charX;
	var char_writability = cacheTile.prop_char[index];

	// permission checking - compute the writability of the cell, accounting for tile and world writing permissions
	if(char_writability == null) char_writability = cacheTile.writability;
	if(char_writability == null) char_writability = world.writability;

	// tile is owner-only, but user is not owner
	if(char_writability == 2 && !is_owner) {
		if(rejected) rejected[editID] = "NO_TILE_PERM";
		IOProgress(callID);
		return;
	}
	// tile is member-only, but user is not member (nor owner)
	if(char_writability == 1 && !is_owner && !is_member) {
		if(rejected) rejected[editID] = "NO_TILE_PERM";
		IOProgress(callID);
		return;
	}

	// this edit request is only allowed to write on public areas
	if(public_only && char_writability != 0) {
		if(rejected) rejected[editID] = "NO_TILE_PERM";
		IOProgress(callID);
		return;
	}

	var char_updated = change_char_in_array(cacheTile.content, char, index);
	if(char_updated) {
		cacheTile.content_updated = true;
	}

	if(!can_color_text) color = 0;
	if(color !== -1) {
		var prevCol = cacheTile.prop_color[index];
		cacheTile.prop_color[index] = color;
		if(prevCol != color) {
			cacheTile.props_updated = true;
			char_updated = true;
		}
	}

	// detect overriden links
	if(!preserve_links) {
		if(cacheTile.prop_cell_props[charY]) {
			// clear properties for this char
			if(cacheTile.prop_cell_props[charY][charX]) {
				delete cacheTile.prop_cell_props[charY][charX];
				cacheTile.props_updated = true;
				char_updated = true;
			}
			// the row for this tile is empty
			if(Object.keys(cacheTile.prop_cell_props[charY]).length == 0) {
				delete cacheTile.prop_cell_props[charY];
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
		sharedObj.editLog.push(ar);
		cacheTile.last_accessed = Date.now();
	}
	if(char_updated) {
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
	var is_member = data.is_member || (user.superuser && world.name == main_world_name);
	var is_owner = data.is_owner || (user.superuser && world.name == main_world_name);
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

	if(!cacheTile.prop_cell_props[charY]) cacheTile.prop_cell_props[charY] = {};
	if(!cacheTile.prop_cell_props[charY][charX]) cacheTile.prop_cell_props[charY][charX] = {};

	if(typeof url != "string") url = "";
	if(type == "url") {
		cacheTile.prop_cell_props[charY][charX].link = {
			type: "url",
			url: url.slice(0, 10000) // size limit of urls
		}
	} else if(type == "coord") {
		cacheTile.prop_cell_props[charY][charX].link = {
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
	var is_owner = data.is_owner || (user.superuser && world.name == main_world_name);
	var is_member = (data.is_member && feature_perm) || is_owner || (user.superuser && world.name == main_world_name);

	var tile_writability = cacheTile.writability;
	if(tile_writability == null) tile_writability = world.writability;

	var has_modified = false;

	if(precise) {
		var idx = charY * CONST.tileCols + charX;
		var char_writability = cacheTile.prop_char[idx];
		if(char_writability == null) char_writability = tile_writability;
		var area_perm = is_owner || (is_member && char_writability < 2);
		if(protect_type == 2 && area_perm && is_owner) {
			cacheTile.prop_char[idx] = 2;
			cacheTile.props_updated = true;
			has_modified = true;
		}
		if(protect_type == 1 && area_perm && is_member) {
			cacheTile.prop_char[idx] = 1;
			cacheTile.props_updated = true;
			has_modified = true;
		}
		if(protect_type == 0 && area_perm && is_member) {
			cacheTile.prop_char[idx] = 0;
			cacheTile.props_updated = true;
			has_modified = true;
		}
		if(protect_type == null && area_perm && is_member) {
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
			var area_perm = is_owner || (is_member && char_writability < 2);
			if(protect_type == 2) {
				if(area_perm && is_owner) {
					cacheTile.prop_char[i] = 2;
					cacheTile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == 1) {
				if(area_perm && is_member) {
					cacheTile.prop_char[i] = 1;
					cacheTile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == 0) {
				if(area_perm && is_member) {
					cacheTile.prop_char[i] = 0;
					cacheTile.props_updated = true;
					has_modified = true;
				} else {
					full_protection_complete = false;
				}
			}
			if(protect_type == null) {
				if(area_perm && is_member) {
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

	var tileX = data.tileX;
	var tileY = data.tileY;
	var user = data.user;
	var world = data.world;
	var date = data.date;

	for(var x = 0; x < CONST.tileArea; x++) {
		cacheTile.content[x] = " ";
		cacheTile.prop_color[x] = 0;
	}
	for(var d in cacheTile.prop_cell_props) {
		delete cacheTile.prop_cell_props[d];
	}

	cacheTile.content_updated = true;
	cacheTile.props_updated = true;
	cacheTile.last_accessed = Date.now();

	sharedObj.tile = cacheTile;
	IOProgress(callID);
}

function processTileEdit(worldID, tileX, tileY, editData) {
	var cacheTile = isTileDIM(worldID, tileX, tileY);
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
			var resp = await db.run(sql, params);
			if(callback) callback(resp);
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
	var writeQueue = [];
	for(var worldID in memTileCache) {
		for(var tileY in memTileCache[worldID]) {
			for(var tileX in memTileCache[worldID][tileY]) {
				let tile = memTileCache[worldID][tileY][tileX];
				if(!tile.props_updated && !tile.content_updated && !tile.writability_updated) continue;
				if(tile.tile_exists) {
					if(tile.props_updated) {
						tile.props_updated = false;
						var propObj = {};
						if(!arrayIsEntirely(tile.prop_color, 0)) {
							propObj.color = tile.prop_color;
						}
						if(!arrayIsEntirely(tile.prop_char, null)) {
							propObj.char = encodeCharProt(tile.prop_char);
						}
						if(Object.keys(tile.prop_cell_props).length > 0) {
							propObj.cell_props = tile.prop_cell_props;
						}
						writeQueue.push(["UPDATE tile SET properties=? WHERE rowid=?", [JSON.stringify(propObj), tile.tile_id]]);
					}
					if(tile.content_updated) {
						tile.content_updated = false;
						writeQueue.push(["UPDATE tile SET content=? WHERE rowid=?", [tile.content.join(""), tile.tile_id]]);
					}
					if(tile.writability_updated) {
						tile.writability_updated = false;
						writeQueue.push(["UPDATE tile SET writability=? WHERE rowid=?", [tile.writability, tile.tile_id]]);
					}
				} else {
					tile.props_updated = false;
					tile.content_updated = false;
					tile.writability_updated = false;
					var propObj = {};
					if(!arrayIsEntirely(tile.prop_color, 0)) {
						propObj.color = tile.prop_color;
					}
					if(!arrayIsEntirely(tile.prop_char, null)) {
						propObj.char = encodeCharProt(tile.prop_char);
					}
					if(Object.keys(tile.prop_cell_props).length > 0) {
						propObj.cell_props = tile.prop_cell_props;
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
	var eLogLen = editLogQueue.length;
	var editTransaction = false;
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
		var date = edit[5];
		await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)", [user, worldID, tileY, tileX, date, data]);
	}
	if(editTransaction) await db_edits.run("COMMIT");
}

var databaseBusy = false;
async function databaseClock(serverExit) {
	if(databaseBusy) return;
	databaseBusy = true;
	try {
		await iterateDatabaseChanges();
		broadcastMonitorEvent("[Database] Clock cycle executed");
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
			cids[call_id][1] = [[], {}];
			cids[call_id][3] = tile_edits.length;
			var sharedObj = {
				editLog: [],
				tileUpdates: {}
			};
			cids[call_id][2] = function() {
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
					appendToEditLogQueue(tileX, tileY, 0, "@{\"kind\":\"clear_public\"}", world.id, Date.now());
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
	var chunkSize = 2048;
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
		}

		var writeQueue = [];
		if(context.type == types.publicclear) {
			var data = await db.all("SELECT rowid as rowid, content, tileX, tileY, properties, writability FROM tile WHERE world_id=? LIMIT ?,?",
				[context.world.id, context.index * chunkSize, chunkSize]);
			if(!data || data.length == 0) {
				activeTileIterationsQueue.splice(tileIterationsIndex, 1);
				IOProgress(context.call_id);
				if(tileIterationsIndex >= activeTileIterationsQueue.length) {
					tileIterationsIndex = 0;
				}
				continue;
			}
			var tempTileCache = {};
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
							dimTile.content_updated = true;
							dimTile.props_updated = true;
							if(dimTile.prop_cell_props[charY]) {
								if(dimTile.prop_cell_props[charY][charX]) {
									delete dimTile.prop_cell_props[charY][charX];
								}
								if(Object.keys(dimTile.prop_cell_props[charY]).length == 0) {
									delete dimTile.prop_cell_props[charY];
								}
							}
						}
					}
					dimTile.last_accessed = Date.now();
				} else {
					if(lookupTileQueue(context.world.id + "," + tileX + "," + tileY)) {
						continue;
					}
					tileIterationTempMem[context.world.id + "," + tileY + "," + tileX] = tileObj;
					tempTileCache[tileY + "," + tileX] = tileObj;
					for(var i = 0; i < tileObj.content.length; i++) {
						var charX = i % CONST.tileCols;
						var charY = Math.floor(i / CONST.tileCols);
						var cellProt = tileObj.prop_char[i];
						if(cellProt == null) cellProt = tileObj.writability;
						if(cellProt == null) cellProt = context.world.writability;
						if(cellProt == 0) {
							tileObj.content[i] = " ";
							tileObj.prop_color[i] = 0;
							if(tileObj.prop_cell_props[charY]) {
								if(tileObj.prop_cell_props[charY][charX]) {
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
					if(tileObj.props_updated) {
						tileObj.props_updated = false;
						var propObj = {};
						if(!arrayIsEntirely(tileObj.prop_color, 0)) {
							propObj.color = tileObj.prop_color;
						}
						if(!arrayIsEntirely(tileObj.prop_char, null)) {
							propObj.char = encodeCharProt(tileObj.prop_char);
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
		} else if(context.type == types.eraseworld) {
			var data = await db.all("SELECT tileX, tileY FROM tile WHERE world_id=? LIMIT ?,?", [context.world.id, context.index * chunkSize, chunkSize]);
			if(!data || data.length == 0) {
				activeTileIterationsQueue.splice(tileIterationsIndex, 1);
				IOProgress(context.call_id);
				if(tileIterationsIndex >= activeTileIterationsQueue.length) {
					tileIterationsIndex = 0;
				}
				continue;
			}
			var localTiles = {};
			for(var i = 0; i < data.length; i++) {
				var coords = data[i];
				var tileX = coords.tileX;
				var tileY = coords.tileY;
				if(lookupTileQueue(context.world.id + "," + tileX + "," + tileY)) {
					continue;
				}
				localTiles[tileY + "," + tileX] = 1;
				writeQueue.push(["DELETE FROM tile WHERE world_id=? AND tileX=? and tileY=?", [context.world.id, tileX, tileY]]);
			}
			// begin to delete tiles from memory
			for(var i in localTiles) {
				var pos = i.split(",");
				var tileX = parseInt(pos[1]);
				var tileY = parseInt(pos[0]);
				var ctile = isTileDIM(context.world.id, tileX, tileY);
				if(!ctile) continue;
				ctile.tile_exists = false;
				ctile.tile_id = null;
				ctile.prop_cell_props = {};
				for(var x = 0; x < CONST.tileArea; x++) {
					ctile.content[x] = " ";
					ctile.prop_char[x] = null;
					ctile.prop_color[x] = 0;
					ctile.writability = null;
				}
				ctile.content_updated = true;
				ctile.writability_updated = true;
				ctile.props_updated = true;
			}
			if(writeQueue.length) {
				await bulkWriteEdits(writeQueue);
			}
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

function processComplexRequest(call_id, type, data) {
	switch(type) {
		case types.paste:
			var world = data.world;
			var user = data.user;

			var is_owner = data.is_owner;
			var is_member = data.is_member;
			var tileX = data.tileX;
			var tileY = data.tileY;
			var charX = data.charX;
			var charY = data.charY;
			var can_color_text = data.can_color_text;
			var text = data.text;

			var parsed_text = parseTextcode(text);
			var promiseList = [];
			var modifiedTiles = {};

			var editList = [];
			var len = parsed_text.text.length;
			var text = parsed_text.text;
			var color = parsed_text.color;
			var cur_tileX = tileX;
			var cur_tileY = tileY;
			var cur_charX = charX;
			var cur_charY = charY;
			var date = Date.now();
			var editIdx = 1;
			for(var x = 0; x < len; x++) {
				var chr = text[x];
				var col = color[x];
				if(chr != "\n" && chr != "\r") {
					if(chr.length > 0) {
						modifiedTiles[cur_tileY + "," + cur_tileX] = 1;
						editList.push([cur_tileY, cur_tileX, cur_charY, cur_charX, date, chr, editIdx++, col]);
					}
					cur_charX++;
					if(cur_charX >= CONST.tileCols) {
						cur_charX = 0;
						cur_tileX++;
					}
				} else {
					cur_tileX = tileX;
					cur_charX = charX;
					cur_charY++;
					if(cur_charY >= CONST.tileRows) {
						cur_charY = 0;
						cur_tileY++;
					}
				}
			}

			var writeCallID = module.exports.newCallId();
			module.exports.reserveCallId(writeCallID);
			module.exports.write(writeCallID, types.write, {
				date,
				tile_edits: editList,
				user, world, is_owner, is_member,
				can_color_text,
				public_only: false,
				no_log_edits: false,
				preserve_links: false,
				channel: "00000000000000",
				no_update: true
			});
			promiseList.push(module.exports.editResponse(writeCallID));

			for(var i = 0; i < parsed_text.prot.length; i++) {
				var prot = parsed_text.prot[i];
				var pcid = module.exports.newCallId();
				module.exports.reserveCallId(pcid);
				modifiedTiles[prot[2] + "," + prot[1]] = 1;
				var pos = coordinateAdd(tileX, tileY, charX, charY, prot[1], prot[2], prot[3], prot[4]);
				module.exports.write(pcid, types.protect, {
					tileX: san_nbr(pos[0]),
					tileY: san_nbr(pos[1]),
					charX: pos[2],
					charY: pos[3],
					user, world, is_member, is_owner,
					precise: true,
					protect_type: prot[0],
					channel: "00000000000000",
					no_log_edits: false,
					no_update: true
				});
				promiseList.push(module.exports.editResponse(pcid));
			}

			for(var i = 0; i < parsed_text.link.length; i++) {
				var link = parsed_text.link[i];
				var pcid = module.exports.newCallId();
				module.exports.reserveCallId(pcid);
				modifiedTiles[link[2] + "," + link[1]] = 1;
				var pos = coordinateAdd(tileX, tileY, charX, charY, link[1], link[2], link[3], link[4]);
				var l_type = link[0];
				var l_url = void 0;
				var l_link_tileX = void 0;
				var l_link_tileY = void 0;
				if(l_type == "url") {
					l_url = link[5];
				} else if(l_type == "coord") {
					l_link_tileX = link[5];
					l_link_tileY = link[6];
				}
				module.exports.write(pcid, types.link, {
					tileX: san_nbr(pos[0]),
					tileY: san_nbr(pos[1]),
					charX: pos[2],
					charY: pos[3],
					user, world, is_member, is_owner,
					type: l_type,
					url: l_url,
					link_tileX: l_link_tileX,
					link_tileY: l_link_tileY,
					channel: "00000000000000",
					no_log_edits: false,
					no_update: true
				});
				promiseList.push(module.exports.editResponse(pcid));
			}

			Promise.all(promiseList).then(function(e) {
				var updatedTiles = [];
				for(var coord in modifiedTiles) {
					var pos = coord.split(",");
					var tileY = parseInt(pos[0]);
					var tileX = parseInt(pos[1]);
					var dimTile = isTileDIM(world.id, tileX, tileY);
					if(!dimTile) continue;
					updatedTiles.push({
						tileX,
						tileY,
						tile: dimTile
					});
				}
				if(updatedTiles.length > 0) {
					prepareTileUpdateMessage(updatedTiles, world, "00000000000000");
				}
				IOProgress(call_id);
			}).catch(function(e) {
				handle_error(e);
				IOProgress(call_id);
			});
	}
}

module.exports.editResponse = async function(id) {
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

module.exports.write = function(call_id, type, data) {
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
		case types.paste:
			processComplexRequest(call_id, type, data);
			break;
		default:
			break;
	}
}

module.exports.reserveCallId = function(id) {
	if(!cids[id]) cids[id] = [null, null, null, 0, 0];
}

var current_call_id = 0;
module.exports.newCallId = function() {
	return current_call_id++;
}

var types_enum = 0;
var types = {
	none: types_enum++,
	write: types_enum++,
	link: types_enum++,
	protect: types_enum++,
	clear: types_enum++,
	publicclear: types_enum++,
	paste: types_enum++,
	eraseworld: types_enum++
};

module.exports.types = types;