var db_chat;
var intv;
var handle_error;
var db;
var broadcastMonitorEvent;

async function main(server) {
	db_chat = server.db_chat;
	intv = server.intv;
	handle_error = server.handle_error;
	db = server.db;
	broadcastMonitorEvent = server.broadcastMonitorEvent;

	await init_chat_history();
	await init_chat_mutes();

	// every 5 minutes, clear the chat cache
	intv.invalidate_chat_cache = setInterval(function() {
		for(var i in chat_cache) {
			invalidate_chat_cache(i);
		}
	}, 60000 * 5);
}

var chat_cache = {};
var chatIsCleared = {};
var chatMsgDeletions = {};
var global_chat_additions = [];
var world_chat_additions = [];

var chatDatabaseBusy = false;
var server_exiting = false;

module.exports.server_exit = async function() {
	server_exiting = true;
	await chatDatabaseClock(true);
}

var ipRateLimits = {};
var tellBlocks = {};
var mutedIPsByWorldID = {}; // id 0 = global
var mutedUsersByWorldID = {};
var muteDBUpdates = {
	mute_ip: {},
	mute_user_id: {},
	clear_world: {}
};

async function init_chat_mutes() {
	var mutes = await db_chat.all("SELECT * FROM mutes");
	for(let i = 0; i < mutes.length; i++) {
		let mute = mutes[i];
		let mute_id = mute.id;
		let world_id = mute.world_id;
		let ip = mute.ip;
		let user_id = mute.user_id;
		let expiration_date = mute.expiration_date;
		if(!expiration_date || (expiration_date != -1 && expiration_date < Date.now())) {
			// expired
			await db_chat.run("DELETE FROM mutes WHERE id=?", mute_id);
		} else {
			if(ip) {
				(mutedIPsByWorldID[world_id] ??= {})[ip] = expiration_date;
			}
			if(user_id) {
				(mutedUsersByWorldID[world_id] ??= {})[user_id] = expiration_date;
			}
		}
	}
}

async function commit_chat_mutes_db() {
	var upd_mute_ip = muteDBUpdates.mute_ip;
	var upd_mute_user_id = muteDBUpdates.mute_user_id;
	var upd_clear_world = muteDBUpdates.clear_world;
	muteDBUpdates.mute_ip = {};
	muteDBUpdates.mute_user_id = {};
	muteDBUpdates.clear_world = {};

	await db_chat.run("BEGIN");

	for(let world_id in upd_clear_world) {
		await db_chat.run("DELETE FROM mutes WHERE world_id=?", world_id);
	}
	for(let world_id in upd_mute_ip) {
		for(let ip in upd_mute_ip[world_id]) {
			let mute_info = upd_mute_ip[world_id][ip];
			await db_chat.run("DELETE FROM mutes WHERE world_id=? AND ip=?", [world_id, ip]);
			if(mute_info.expiration_date != 0) {
				await db_chat.run("INSERT INTO mutes (ip, world_id, expiration_date, date_issued, issuer_user_id) VALUES (?, ?, ?, ?, ?)", [
					ip, world_id, mute_info.expiration_date, Date.now(), mute_info.issuer_user_id
				]);
			}
		}
	}
	for(let world_id in upd_mute_user_id) {
		for(let user_id in upd_mute_user_id[world_id]) {
			await db_chat.run("DELETE FROM mutes WHERE world_id=? AND user_id=?", [world_id, user_id]);
			let mute_info = upd_mute_user_id[world_id][user_id];
			if(mute_info.expiration_date != 0) {
			await db_chat.run("INSERT INTO mutes (user_id, world_id, expiration_date, date_issued, issuer_user_id) VALUES (?, ?, ?, ?, ?)", [
					user_id, world_id, mute_info.expiration_date, Date.now(), mute_info.issuer_user_id
				]);
			}
		}
	}

	await db_chat.run("COMMIT");
}

function canSendMessage(ipAddress, messageLimit) {
	let lim = ipRateLimits[ipAddress];
	if(!messageLimit) messageLimit = 2;
	let period = Math.floor(Date.now() / 1000);
	if(!lim) {
		lim = {
			currentPeriod: period,
			value: 0
		};
		ipRateLimits[ipAddress] = lim;
	}
	if(period != lim.currentPeriod) {
		lim.value = 1;
		lim.currentPeriod = period;
		return true;
	}
	lim.value++;
	if(lim.value > messageLimit) {
		return false;
	}
	return true;
}

function setTellBlockByIP(ip_address, blocked_ip_address) {
	(tellBlocks[ip_address] ??= {})[blocked_ip_address] = Date.now();
}

function unsetTellBlockByIP(ip_address, blocked_ip_address) {
	if(tellBlocks[ip_address]) {
		delete tellBlocks[ip_address][blocked_ip_address];
	}
}

function unsetAllTellBlocksByIP(ip_address) {
	delete tellBlocks[ip_address];
}

function checkTellBlockByIP(ip_address, blocked_ip_address) {
	if(tellBlocks[ip_address]) {
		return !!tellBlocks[ip_address][blocked_ip_address];
	}
	return false;
}

function clearMutesByWorldID(world_id) {
	var ipCount, userCount;
	if(mutedIPsByWorldID[world_id]) {
		ipCount = Object.keys(mutedIPsByWorldID[world_id]).length;
		delete mutedIPsByWorldID[world_id];
	}
	if(mutedUsersByWorldID[world_id]) {
		userCount = Object.keys(mutedUsersByWorldID[world_id]).length;
		delete mutedUsersByWorldID[world_id];
	}
	if(ipCount > 0 || userCount > 0) {
		muteDBUpdates.clear_world[world_id] = true;
	}

	return {ip: ipCount, user: userCount};
}

function muteByIP(world_id, ip, expiration_date, issuer_user_id) {
	(mutedIPsByWorldID[world_id] ??= {})[ip] = expiration_date;
	(muteDBUpdates.mute_ip[world_id] ??= {})[ip] = {expiration_date, issuer_user_id};
}

function muteByUserID(world_id, user_id, expiration_date, issuer_user_id) {
	(mutedUsersByWorldID[world_id] ??= {})[user_id] = expiration_date;
	(muteDBUpdates.mute_user_id[world_id] ??= {})[user_id] = {expiration_date, issuer_user_id};
}

function unmuteByIP(world_id, ip) {
	if(mutedIPsByWorldID[world_id]) {
		delete mutedIPsByWorldID[world_id][ip];
	}
	if(muteDBUpdates.mute_ip[world_id]) {
		muteDBUpdates.mute_ip[world_id][ip] = {expiration_date: 0, issuer_user_id: null};
	}
}

function unmuteByUserID(world_id, user_id) {
	if(mutedUsersByWorldID[world_id]) {
		delete mutedUsersByWorldID[world_id][user_id];
	}
	if(muteDBUpdates.mute_user_id[world_id]) {
		muteDBUpdates.mute_user_id[world_id][user_id] = {expiration_date: 0, issuer_user_id: null};
	}
}

function getMuteByIP(world_id, ip) {
	let expiration_date = mutedIPsByWorldID[world_id]?.[ip];
	if(!expiration_date) {
		return null;
	}
	return expiration_date;
}

function getMuteByUserID(world_id, user_id) {
	let expiration_date = mutedUsersByWorldID[world_id]?.[user_id];
	if(!expiration_date) {
		return null;
	}
	return expiration_date;
}

function checkMuteByIP(world_id, ip) {
	let expiration_date = mutedIPsByWorldID[world_id]?.[ip];
	if(!expiration_date) {
		return false;
	}
	if(expiration_date == -1) {
		return true;
	}
	if(Date.now() >= expiration_date) {
		// past expiration date
		delete mutedIPsByWorldID[world_id]?.[ip];
		return false;
	} else {
		return true;
	}
}

function checkMuteByUserID(world_id, user_id) {
	let expiration_date = mutedUsersByWorldID[world_id]?.[user_id];
	if(!expiration_date) {
		return false;
	}
	if(expiration_date == -1) {
		return true;
	}
	if(Date.now() >= expiration_date) {
		// past expiration date
		delete mutedUsersByWorldID[world_id]?.[user_id];
		return false;
	} else {
		return true;
	}
}

async function init_chat_history() {
	if(!await db_chat.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ch_info'")) {
		await db_chat.run("CREATE TABLE 'ch_info' (name TEXT, value TEXT)");
	}
	if(!await db_chat.get("SELECT value FROM ch_info WHERE name='initialized'")) {
		await db_chat.run("INSERT INTO ch_info VALUES('initialized', 'true')");
		await db_chat.run("CREATE TABLE channels (id integer NOT NULL PRIMARY KEY, name integer, properties text, description text, date_created integer, world_id integer)");
		await db_chat.run("CREATE TABLE entries (id integer NOT NULL PRIMARY KEY, date integer, channel integer, data text)");
		await db_chat.run("CREATE TABLE default_channels (channel_id integer, world_id integer)");
		await db_chat.run("INSERT INTO channels VALUES(null, ?, ?, ?, ?, ?)",
			["global", "{}", "The global channel - Users can access this channel from any page on OWOT", Date.now(), 0]);
		// add important indices
		await db_chat.run("CREATE INDEX chan_default ON default_channels (world_id, channel_id)");
		await db_chat.run("CREATE INDEX chan_id ON channels (world_id, id)");
		await db_chat.run("CREATE INDEX ent_id ON entries (channel, id DESC)");
		await db_chat.run("CREATE INDEX ent_date ON entries (channel, date)");
		await db_chat.run("CREATE INDEX ent_channel ON entries (channel)");
	}
	chatDatabaseClock();
}

function queue_chat_cache(world_id) {
	return new Promise(function(res) {
		chat_cache[world_id].queue.push(function(data) {
			res(data);
		});
	});
}

// safely delete the chat cache to free up memory
function invalidate_chat_cache(world_id) {
	var cache = chat_cache[world_id];
	if(!cache) return;

	// do not clear caches that are already being loaded
	if(!cache.loaded) return;

	// if chat entries are not added to the database, do not clear the cache
	if(world_id == 0) { // global channel
		if(global_chat_additions.length) return;
	} else { // world channel
		if(world_chat_additions[world_id]) return;
	}

	cache.queue.splice(0);
	cache.data.splice(0);
	cache.loaded = false;

	delete chat_cache[world_id];
}

// Retrieves the chat history of a specific channel instead of loading the entire database into memory
// The global channel is retrieved by using world id 0
async function retrieveChatHistory(world_id) {
	// no cache has been started
	if(!(world_id in chat_cache)) {
		chat_cache[world_id] = {queue: [], data: [], loaded: false};
	} else if(!chat_cache[world_id].loaded) {
		// a cache is in progress but not loaded yet
		return await queue_chat_cache(world_id);
	}

	// data for this channel is already fully loaded and cached
	if(world_id in chat_cache && chat_cache[world_id].loaded) return chat_cache[world_id].data;

	var default_channel;
	if(world_id != 0) { // not global channel (world channels)
		default_channel = await db_chat.get("SELECT channel_id FROM default_channels WHERE world_id=?", world_id);
		if(default_channel) {
			default_channel = default_channel.channel_id;
		} else {
			default_channel = 0;
		}
	} else { // global channel
		default_channel = await db_chat.get("SELECT id FROM channels WHERE world_id=0");
		if(default_channel) {
			default_channel = default_channel.id;
		} else {
			default_channel = 0;
		}
	}
	// add data if the channel exists. otherwise it's empty
	if(default_channel) {
		var world_chats;
		if(chatIsCleared[world_id]) {
			// the channel is being cleared. return a blank history
			world_chats = [];
		} else {
			world_chats = await db_chat.all("SELECT * FROM entries WHERE channel=? ORDER BY id DESC LIMIT 100", default_channel);
			world_chats.reverse();
		}
		for(var a = 0; a < world_chats.length; a++) {
			var row = JSON.parse(world_chats[a].data);
			row.date = world_chats[a].date;
			chat_cache[world_id].data.push(row);
		}
	}
	chat_cache[world_id].loaded = true;

	// other calls to this function requested the same chat history while is was being fetched.
	// send the complete data to those calls
	var queue = chat_cache[world_id].queue;
	for(var i = 0; i < queue.length; i++) {
		queue[i](chat_cache[world_id].data);
	}

	return chat_cache[world_id].data;
}

async function add_to_chatlog(chatData, world_id) {
	var location = "page";
	if(world_id == 0) {
		location = "global";
	}

	var date = Date.now();
	chatData.date = date;

	var history = await retrieveChatHistory(world_id);

	history.push(chatData);
	if(history.length > 100) {
		history.shift();
	}

	if(location == "page") {
		world_chat_additions.push([chatData, world_id, date]);
	} else if(location == "global") {
		global_chat_additions.push([chatData, 0, date]);
	}
}

async function remove_from_chatlog(world_id, chat_id, chat_date) {
	var obj = world_chat_additions;
	if(world_id == 0) obj = global_chat_additions;

	var history = await retrieveChatHistory(world_id);

	var cache_rem = 0;
	var add_rem = 0;

	// remove from the cache
	for(var i = 0; i < history.length; i++) {
		var msg = history[i];
		if(msg.id == chat_id && msg.date == chat_date) {
			history.splice(i, 1);
			cache_rem++;
			i--;
		}
	}

	// remove from the insertion queue
	for(var i = 0; i < obj.length; i++) {
		var add = obj[i];
		if(add[1] == world_id && add[2] == chat_date) {
			obj.splice(i, 1);
			add_rem++;
			i--;
		}
	}

	var deletions = chatMsgDeletions[world_id];
	if(!deletions) {
		deletions = [];
		chatMsgDeletions[world_id] = deletions;
	}
	deletions.push([chat_date, chat_id]);

	return Math.max(cache_rem, add_rem);
}

function clearChatlog(world_id) {
	// clear from cache if it exists
	if(chat_cache[world_id] && chat_cache[world_id].loaded) {
		chat_cache[world_id].data.splice(0);
	}
	// queue to be cleared
	chatIsCleared[world_id] = true;
}

async function doUpdateChatLogData() {
	// TODO: eliminate the need to clone all the objects.
	// the challenge here is that we also need to fetch some data as well.
	var copy_global_chat_additions = global_chat_additions.slice(0);
	var copy_world_chat_additions = world_chat_additions.slice(0);
	var copy_chatIsCleared = Object.assign(chatIsCleared, {});
	var copy_chatMsgDeletions = Object.assign(chatMsgDeletions, {});

	global_chat_additions = [];
	world_chat_additions = [];
	chatIsCleared = {};
	chatMsgDeletions = {};

	await db_chat.run("BEGIN");

	for(var wid in copy_chatIsCleared) {
		var worldId = parseInt(wid);
		var def_channel = await db_chat.get("SELECT channel_id FROM default_channels WHERE world_id=?", worldId);
		if(!def_channel) continue;
		def_channel = def_channel.channel_id;
		await db_chat.run("DELETE FROM entries WHERE channel=?", def_channel);
	}

	for(var wid in copy_chatMsgDeletions) {
		var worldId = parseInt(wid);
		var def_channel;
		if(worldId > 0) {
			def_channel = await db_chat.get("SELECT channel_id FROM default_channels WHERE world_id=?", worldId);
			if(!def_channel) continue;
			def_channel = def_channel.channel_id;
		} else {
			def_channel = (await db_chat.get("SELECT id FROM channels WHERE name='global'")).id;
		}
		var list = copy_chatMsgDeletions[wid];
		for(var x = 0; x < list.length; x++) {
			var del = list[x];
			var chatDate = del[0];
			var chatId = del[1];
			await db_chat.run("DELETE FROM entries WHERE channel=? AND date=? AND json_extract(data, '$.id')=?", [def_channel, chatDate, chatId]);
		}
	}

	for(var i = 0; i < copy_world_chat_additions.length; i++) {
		var row = copy_world_chat_additions[i];
		var chatData = row[0];
		var worldId = row[1];
		var date = row[2];
		var channelName = "wid_" + worldId;
		var def_channel = await db_chat.get("SELECT channel_id FROM default_channels WHERE world_id=?", worldId);
		if(!def_channel) {
			var channelDesc = "Channel - \"" + channelName + "\"";
			var world_channel = await db_chat.run("INSERT INTO channels VALUES(null, ?, ?, ?, ?, ?)",
				["_" + channelName, "{}", channelDesc, Date.now(), worldId]);
			var new_def_channel = await db_chat.run("INSERT INTO default_channels VALUES(?, ?)",
				[world_channel.lastID, worldId]);
			def_channel = world_channel.lastID;
		} else {
			def_channel = def_channel.channel_id;
		}
		var cent = await db_chat.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
			[date, def_channel, JSON.stringify(chatData)]);
	}

	for(var i = 0; i < copy_global_chat_additions.length; i++) {
		var row = copy_global_chat_additions[i];
		var data = row[0];
		var date = row[2];
		var global_channel = (await db_chat.get("SELECT id FROM channels WHERE name='global'")).id; // XXX
		var cent = await db_chat.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
			[date, global_channel, JSON.stringify(data)]);
	}

	await db_chat.run("COMMIT");
}

async function chatDatabaseClock(serverExit) {
	if(chatDatabaseBusy) return;
	chatDatabaseBusy = true;
	try {
		var gc_len = global_chat_additions.length;
		var wc_len = world_chat_additions.length;
		var cc_len = Object.keys(chatIsCleared).length;
		var cd_len = Object.keys(chatMsgDeletions).length;
		if(gc_len > 0 || wc_len > 0 || cc_len > 0 || cd_len > 0) {
			await doUpdateChatLogData();
		}
		await commit_chat_mutes_db();
		broadcastMonitorEvent("Chat", "Clock cycle executed");
	} catch(e) {
		handle_error(e);
	}
	chatDatabaseBusy = false;
	if(server_exiting) {
		if(!serverExit) await chatDatabaseClock(true);
	} else {
		intv.chat_database_clock = setTimeout(chatDatabaseClock, 1000 * 5);
	}
}

module.exports = {
	main,
	retrieveChatHistory,
	add_to_chatlog,
	remove_from_chatlog,
	clearChatlog,

	canSendMessage,
	muteByIP,
	muteByUserID,
	unmuteByIP,
	unmuteByUserID,
	checkMuteByIP,
	checkMuteByUserID,
	getMuteByIP,
	getMuteByUserID,
	clearMutesByWorldID,
	setTellBlockByIP,
	unsetTellBlockByIP,
	unsetAllTellBlocksByIP,
	checkTellBlockByIP
};
