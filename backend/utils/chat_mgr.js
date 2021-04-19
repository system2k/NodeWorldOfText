var db_ch;
var intv;
var handle_error;
var db;
function prepare_chat_db(vars) {
	db_ch = vars.db_ch;
	intv = vars.intv;
	handle_error = vars.handle_error;
	db = vars.db;

	// every 5 minutes, clear the chat cache
	intv.invalidate_chat_cache = setInterval(function() {
		for(var i in chat_cache) {
			invalidate_chat_cache(i);
		}
	}, 60000 * 5);
}

async function init_chat_history() {
	if(!await db_ch.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ch_info'")) {
		await db_ch.run("CREATE TABLE 'ch_info' (name TEXT, value TEXT)");
	}
	if(!await db_ch.get("SELECT value FROM ch_info WHERE name='initialized'")) {
		await db_ch.run("INSERT INTO ch_info VALUES('initialized', 'true')");
		await db_ch.run("CREATE TABLE channels (id integer NOT NULL PRIMARY KEY, name integer, properties text, description text, date_created integer, world_id integer)")
		await db_ch.run("CREATE TABLE entries (id integer NOT NULL PRIMARY KEY, date integer, channel integer, data text)")
		await db_ch.run("CREATE TABLE default_channels (channel_id integer, world_id integer)")
		await db_ch.run("INSERT INTO channels VALUES(null, ?, ?, ?, ?, ?)",
			["global", "{}", "The global channel - Users can access this channel from any page on OWOT", Date.now(), 0]);
	}
	updateChatLogData();
}

var chat_cache = {};

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
// includes a race condition resolving system
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
		default_channel = await db_ch.get("SELECT channel_id FROM default_channels WHERE world_id=?", world_id);
		if(default_channel) {
			default_channel = default_channel.channel_id;
		} else {
			default_channel = 0;
		}
	} else { // global channel
		default_channel = await db_ch.get("SELECT id FROM channels WHERE world_id=0");
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
			world_chats = await db_ch.all("SELECT * FROM (SELECT * FROM entries WHERE channel=? ORDER BY id DESC LIMIT 100) ORDER BY id ASC", default_channel);
		}
		for(var a = 0; a < world_chats.length; a++) {
			var row = JSON.parse(world_chats[a].data);
			row.date = world_chats[a].date;
			/* row.aid = world_chats[a].id; */
			delete row.aid; // remove potentially-saved "aid"
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

var chatAdditionId = -2; // avoid using -1.
async function add_to_chatlog(chatData, world_id) {
	var location = "page";
	if(world_id == 0) {
		location = "global";
	}

	var date = Date.now();
	chatData.date = date;
	/* chatData.aid = chatAdditionId--; */

	var history = await retrieveChatHistory(world_id);

	history.push(chatData);
	if(history.length > 100) {
		history.shift();
	}

	if(location == "page") {
		world_chat_additions.push([chatData, world_id, date]);
	} else if(location == "global") {
		global_chat_additions.push([chatData, date]);
	}
}

var chatIsCleared = {};

var global_chat_additions = [];
var world_chat_additions = [];

function clearChatlog(world_id) {
	// clear from cache if it exists
	if(chat_cache[world_id] && chat_cache[world_id].loaded) {
		chat_cache[world_id].data.splice(0);
	}
	// queue to be cleared
	chatIsCleared[world_id] = true;
}

async function doUpdateChatLogData() {
	var copy_global_chat_additions = global_chat_additions.slice(0);
	var copy_world_chat_additions = world_chat_additions.slice(0);
	var copy_chatIsCleared = Object.assign(chatIsCleared, {});

	global_chat_additions = [];
	world_chat_additions = [];
	chatIsCleared = {};

	await db_ch.run("BEGIN");

	for(var i in copy_chatIsCleared) {
		var worldId = i;
		var def_channel = await db_ch.get("SELECT channel_id FROM default_channels WHERE world_id=?", worldId);
		if(!def_channel) continue;
		def_channel = def_channel.channel_id;
		await db_ch.run("DELETE FROM entries WHERE channel=?", def_channel);
	}

	for(var i = 0; i < copy_world_chat_additions.length; i++) {
		var row = copy_world_chat_additions[i];
		var chatData = row[0];
		var worldId = row[1];
		var date = row[2];
		var worldName = await db.get("SELECT name FROM world WHERE id=?", worldId);
		if(!worldName) continue;
		worldName = worldName.name;
		var def_channel = await db_ch.get("SELECT channel_id FROM default_channels WHERE world_id=?", worldId);
		if(!def_channel) {
			var channelDesc = "Channel - \"" + worldName + "\"";
			if(!worldName) { // "" = front page
				channelDesc = "Front page channel";
			}
			var world_channel = await db_ch.run("INSERT INTO channels VALUES(null, ?, ?, ?, ?, ?)",
				["_" + worldName, "{}", channelDesc, Date.now(), worldId]);
			var new_def_channel = await db_ch.run("INSERT INTO default_channels VALUES(?, ?)",
				[world_channel.lastID, worldId]);
			def_channel = world_channel.lastID;
		} else {
			def_channel = def_channel.channel_id;
		}
		var cent = await db_ch.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
			[date, def_channel, JSON.stringify(chatData)]);
		/* chatData.aid = cent.lastID; */
	}

	for(var i = 0; i < copy_global_chat_additions.length; i++) {
		var row = copy_global_chat_additions[i];
		var data = row[0];
		var date = row[1];
		var global_channel = (await db_ch.get("SELECT id FROM channels WHERE name='global'")).id;
		var cent = await db_ch.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
			[date, global_channel, JSON.stringify(data)]);
		/* data.aid = cent.lastID; */
	}

	await db_ch.run("COMMIT");
}

async function updateChatLogData(no_timeout) {
	if(!(global_chat_additions.length > 0 ||
		  world_chat_additions.length > 0 ||
		  Object.keys(chatIsCleared).length > 0)) {
		if(!no_timeout) intv.updateChatLogData = setTimeout(updateChatLogData, 1000);
		return;
	}

	try {
		await doUpdateChatLogData();
	} catch(e) {
		handle_error(e);
	}

	if(!no_timeout) intv.updateChatLogData = setTimeout(updateChatLogData, 5000);
}

module.exports = {
	prepare_chat_db,
	init_chat_history,
	retrieveChatHistory,
	add_to_chatlog,
	clearChatlog,
	updateChatLogData
};