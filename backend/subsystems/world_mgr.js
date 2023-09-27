var crypto = require("crypto");

var intv;
var handle_error;
var db;
var broadcastMonitorEvent;

var server_exiting = false;

module.exports.main = async function(server) {
	intv = server.intv;
	handle_error = server.handle_error;
	db = server.db;
	broadcastMonitorEvent = server.broadcastMonitorEvent;

	intv.worldCacheInvalidation = setInterval(function() {
		invalidateWorldCache();
	}, 1000 * 60); // 1 minute

	worldDatabaseClock();
}

module.exports.server_exit = async function() {
	server_exiting = true;
	
	await worldDatabaseClock();
}

var worldDatabaseBusy = false;
var worldsCommittedInPeriod = 0;
async function worldDatabaseClock(serverExit) {
	if(worldDatabaseBusy) return;
	worldDatabaseBusy = true;
	try {
		await commitAllWorlds();
		broadcastMonitorEvent("Worlds", "Committed world metadata (" + worldsCommittedInPeriod + " worlds)");
		worldsCommittedInPeriod = 0;
	} catch(e) {
		handle_error(e, true);
	}
	worldDatabaseBusy = false;
	if(server_exiting) {
		if(!serverExit) await worldDatabaseClock(true);
	} else {
		intv.world_database_clock = setTimeout(worldDatabaseClock, 1000 * 5);
	}
}

var worldCache = {};
var worldFetchQueueIndex = {};
var worldRenameMap = {};

/*
	To avoid lengthy database migrations, it's advisable to place new prop fields in
	this object and update accordingly for the rest of this file.
	Subsequently, you should pay close attention to the frontend/backend of the
	configure page, yourworld.js, and world_props.js

	These properties are not present by default unless its value deviates from its default value.
*/
var world_default_props = {
	views: 0,
	chat_permission: 0,
	show_cursor: -1,
	color_cell: -1,
	color_text: 0,
	quick_erase: 2,
	custom_menu_color: "",
	custom_public_text_color: "",
	custom_member_text_color: "",
	custom_owner_text_color: "",
	page_is_nsfw: false,
	square_chars: false,
	no_log_edits: false,
	no_chat_global: false,
	no_copy: false,
	half_chars: false,
	char_rate: "",
	mem_key: "",
	background: "",
	background_x: 0,
	background_y: 0,
	background_w: 0,
	background_h: 0,
	background_rmod: 0,
	background_alpha: 1,
	default_script_path: "",
	meta_desc: "",
	priv_note: "",
	write_int: -1,
	ownership_change_date: 0
};

function validateWorldname(name) {
	return /^([\w\.\-]*)$/g.test(name);
}

function sanitizeWorldname(name) {
	if(typeof name != "string") return null;
	if(name.charAt(0) == "/") name = name.slice(1);
	if(name.charAt(name.length - 1) == "/") name = name.slice(0, -1);
	name = name.split("/");
	for(var i = 0; i < name.length; i++) {
		var segment = name[i];
		if(!validateWorldname(segment)) return null;
	}
	return name;
}

async function insertWorld(name) {
	var date = Date.now();
			
	var feature_go_to_coord = 0;
	var feature_membertiles_addremove = false;
	var feature_paste = 0;
	var feature_coord_link = 1;
	var feature_url_link = 0;
	var custom_bg = "";
	var custom_cursor = "";
	var custom_guest_cursor = "";
	var custom_color = "";
	var custom_tile_owner = "";
	var custom_tile_member = "";
	var writability = 0;
	var readability = 0;
	var properties = JSON.stringify({});

	var rw = await db.run("INSERT INTO world VALUES(null, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
		name, date,
		feature_go_to_coord, feature_membertiles_addremove, feature_paste, feature_coord_link, feature_url_link,
		custom_bg, custom_cursor, custom_guest_cursor, custom_color, custom_tile_owner, custom_tile_member,
		writability, readability, properties
	]);
	var worldId = await db.get("SELECT * FROM world WHERE id=?", rw.lastID);
	return worldId;
}

async function fetchWorld(name) {
	var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", name);
	return world;
}
async function fetchWorldMembersById(worldId) {
	var members = await db.all("SELECT * FROM whitelist WHERE world_id=?", worldId);
	return members;
}

function getWorldNameFromCacheById(id) {
	for(var i in worldCache) {
		if(worldCache[i].id == id) {
			return worldCache[i].name;
		}
	}
	return "UNKNOWN~" + id;
}

function makeWorldObject() {
	// return world object with all values "zeroed" (not default, i.e. number -> 0, string -> "", boolean -> false)
	var world = {
		exists: false,
		id: null, // integer
		name: "", // raw db name
		ownerId: null, // integer (classic account system); string (uvias account system)
		creationDate: 0,
		ownershipChangeDate: 0,
		views: 0,
		feature: {
			goToCoord: 0,
			memberTilesAddRemove: false,
			paste: 0,
			coordLink: 0,
			urlLink: 0,
			chat: 0,
			showCursor: 0,
			colorText: 0,
			colorCell: 0,
			quickErase: 0
		},
		theme: {
			bg: "",
			cursor: "",
			guestCursor: "",
			color: "",
			tileOwner: "",
			tileMember: "",
			menu: "",
			publicText: "",
			memberText: "",
			ownerText: ""
		},
		opts: {
			nsfw: false,
			squareChars: false,
			noLogEdits: false,
			noChatGlobal: false,
			noCopy: false,
			halfChars: false,
			charRate: "",
			writeInt: 0,
			memKey: "",
			privNote: "",
			desc: "",
			defaultScriptPath: ""
		},
		background: {
			url: "",
			x: 0,
			y: 0,
			w: 0,
			h: 0,
			rmod: 0,
			alpha: 0
		},
		writability: 0,
		readability: 0,
		members: {
			map: {}, // hash-map of member user-ids
			updates: {} // membership updates in database
		},
		modifications: {},
		lastAccessed: 0,
		handles: 0 // Safe to GC if 'handles' is 0, increments if sockets have a handle on the object
	};
	return world;
}

// Returns: Bool (has changed?)
function modifyWorldProp(wobj, path, value) {
	// Iterate through the world object using the path, and set the value
	var objPath = path.split("/");
	var objPos = wobj;
	for(var i = 0; i < objPath.length - 1; i++) {
		objPos = objPos[objPath[i]];
	}
	var oldVal = objPos[objPath[objPath.length - 1]];
	objPos[objPath[objPath.length - 1]] = value;
	// Don't GC if other worlds still have cache in memory
	wobj.modifications[path] = true;
	return oldVal != value;
}

function getAndProcWorldProp(wprops, propName) {
	if(propName in wprops) {
		return wprops[propName];
	}
	return world_default_props[propName];
}

function normWorldProp(val, propName) {
	if(world_default_props[propName] == val) {
		return void 0;
	}
	return val;
}

function loadWorldIntoObject(world, wobj) {
	var wprops = JSON.parse(world.properties);

	wobj.id = world.id;
	wobj.name = world.name;
	wobj.ownerId = world.owner_id;
	wobj.creationDate = world.created_at;
	wobj.ownershipChangeDate = getAndProcWorldProp(wprops, "ownership_change_date");
	
	wobj.writability = world.writability;
	wobj.readability = world.readability;

	wobj.feature.goToCoord = world.feature_go_to_coord;
	wobj.feature.memberTilesAddRemove = Boolean(world.feature_membertiles_addremove);
	wobj.feature.paste = world.feature_paste;
	wobj.feature.coordLink = world.feature_coord_link;
	wobj.feature.urlLink = world.feature_url_link;
	wobj.feature.chat = getAndProcWorldProp(wprops, "chat_permission");
	wobj.feature.showCursor = getAndProcWorldProp(wprops, "show_cursor");
	wobj.feature.colorText = getAndProcWorldProp(wprops, "color_text");
	wobj.feature.colorCell = getAndProcWorldProp(wprops, "color_cell");
	wobj.feature.quickErase = getAndProcWorldProp(wprops, "quick_erase");

	wobj.theme.bg = world.custom_bg;
	wobj.theme.cursor = world.custom_cursor;
	wobj.theme.guestCursor = world.custom_guest_cursor;
	wobj.theme.color = world.custom_color;
	wobj.theme.tileOwner = world.custom_tile_owner;
	wobj.theme.tileMember = world.custom_tile_member;
	wobj.theme.menu = getAndProcWorldProp(wprops, "custom_menu_color");
	wobj.theme.publicText = getAndProcWorldProp(wprops, "custom_public_text_color");
	wobj.theme.memberText = getAndProcWorldProp(wprops, "custom_member_text_color");
	wobj.theme.ownerText = getAndProcWorldProp(wprops, "custom_owner_text_color");

	wobj.opts.nsfw = getAndProcWorldProp(wprops, "page_is_nsfw");
	wobj.opts.squareChars = getAndProcWorldProp(wprops, "square_chars");
	wobj.opts.noLogEdits = getAndProcWorldProp(wprops, "no_log_edits");
	wobj.opts.noChatGlobal = getAndProcWorldProp(wprops, "no_chat_global");
	wobj.opts.noCopy = getAndProcWorldProp(wprops, "no_copy");
	wobj.opts.halfChars = getAndProcWorldProp(wprops, "half_chars");
	wobj.opts.charRate = getAndProcWorldProp(wprops, "char_rate");
	wobj.opts.memKey = getAndProcWorldProp(wprops, "mem_key");
	wobj.opts.desc = getAndProcWorldProp(wprops, "meta_desc");
	wobj.opts.privNote = getAndProcWorldProp(wprops, "priv_note");
	wobj.opts.writeInt = getAndProcWorldProp(wprops, "write_int");
	wobj.opts.defaultScriptPath = getAndProcWorldProp(wprops, "default_script_path");

	wobj.background.url = getAndProcWorldProp(wprops, "background");
	wobj.background.x = getAndProcWorldProp(wprops, "background_x");
	wobj.background.y = getAndProcWorldProp(wprops, "background_y");
	wobj.background.w = getAndProcWorldProp(wprops, "background_w");
	wobj.background.h = getAndProcWorldProp(wprops, "background_h");
	wobj.background.rmod = getAndProcWorldProp(wprops, "background_rmod");
	wobj.background.alpha = getAndProcWorldProp(wprops, "background_alpha");

	wobj.views = getAndProcWorldProp(wprops, "views");
}

// either returns world-object or null
async function getWorld(name, canCreate) {
	if(typeof name != "string") name = "";
	var worldHash = name.toUpperCase();
	// yield to world-rename operations
	if(worldRenameMap[worldHash]) {
		var qobj = worldRenameMap[worldHash];
		return new Promise(function(res) {
			qobj.promises.push(res);
		});
	}
	// yield to operations that are already fetching the world
	if(worldFetchQueueIndex[worldHash]) {
		var qobj = worldFetchQueueIndex[worldHash];
		return new Promise(function(res) {
			qobj.promises.push({
				promise: res,
				creatable: canCreate
			});
		});
	}
	var cacheObject = worldCache[worldHash];
	// retrieve from cache; if a world can be created but it's marked as nonexistant in cache, then create it
	if(cacheObject) {
		if(!cacheObject.exists) {
			if(canCreate) {
				delete worldCache[worldHash];
			} else {
				return null;
			}
		} else {
			cacheObject.handles++;
			cacheObject.lastAccessed = Date.now();
			return cacheObject;
		}
	}
	var qobj = {
		promises: [] // to be resolved after loading
	};
	worldFetchQueueIndex[worldHash] = qobj;
	var world = await fetchWorld(name);
	if(world) {
		var wobj = makeWorldObject();

		loadWorldIntoObject(world, wobj);
		wobj.exists = true;

		worldCache[worldHash] = wobj;
		var resQueue = worldFetchQueueIndex[worldHash].promises;

		// load all member ids
		var members = await fetchWorldMembersById(world.id);
		var map = {};
		for(var i = 0; i < members.length; i++) {
			var key = members[i].user_id;
			map[key] = true;
		}
		wobj.members.map = map;
		wobj.lastAccessed = Date.now();

		for(var i = 0; i < resQueue.length; i++) {
			var queueRes = resQueue[i];
			wobj.handles++;
			queueRes.promise(wobj);
		}
		delete worldFetchQueueIndex[worldHash];
		wobj.handles++;
		return wobj;
	} else {
		var wobj = null;
		if(!canCreate) {
			wobj = makeWorldObject();
			wobj.exists = false;
			worldCache[worldHash] = wobj;
			var resQueue = worldFetchQueueIndex[worldHash].promises;
			delete worldFetchQueueIndex[worldHash];
			var hasConvertedToCreatable = false;
			// If the world does not exist with canCreate set to false, but a function has tried to fetch it with
			// canCreate set to true, then re-fetch the world for all calls with canCreate set to true.
			for(var i = 0; i < resQueue.length; i++) {
				var queueRes = resQueue[i];
				if(queueRes.creatable) {
					hasConvertedToCreatable = true;
					break;
				}
			}
			for(var i = 0; i < resQueue.length; i++) {
				var queueRes = resQueue[i];
				if(hasConvertedToCreatable) {
					queueRes.promise(await getWorld(name, true));
				} else {
					queueRes.promise(null);
				}
			}
			if(hasConvertedToCreatable) {
				return await getWorld(name, true);
			} else {
				return null;
			}
		}
		var worldRow = await insertWorld(name);
		wobj = makeWorldObject();
		loadWorldIntoObject(worldRow, wobj);
		wobj.exists = true;
		wobj.lastAccessed = Date.now();
		worldCache[worldHash] = wobj;
		var resQueue = worldFetchQueueIndex[worldHash].promises;
		for(var i = 0; i < resQueue.length; i++) {
			var queueRes = resQueue[i];
			wobj.handles++;
			queueRes.promise(wobj);
		}
		delete worldFetchQueueIndex[worldHash];
		wobj.handles++;
		return wobj;
	}
}

async function commitWorld(world) {
	var upd = world.modifications;

	var worldId = world.id;

	var propVals = [
		"feature/chat",
		"feature/showCursor",
		"feature/colorText",
		"feature/colorCell",
		"feature/quickErase",
		"theme/menu",
		"theme/publicText",
		"theme/memberText",
		"theme/ownerText",
		"opts/nsfw",
		"opts/squareChars",
		"opts/noLogEdits",
		"opts/noChatGlobal",
		"opts/noCopy",
		"opts/halfChars",
		"opts/charRate",
		"opts/memKey",
		"opts/desc",
		"opts/privNote",
		"opts/writeInt",
		"opts/defaultScriptPath",
		"background/url",
		"background/x",
		"background/y",
		"background/w",
		"background/h",
		"background/rmod",
		"background/alpha",
		"views",
		"ownershipChangeDate"
	];

	var properties = {
		chat_permission: world.feature.chat,
		show_cursor: world.feature.showCursor,
		color_text: world.feature.colorText,
		color_cell: world.feature.colorCell,
		quick_erase: world.feature.quickErase,
		custom_menu_color: world.theme.menu,
		custom_public_text_color: world.theme.publicText,
		custom_member_text_color: world.theme.memberText,
		custom_owner_text_color: world.theme.ownerText,
		page_is_nsfw: world.opts.nsfw,
		square_chars: world.opts.squareChars,
		no_log_edits: world.opts.noLogEdits,
		no_chat_global: world.opts.noChatGlobal,
		no_copy: world.opts.noCopy,
		half_chars: world.opts.halfChars,
		char_rate: world.opts.charRate,
		mem_key: world.opts.memKey,
		meta_desc: world.opts.desc,
		priv_note: world.opts.privNote,
		write_int: world.opts.writeInt,
		background: world.background.url,
		background_x: world.background.x,
		background_y: world.background.y,
		background_w: world.background.w,
		background_h: world.background.h,
		background_rmod: world.background.rmod,
		background_alpha: world.background.alpha,
		default_script_path: world.opts.defaultScriptPath,
		views: world.views,
		ownership_change_date: world.ownershipChangeDate
	};

	// if a property is a default value, delete it from the world's config object
	for(var prop in properties) {
		properties[prop] = normWorldProp(properties[prop], prop);
	}

	var colVals = [
		"ownerId",
		"writability",
		"readability",
		"feature/goToCoord",
		"feature/memberTilesAddRemove",
		"feature/paste",
		"feature/coordLink",
		"feature/urlLink",
		"theme/bg",
		"theme/cursor",
		"theme/guestCursor",
		"theme/color",
		"theme/tileOwner",
		"theme/tileMember"
	];

	var cols = {
		owner_id: world.ownerId,
		writability: world.writability,
		readability: world.readability,
		feature_go_to_coord: world.feature.goToCoord,
		feature_membertiles_addremove: Number(world.feature.memberTilesAddRemove),
		feature_paste: world.feature.paste,
		feature_coord_link: world.feature.coordLink,
		feature_url_link: world.feature.urlLink,
		custom_bg: world.theme.bg,
		custom_cursor: world.theme.cursor,
		custom_guest_cursor: world.theme.guestCursor,
		custom_color: world.theme.color,
		custom_tile_owner: world.theme.tileOwner,
		custom_tile_member: world.theme.tileMember
	};

	var propUpd = false;
	var colUpd = false;

	for(var p = 0; p < propVals.length; p++) {
		var key = propVals[p];
		if(upd[key]) {
			propUpd = true;
			delete upd[key];
		}
	}

	for(var p = 0; p < colVals.length; p++) {
		var key = colVals[p];
		if(upd[key]) {
			colUpd = true;
			delete upd[key];
		}
	}

	if(propUpd) {
		var propStr = JSON.stringify(properties);
		await db.run("UPDATE world SET properties=? WHERE id=?", [propStr, worldId]);
	}
	if(colUpd) {
		await db.run(`
			UPDATE world SET (
				owner_id, feature_go_to_coord, feature_membertiles_addremove,
				feature_paste, feature_coord_link, feature_url_link, custom_bg,
				custom_cursor, custom_guest_cursor, custom_color, custom_tile_owner,
				custom_tile_member, writability, readability
			) = (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) WHERE id=?
		`, [
			cols.owner_id, cols.feature_go_to_coord, cols.feature_membertiles_addremove,
			cols.feature_paste, cols.feature_coord_link, cols.feature_url_link, cols.custom_bg,
			cols.custom_cursor, cols.custom_guest_cursor, cols.custom_color, cols.custom_tile_owner,
			cols.custom_tile_member, cols.writability, cols.readability,
			worldId
		]);
	}

	var dbQueries = [];
	// perform membership updates
	var memUpd = world.members.updates;
	for(var uid in memUpd) {
		var upd = memUpd[uid];
		delete memUpd[uid];
		if(upd.type == "REMOVE") {
			dbQueries.push(["DELETE FROM whitelist WHERE user_id=? AND world_id=?", [uid, worldId]]);
		} else if(upd.type == "ADD") {
			dbQueries.push(["INSERT INTO whitelist VALUES(null, ?, ?, ?)", [uid, worldId, upd.date]]);
		}
	}
	for(var i = 0; i < dbQueries.length; i++) {
		var query = dbQueries[i];
		var sql = query[0];
		var arg = query[1];
		await db.run(sql, arg);
	}

	// this world has made at least one DB update during this period
	if(propUpd || colUpd || dbQueries.length) {
		worldsCommittedInPeriod++;
	}
}

async function commitAllWorlds() {
	var updateResp = [];
	for(var worldName in worldCache) {
		var world = worldCache[worldName];
		if(!world.exists) continue;
		var updProm = commitWorld(world);
		updateResp.push(updProm);
	}
	try {
		await Promise.all(updateResp);
	} catch(e) {
		handle_error(e, true);
	}
}

function invalidateWorldCache() {
	for(var worldName in worldCache) {
		var world = worldCache[worldName];
		if(!world.exists) {
			delete worldCache[worldName];
			continue;
		}
		if(world.handles != 0) {
			continue;
		}
		var modLen = Object.keys(world.modifications).length;
		if(modLen > 0) continue;
		var memModLen = Object.keys(world.members.updates).length;
		if(memModLen > 0) continue;
		if(!world.lastAccessed) continue;
		var accDiff = Date.now() - world.lastAccessed;
		if(accDiff >= 1000 * 60 * 5) {
			delete worldCache[worldName];
		}
	}
}

function releaseWorld(obj) {
	if(!obj) return;
	obj.handles--;
	if(obj.handles < 0) {
		console.log("World handle corruption", obj);
	}
}
function isSpecialNamespace(world) {
	world = sanitizeWorldname(world);
	if(!world) return false;
	return world[0].toLowerCase() == "w";
}

async function getOrCreateWorld(name, mustCreate) {
	if(typeof name != "string") name = "";
	var canCreate = true;
	if(!name.match(/^([\w\.\-]*)$/g)) {
		canCreate = false;
	}
	if(isSpecialNamespace(name)) {
		canCreate = true;
	}
	if(name.length > 10000) {
		canCreate = false;
	}
	return await getWorld(name, canCreate || mustCreate);
}

async function fetchWorldMembershipsByUserId(userId) {
	// pull membership information from the database and the cache
	var whitelists = await db.all("SELECT * FROM whitelist WHERE user_id=?", userId);
	var memberWorldIds = {};
	for(var i = 0; i < whitelists.length; i++) {
		memberWorldIds[whitelists[i].world_id] = 1;
	}
	for(var i in worldCache) {
		var wobj = worldCache[i];
		if(!wobj.exists) continue;
		if(wobj.members.map[userId]) {
			memberWorldIds[wobj.id] = 1;
		} else {
			delete memberWorldIds[wobj.id];
		}
	}
	return Object.keys(memberWorldIds);
}

async function fetchOwnedWorldsByUserId(userId) {
	var owned = await db.all("SELECT name FROM world WHERE owner_id=? LIMIT 10000", userId);
	var ownedWorldObjs = {};
	for(var i = 0; i < owned.length; i++) {
		var worldname = owned[i].name;
		var world = await getOrCreateWorld(worldname);
		if(!world) continue;
		ownedWorldObjs[world.id] = world;
		releaseWorld(world);
	}
	for(var i in worldCache) {
		var wobj = worldCache[i];
		if(!wobj.exists) continue;
		if(wobj.ownerId == userId) {
			ownedWorldObjs[wobj.id] = wobj;
		} else {
			delete ownedWorldObjs[wobj.id];
		}
	}
	return Object.values(ownedWorldObjs);
}

async function revokeMembershipByWorldName(worldName, userId) {
	var world = await getOrCreateWorld(worldName);
	if(!world) return;
	var hasUpdated = false;
	// remove member
	if(world.members.map[userId]) {
		delete world.members.map[userId];
		hasUpdated = true;
	}
	if(world.members.updates[userId]) {
		var upd = world.members.updates[userId];
		if(upd.type == "ADD") {
			delete world.members.updates[userId];
		}
	} else {
		world.members.updates[userId] = {
			type: "REMOVE"
		};
	}
	releaseWorld(world);
	return [hasUpdated, world.id]; // TODO: refactor
}

async function promoteMembershipByWorldName(worldName, userId) {
	var world = await getOrCreateWorld(worldName);
	if(!world) return false;
	var hasUpdated = false;
	// add member
	if(!world.members.map[userId]) {
		world.members.map[userId] = true;
		hasUpdated = true;
	}
	if(world.members.updates[userId]) {
		var upd = world.members.updates[userId];
		if(upd.type == "REMOVE") {
			delete world.members.updates[userId];
		}
	} else {
		world.members.updates[userId] = {
			type: "ADD",
			date: Date.now()
		};
	}
	releaseWorld(world);
	return hasUpdated;
}

async function claimWorldByName(worldName, user) {
	var validation = await validateWorldClaim(worldName, user);
	if(validation.error) { // an error occurred while claiming
		return {
			success: false,
			message: validation.message
		};
	}
	var world = validation.world;
	modifyWorldProp(world, "ownerId", user.id);
	modifyWorldProp(world, "ownershipChangeDate", Date.now());
	return {
		success: true,
		world: world, // must be released later
		message: validation.message
	};
}

async function renameWorld(world, newName, user) {
	var nameUpdates = [];

	var renameCheck = await validateWorldClaim(newName, user, true);
	if(renameCheck.error) {
		return {
			error: true,
			message: renameCheck.message
		}
	}
	newName = renameCheck.name;
	if(!newName) {
		return {
			error: true,
			message: "Unexpected error"
		};
	}

	var target = await getWorld(newName, false);

	// if the destination worldname already exists, then swap names
	if(target && target.ownerId != null && target.ownerId != user.id) {
		releaseWorld(target);
		return {
			error: true,
			message: "World already has an owner"
		};
	}

	var srcHash = world.name.toUpperCase();
	var destHash = newName.toUpperCase();

	if(worldRenameMap[srcHash] || worldRenameMap[destHash]) {
		releaseWorld(target);
		return {
			error: true,
			message: "World is currently busy"
		};
	}
	// Lock both worldnames until DB operation finishes
	var srcProm = [];
	var destProm = [];
	worldRenameMap[srcHash] = {
		promises: srcProm
	};
	worldRenameMap[destHash] = {
		promises: destProm
	};
	if(target) {
		delete worldCache[destHash];
	}
	var oldWorldName = world.name;
	var isCaseChange = srcHash == destHash;
	var isSwap = target && !isCaseChange;
	delete worldCache[srcHash];
	world.name = newName;
	nameUpdates.push([world.id, newName]);
	worldCache[destHash] = world;
	var targetTempName = null;
	var internalError = false;
	try {
		if(isSwap) {
			worldCache[srcHash] = target;
			target.name = oldWorldName;
			nameUpdates.push([target.id, oldWorldName]);
			// TODO: swapping must be done in a better way
			targetTempName = oldWorldName + "-" + crypto.randomBytes(10).toString("hex");
			await db.run("UPDATE world SET name=? WHERE id=?", [targetTempName, target.id]);
		}
		await db.run("UPDATE world SET name=? WHERE id=?", [newName, world.id]);
		if(isSwap) {
			await db.run("UPDATE world SET name=? WHERE id=?", [oldWorldName, target.id]);
		}
	} catch(e) {
		handle_error(e, true);
		internalError = true;
	}
	delete worldRenameMap[srcHash];
	delete worldRenameMap[destHash];
	for(var i = 0; i < srcProm.length; i++) {
		srcProm[i]();
	}
	for(var i = 0; i < destProm.length; i++) {
		destProm[i]();
	}
	if(internalError) {
		releaseWorld(target);
		return {
			error: true,
			message: "Internal server error"
		}
	}
	releaseWorld(target);
	return {
		error: false,
		name: newName,
		message: "Successfully renamed the world",
		list: nameUpdates
	}
}

async function canViewWorld(world, user, opts) {
	var permissions = {
		member: false,
		owner: false
	};

	var is_owner = world.ownerId == user.id;

	if(world.readability == 2 && !is_owner) { // owner only
		return false;
	}

	var userId = user.id;
	var memberList = world.members.map;
	
	var is_member = Boolean(memberList[userId]);
	if(opts) {
		if(opts.memKey && opts.memKey == world.opts.memKey) {
			is_member = true;
		}
	}

	// member and owner only
	if(world.readability == 1 && !is_member && !is_owner) {
		return false;
	}

	permissions.member = is_member || is_owner;
	permissions.owner = is_owner;
	
	return permissions;
}

async function validateWorldClaim(worldname, user, isRenaming) {
	var worldnamePath = sanitizeWorldname(worldname);
	if(worldname.length > 10000) {
		return {
			error: true,
			message: "Worldname is too long"
		};
	}
	if(!worldnamePath) {
		return {
			error: true,
			message: "Invalid worldname - it must contain the following characters: a-z A-Z 0-9 . _ -"
		};
	}
	// check if not main page ("")
	if(!(worldnamePath.length == 1 && worldnamePath[0] == "")) {
		for(var i = 0; i < worldnamePath.length; i++) {
			if(worldnamePath[i] == "") {
				return {
					error: true,
					message: "Worldname contains empty segments (make sure the name does not begin or end with /)"
				};
			}
			if(worldnamePath[i] == "." || worldnamePath[i] == "..") {
				return {
					error: true,
					message: "Worldname segments cannot be . or .."
				};
			}
		}
	}
	if(worldnamePath.length == 1) {
		var newname = worldnamePath[0];
		if(newname == "" && !user.superuser) {
			return {
				error: true,
				message: "Cannot claim world"
			};
		}
		if(isRenaming) {
			return {
				name: newname,
				error: false
			};
		}
		var world = await getOrCreateWorld(newname);
		if(world) {
			if(world.ownerId == null) {
				return {
					error: false,
					name: newname,
					world: world,
					message: "Successfully claimed the world"
				};
			} else {
				releaseWorld(world);
				return {
					error: true,
					message: "World already has an owner"
				};
			}
		} else {
			return {
				error: true,
				message: "Unable to create the world"
			};
		}
	} else if(worldnamePath.length > 1) {
		var baseName = worldnamePath[0];
		var baseWorld = await getOrCreateWorld(baseName);
		// world does not exist nor is owned by the user
		if(!baseWorld || (baseWorld && baseWorld.ownerId != user.id)) {
			releaseWorld(baseWorld);
			return {
				error: true,
				message: "You do not own the base world in the path"
			};
		}
		releaseWorld(baseWorld);
		var fullWorldname = worldnamePath.join("/");
		if(isRenaming) {
			return {
				name: fullWorldname,
				error: false
			};
		}
		var subWorld = await getOrCreateWorld(fullWorldname, true);
		// already owned
		if(subWorld.ownerId != null) {
			releaseWorld(subWorld);
			return {
				error: true,
				message: "You already own this subdirectory world"
			};
		}
		// subworld is created, now claim it
		return {
			error: false,
			name: fullWorldname,
			world: subWorld,
			message: "Successfully claimed the subdirectory world"
		};
	}
	return {
		error: true,
		message: "Unexpected error"
	};
}

module.exports.sanitizeWorldname = sanitizeWorldname;
module.exports.modifyWorldProp = modifyWorldProp;
module.exports.commitAllWorlds = commitAllWorlds;
module.exports.releaseWorld = releaseWorld;
module.exports.getOrCreateWorld = getOrCreateWorld;
module.exports.fetchWorldMembershipsByUserId = fetchWorldMembershipsByUserId;
module.exports.fetchOwnedWorldsByUserId = fetchOwnedWorldsByUserId;
module.exports.revokeMembershipByWorldName = revokeMembershipByWorldName;
module.exports.promoteMembershipByWorldName = promoteMembershipByWorldName;
module.exports.claimWorldByName = claimWorldByName;
module.exports.renameWorld = renameWorld;
module.exports.canViewWorld = canViewWorld;
module.exports.getWorldNameFromCacheById = getWorldNameFromCacheById;
module.exports.getWorld = getWorld;

// subsystems.world_mgr.debug.worldCache
// used to debug a problem with the cache
module.exports.debug = {
	worldCache,
	worldFetchQueueIndex,
	worldRenameMap
};