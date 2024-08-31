var utils = require("../utils/utils.js");
var html_tag_esc = utils.html_tag_esc;
var san_nbr = utils.san_nbr;
var calculateTimeDiff = utils.calculateTimeDiff;
var create_date = utils.create_date;

function sanitizeColor(col) {
	var masks = ["#XXXXXX", "#XXX"];

	var hex_set = "0123456789abcdefABCDEF";
	
	for(var m = 0; m < masks.length; m++) {
		var mask = masks[m];
		var fail = false;
		for(var c = 0; c < mask.length; c++) {
			var mask_char = mask[c];
			var cmp_char = col[c];
			if(mask.length != col.length) {
				fail = true;
				break;
			}
			if(mask_char == "#" && cmp_char == "#") continue;
			if(mask_char == "X" && hex_set.indexOf(cmp_char) > -1) continue;
			fail = true;
			break;
		}
		if(!fail) {
			return col;
		}
	}

	return "#00FF00"; // checking did not pass
}

function sanitizeCustomMeta(meta) {
	if(typeof meta != "object") return undefined;
	if(meta === null || Array.isArray(meta)) return undefined;
	if(Object.keys(meta).length > 12) return undefined;

	var output = {};
	for(var k in meta) {
		if(k.length > 36) continue;

		var v = meta[k];
		if(typeof v != "string" && typeof v != "number") continue;
		if(k.length > 400) continue;

		output[k] = v;
	}

	return output;
}

var chat_ip_limits = {};
var tell_blocks = {};
var blocked_ips_by_world_id = {}; // id 0 = global

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var channel = ctx.channel;
	var user = ctx.user;
	var world = ctx.world;

	var db = server.db;
	var db_chat = server.db_chat;
	var ws_broadcast = server.ws_broadcast; // site-wide broadcast
	var chat_mgr = server.chat_mgr;
	var topActiveWorlds = server.topActiveWorlds;
	var wss = server.wss;
	var ranks_cache = server.ranks_cache;
	var accountSystem = server.accountSystem;
	var client_ips = server.client_ips;
	var wsSend = server.wsSend;
	var broadcastMonitorEvent = server.broadcastMonitorEvent;
	var loadPlugin = server.loadPlugin;
	var getServerSetting = server.getServerSetting;
	var getServerUptime = server.getServerUptime;

	var add_to_chatlog = chat_mgr.add_to_chatlog;
	var remove_from_chatlog = chat_mgr.remove_from_chatlog;

	var ipHeaderAddr = ws.sdata.ipAddress;
	var clientId = ws.sdata.clientId;

	var chat_perm = world.feature.chat;
	var is_owner = world.ownerId == user.id;
	var is_member = !!world.members.map[user.id] || is_owner;

	var isGlobalEnabled = getServerSetting("chatGlobalEnabled") == "1";

	var clientIpObj = null;
	if(client_ips[world.id]) {
		if(client_ips[world.id][clientId]) {
			clientIpObj = client_ips[world.id][clientId];
		}
	}

	var safeOrigin = false;
	if(ws.sdata.origin == "https://ourworldoftext.com" || ws.sdata.origin == "https://test.ourworldoftext.com") {
		safeOrigin = true;
	}

	// sends `[ Server ]: <message>` in chat.
	function serverChatResponse(message, location) {
		if(ws.sdata.passiveCmd) return;
		send({
			nickname: "[ Server ]",
			realUsername: "[ Server ]",
			id: 0,
			message: message,
			registered: true,
			location: location,
			op: false,
			admin: false,
			staff: false,
			color: "",
			kind: "chat"
		});
	}
	
	// -1: cannot chat at all
	// by default, chat_permission is 0. undefined is equivalent to 0.
	var can_chat = false;
	if(!chat_perm) can_chat = true;
	if(chat_perm === 1 && (is_member || is_owner)) can_chat = true;
	if(chat_perm === 2 && is_owner) can_chat = true;

	var location = "";
	if(!(data.location == "global" || data.location == "page")) data.location = "page";
	location = data.location;

	if(location == "page" && !can_chat) {
		serverChatResponse("You do not have permission to chat here", location);
		return;
	}

	if(location == "global" && !isGlobalEnabled) {
		serverChatResponse("The global channel is not available", location);
		return;
	}

	var isMuted = false;
	var isTestMessage = false;
	var muteInfo = null;
	var worldChatMutes = blocked_ips_by_world_id[world.id];
	if(location == "global") {
		worldChatMutes = blocked_ips_by_world_id[0];
	}
	if(worldChatMutes) {
		muteInfo = worldChatMutes[ipHeaderAddr];
		if(muteInfo) {
			isMuted = true;
		}
	}

	if(isMuted) {
		var expTime = muteInfo[0];
		if(!expTime || typeof expTime != "number" || Date.now() >= expTime) {
			isMuted = false;
			delete worldChatMutes[ipHeaderAddr];
		}
	}

	var nick = "";
	if(data.nickname) {
		nick = data.nickname + "";
	}
	if(!user.staff) {
		nick = nick.slice(0, 40);
	} else {
		nick = nick.slice(0, 3030);
	}

	var msg = "";
	if(data.message) {
		msg = data.message + "";
	}
	msg = msg.trim();

	if(!msg) return;

	data.color += "";
	data.color = sanitizeColor(data.color);
	if(!data.color) data.color = "#000000";
	data.color = data.color.slice(0, 20);
	data.color = data.color.trim();
	if(!user.authenticated) {
		data.color = "#000000";
	}

	if(!user.staff) {
		msg = msg.slice(0, 400);
	} else {
		msg = msg.slice(0, 3030);
	}

	if(data.hasOwnProperty("customMeta")) {
		data.customMeta = sanitizeCustomMeta(data.customMeta);
	}

	var username_to_display = user.username;
	if(accountSystem == "uvias") {
		username_to_display = user.display_username;
	}

	var chatBlockLimit = 1280;

	// [rank, name, args, description, example]
	var command_list = [
		// operator
		[3, "uptime", null, "get uptime of server", null],

		// superuser
		[2, "worlds", null, "list all worlds", null],

		// staff
		[1, "channel", null, "get info about a chat channel"],

		// general
		[0, "help", null, "list all commands", null],
		
		[0, "block", ["id"], "block someone by id", "1220"],
		[0, "blockuser", ["username"], "block someone by username", "JohnDoe"],
		[0, "unblock", ["id"], "unblock someone by id", "1220"],
		[0, "unblockuser", ["username"], "unblock someone by username", "JohnDoe"],
		[0, "unblockall", null, "unblock all users", null],
		[0, "mute", ["id", "seconds", "[h/d/w/m/y]"], "mute a user completely", "1220 9999"], // check for permission
		[0, "clearmutes", null, "unmute all clients"], // check for permission
		[0, "delete", ["id", "timestamp"], "delete a chat message", "1220 1693147307895"], // check for permission
		[0, "tell", ["id", "message"], "tell someone a secret message", "1220 The coordinates are (392, 392)"],
		[0, "whoami", null, "display your identity"],
		[0, "test", null, "preview your appearance"]

		// hidden by default
		// "/search Phrase" (client) -> searches for Phrase within a 25 tile radius
		// "/passive on/off" -> disable or enable server responses to commands (e.g. /block)
	];

	function generate_command_list() {
		var list = [];
		for(var i = 0; i < command_list.length; i++) {
			var command = command_list[i];
			var rank = command[0];
			if(rank == 3 && user.operator) list.push(command);
			if(rank == 2 && user.superuser) list.push(command);
			if(rank == 1 && user.staff) list.push(command);
			if(rank == 0) list.push(command);
		}

		// sort the command list
		list.sort(function(v1, v2) {
			return v1[1].localeCompare(v2[1], "en", { sensitivity: "base" });
		});

		var html = "";
		html += "Command list:\n";
		for(var i = 0; i < list.length; i++) {
			var row = list[i];
			var command = row[1];
			var args = row[2];
			var desc = row[3];
			var example = row[4];

			if(command == "mute" || command == "clearmutes" || command == "delete") {
				if(!user.staff && !is_owner) {
					continue;
				}
			}

			var rawArgs = "";
			var rawExample = "";
			if(example) rawExample = " (/" + command + " " + example + ")";
			if(args) rawArgs = " <" + args.join(",") + ">";

			html += `/${command}${rawArgs} -> ${desc}${rawExample}\n`;

		}
		return html;
	}

	function getClientIPByChatID(id, isGlobal) {
		if(isGlobal) {
			// since this is global, there is the potential for duplicate IDs.
			// pick the one that has chatted the most recently.
			var latestGCli = null;
			var latestGCliTime = -1;
			for(var cw in client_ips) {
				var worldClients = client_ips[cw];
				if(worldClients[id]) {
					var gCli = worldClients[id];
					if(gCli[3] != -1 && gCli[3] >= latestGCliTime) {
						latestGCliTime = gCli[3];
						latestGCli = gCli;
					}
				}
			}
			if(latestGCli) {
				return latestGCli[0];
			}
		} else {
			if(client_ips[world.id]) {
				if(client_ips[world.id][id]) {
					return client_ips[world.id][id][0];
				}
			}
		}
		return null;
	}

	var com = {
		worlds: function() {
			var topCount = 1000;
			var lst = topActiveWorlds(topCount);
			var worldList = "";
			for(var i = 0; i < lst.length; i++) {
				var row = lst[i];
				if(row[1] == "") {
					row[1] = "(main)"
				} else {
					row[1] = "/" + row[1];
				}
				worldList += "-> " + row[1] + " [" + row[0] + "]";
				if(i != lst.length - 1) worldList += "\n";
			}
			serverChatResponse("Currently loaded worlds (top " + topCount + "):\n" + worldList, location);
			return;
		},
		help: function(modifier) {
			return serverChatResponse(generate_command_list(), location);
		},
		block: function(id) {
			var blocks = ws.sdata.chat_blocks;

			switch (id) {
			case "*":
				blocks.block_all = true;
				break;
			case "tell":
				blocks.no_tell = true;
				break;
			case "anon":
				blocks.no_anon = true;
				break;
			case "reg":
				blocks.no_reg = true;
				break;
			default:
				id = san_nbr(id);
				if (id < 0) return;

				if ((blocks.id.length + blocks.user.length) >= chatBlockLimit)
					return serverChatResponse("Too many blocked IDs/users", location);
				if (blocks.id.indexOf(id) > -1) return;
				blocks.id.push(id);
			}
			
			var blocked_ip = getClientIPByChatID(id, location == "global");
			if(blocked_ip) {
				var blist = tell_blocks[ipHeaderAddr];
				if(!blist) {
					blist = {};
					tell_blocks[ipHeaderAddr] = blist;
				}
				if(!blist[blocked_ip]) {
					blist[blocked_ip] = Date.now();
				}
			}

			serverChatResponse("Blocked chats from ID: " + id, location);
		},
		blockuser: function(username) {
			var blocks = ws.sdata.chat_blocks;
			if(typeof username != "string" || !username) {
				serverChatResponse("Invalid username", location);
				return;
			}

			if (!/^[^\s\x00-\x20]+$/.test(username)) return;

			// The case-insensitive value to be stored in chat_blocks.
			var username_value = username.toUpperCase();

			// Ensure maximum block count not exceeded, and check if it already exists.
			if ((blocks.id.length + blocks.user.length) >= chatBlockLimit)
					return serverChatResponse("Too many blocked IDs/users", location);
			if (blocks.user.indexOf(username_value) > -1) return;
			blocks.user.push(username_value);

			serverChatResponse("Blocked chats from user: " + username, location);
		},
		unblock: function(id) {
			var blocks = ws.sdata.chat_blocks;

			switch (id) {
			case "*":
				blocks.block_all = false;
				break;
			case "tell":
				blocks.no_tell = false;
				break;
			case "anon":
				blocks.no_anon = false;
				break;
			case "reg":
				blocks.no_reg = false;
			default:
				id = san_nbr(id);
				if(id < 0) return;

				var idx = blocks.id.indexOf(id);
				if(idx == -1) return;
				blocks.id.splice(idx, 1);
			}
			
			var unblocked_ip = getClientIPByChatID(id, location == "global");
			if(unblocked_ip) {
				var blist = tell_blocks[ipHeaderAddr];
				if(blist) {
					delete blist[unblocked_ip];
				}
			}

			serverChatResponse("Unblocked chats from ID: " + id, location);
		},
		unblockuser: function(username) {
			var blocks = ws.sdata.chat_blocks;
			if(typeof username != "string" || !username) {
				serverChatResponse("Invalid username", location);
				return;
			}

			// The case-insensitive value to be stored in chat_blocks.
			var username_value = username.toUpperCase();

			var idx = blocks.user.indexOf(username_value);
			if(idx == -1) return;
			blocks.user.splice(idx, 1);

			serverChatResponse("Unblocked chats from user: " + username, location);
		},
		unblockall: function() {
			ws.sdata.chat_blocks.id.splice(0);
			ws.sdata.chat_blocks.user.splice(0);
			ws.sdata.chat_blocks.block_all = false;
			ws.sdata.chat_blocks.no_tell = false;
			ws.sdata.chat_blocks.no_anon = false;
			ws.sdata.chat_blocks.no_reg = false;
			
			var tblocks = tell_blocks[ipHeaderAddr];
			if(tblocks) {
				for(var b in tblocks) {
					delete tblocks[b];
				}
			}
			serverChatResponse("Cleared all blocks", location);
		},
		uptime: function() {
			serverChatResponse("Server uptime: " + calculateTimeDiff(getServerUptime()), location);
		},
		tell: function(id, message) {
			id += "";
			message += "";
			message = message.trim();
			var noClient = false;
			if(!id) {
				return serverChatResponse("No id given", location);
			}
			if(!message) {
				return serverChatResponse("No message given", location);
			}
			id = parseInt(id, 10);
			if(isNaN(id)) {
				return serverChatResponse("Invalid ID format", location);
			}
			id = san_nbr(id);

			var client = null;
			var latestGlobalClientTime = -1;
			wss.clients.forEach(function(ws) {
				if(!ws.sdata) return;
				if(!ws.sdata.userClient) return;
				var dstClientId = ws.sdata.clientId;
				var clientWorld = ws.sdata.world;
				if(dstClientId != id) return;
				if(location == "page") {
					if(clientWorld.id == world.id) {
						client = ws;
					}
				} else if(location == "global") {
					var cliObj = client_ips[clientWorld.id][dstClientId];
					var cliTime = cliObj[3];
					var disconnected = cliObj[2];
					if((!disconnected && cliTime != -1 && cliTime >= latestGlobalClientTime) || (dstClientId == clientId)) { // allow self-dm
						latestGlobalClientTime = cliTime;
						client = ws;
					}
				}
			});

			if(!client) {
				noClient = true;
			}

			hasPrivateMsged = true;

			if(isMuted) return;

			if(noClient) {
				return serverChatResponse("User not found", location);
			}

			var privateMessage = {
				nickname: nick,
				realUsername: username_to_display,
				id: clientId, // client id of sender
				message: message,
				registered: user.authenticated,
				location: location,
				op: user.operator,
				admin: user.superuser,
				staff: user.staff,
				color: data.color,
				kind: "chat",
				privateMessage: "to_me",
				customMeta: data.customMeta
			};

			if(user.authenticated && user.id in ranks_cache.users) {
				var rank = ranks_cache[ranks_cache.users[user.id]];
				privateMessage.rankName = rank.name;
				privateMessage.rankColor = rank.chat_color;
			}
			send({
				nickname: "",
				realUsername: "",
				id: id, // client id of receiver
				message: message,
				registered: false,
				location: location,
				op: false,
				admin: false,
				staff: false,
				color: "#000000",
				kind: "chat",
				privateMessage: "from_me",
				customMeta: data.customMeta
			});
			// if user has blocked TELLs, don't let the /tell-er know
			if(client.sdata.chat_blocks[id] && (client.sdata.chat_blocks.id.includes(clientId))) return; // is ID of the /tell sender? (not destination)
			if(client.sdata.chat_blocks.block_all) return;
			if(client.sdata.chat_blocks.no_tell) return;
			if(client.sdata.chat_blocks.no_anon && !user.authenticated) return;
			if(client.sdata.chat_blocks.no_reg && user.authenticated) return;
				
			// user has blocked the TELLer by IP
			var tellblock = tell_blocks[client.sdata.ipAddress];
			if(tellblock && tellblock[ipHeaderAddr]) {
				var blk = tellblock[ipHeaderAddr];
				if(Date.now() - blk > 1000 * 60 * 60) { // delete after 1 hour
					delete tellblock[ipHeaderAddr];
				} else {
					return;
				}
			}

			wsSend(client, JSON.stringify(privateMessage));
			if(clientIpObj && location == "global") {
				clientIpObj[3] = Date.now();
			}
			broadcastMonitorEvent("TellSpam", "Tell from " + clientId + " (" + ipHeaderAddr + ") to " + id + ", first 4 chars: [" + message.slice(0, 4) + "]");
		},
		channel: async function() {
			if(!user.staff) return;
			var worldId = world.id;
			if(location == "global") worldId = 0;
			var channels = await db_chat.all("SELECT * FROM channels WHERE world_id=?", worldId);
			var count = channels.length;
			var infoLog = "Found " + count + " channel(s) for this world:\n";
			for(var i = 0; i < count; i++) {
				var ch = channels[i];
				var name = ch.name;
				var desc = ch.description;
				var date = ch.date_created;
				infoLog += "Name: " + name + "\n";
				infoLog += "Desc: " + desc + "\n";
				infoLog += "Created: " + create_date(date) + "\n";
				infoLog += "----------------\n";
			}
			var def = await db_chat.get("SELECT * FROM default_channels WHERE world_id=?", worldId);
			if(def && def.channel_id) {
				def = def.channel_id;
			} else {
				def = "<none>";
			}
			infoLog += "Default channel id: " + def;
			return serverChatResponse(infoLog, location);
		},
		mute: function(id, time, flag) {
			if(!is_owner && !user.staff) return;
			id = san_nbr(id);
			time = san_nbr(time); // in seconds

			var timeSuffixMap = {
				"h": 3600,
				"d": 86400,
				"w": 86400*7,
				"m": 86400*30,
				"y": 31556925.216 //average year length
			};

			if(flag in timeSuffixMap) {
				time *= timeSuffixMap[flag];
			} else { 
				if(flag) { //invalid flag
					return serverChatResponse("Invalid flag used for muting, must be h, d, w, m, or y.")
				}
			}

			if(location == "global" && !user.staff) {
				return serverChatResponse("You do not have permission to mute on global", location);
			}

			var muted_ip = getClientIPByChatID(id, location == "global");

			if(muted_ip) {
				var muteDate = Date.now() + (time * 1000);
				var mute_wid = null;
				if(location == "global") {
					mute_wid = 0;
				} else if(location == "page") {
					mute_wid = world.id;
				}
				if(mute_wid == null) {
					return serverChatResponse("Invalid location", location);
				}
				if(!blocked_ips_by_world_id[mute_wid]) blocked_ips_by_world_id[mute_wid] = {};
				blocked_ips_by_world_id[mute_wid][muted_ip] = [muteDate];
				return serverChatResponse("Muted client until " + create_date(muteDate), location);
			} else {
				return serverChatResponse("Client not found", location);
			}
		},
		clearmutes: function() {
			if(!is_owner && !user.staff) return;
			var cnt = 0;
			if(location == "global" && user.staff) {
				if(blocked_ips_by_world_id["0"]) {
					cnt = Object.keys(blocked_ips_by_world_id["0"]).length;
					delete blocked_ips_by_world_id["0"];
				}
			} else {
				if(blocked_ips_by_world_id[world.id]) {
					cnt = Object.keys(blocked_ips_by_world_id[world.id]).length;
					delete blocked_ips_by_world_id[world.id];
				}
			}
			return serverChatResponse("Unmuted " + cnt + " user(s)", location);
		},
		whoami: function() {
			var idstr = "Who Am I:\n";
			var user_login = "(anonymous)";
			var user_disp = "(anonymous)";
			if(user.authenticated) {
				user_disp = username_to_display;
				if(accountSystem == "uvias") {
					user_login = user.username;
				} else {
					user_login = user_disp;
				}
			}
			idstr += "Login username: " + user_login + "\n";
			idstr += "Display username: " + user_disp + "\n";
			idstr += "Chat ID: " + clientId;
			return serverChatResponse(idstr, location);
		},
		delete: async function(id, timestamp) {
			if(!is_owner && !user.staff) return;
			id = san_nbr(id);
			timestamp = san_nbr(timestamp);
			var wid = world.id;
			if(location == "global") {
				if(!user.staff) {
					return serverChatResponse("You do not have permission to delete messages on global", location);
				}
				wid = 0;
			}
			var res = await remove_from_chatlog(wid, id, timestamp);
			if(res == 0) {
				return serverChatResponse("No messages deleted", location);
			}
			broadcast({
				kind: "chatdelete",
				id: id,
				time: timestamp
			});
			return serverChatResponse("Deleted " + res + " message(s)", location);
		},
		passive: function(mode) {
			if(mode == "on") {
				ws.sdata.passiveCmd = true;
			} else if(mode == "off") {
				ws.sdata.passiveCmd = false;
			}
		},
		test: function() {
			isTestMessage = true;
		}
	}

	var isCommand = (msg[0] == "/");
	var commandArgs, commandType;
	if(isCommand) {
		commandArgs = msg.slice(1).split(" ");
		commandType = commandArgs[0].toLowerCase();
	}

	// chat limiter
	var msNow = Date.now();
	var second = Math.floor(msNow / 1000);
	var chatsEverySecond = 2;
	if(location == "page") {
		if(is_member) chatsEverySecond = 8;
		if(is_owner) chatsEverySecond = 512;
	}
	if(isCommand && commandType != "tell") chatsEverySecond = 512;

	if(!chat_ip_limits[ipHeaderAddr]) {
		chat_ip_limits[ipHeaderAddr] = {};
	}
	var cil = chat_ip_limits[ipHeaderAddr];
	if(cil.lastChatSecond != second) {
		cil.lastChatSecond = second;
		cil.chatsSentInSecond = 0;
	} else {
		if(cil.chatsSentInSecond >= chatsEverySecond - 1) {
			if(!user.staff) {
				serverChatResponse("You are chatting too fast.", location);
				return;
			}
		} else {
			cil.chatsSentInSecond++;
		}
	}

	if(isCommand) {
		var operator = user.operator;
		var superuser = user.superuser;
		var staff = user.staff;

		switch(commandType) {
			case "worlds":
				if(superuser) com.worlds();
				return;
			case "help":
				com.help();
				return;
			case "uptime":
				com.uptime();
				return;
			case "block":
				com.block(commandArgs[1]);
				return;
			case "blockuser":
				com.blockuser(commandArgs[1]);
				return;
			case "unblock":
				com.unblock(commandArgs[1]);
				return;
			case "unblockuser":
				com.unblockuser(commandArgs[1]);
				return;
			case "unblockall":
				com.unblockall();
				return;
			case "tell":
				com.tell(commandArgs[1], commandArgs.slice(2).join(" "));
				return;
			case "channel":
				com.channel();
				return;
			case "mute":
				com.mute(commandArgs[1], commandArgs[2], commandArgs[3]);
				return;
			case "clearmutes":
				com.clearmutes();
				return;
			case "whoami":
				com.whoami();
				return;
			case "delete":
				com.delete(commandArgs[1], commandArgs[2]);
				return;
			case "passive":
				com.passive(commandArgs[1]);
				return;
			case "test":
				com.test();
				break;
			default:
				serverChatResponse("Invalid command: " + msg);
		}
	}

	var chatData = {
		nickname: nick,
		realUsername: username_to_display,
		id: clientId,
		message: msg,
		registered: user.authenticated,
		location: location,
		op: user.operator,
		admin: user.superuser,
		staff: user.staff,
		color: data.color,
		customMeta: data.customMeta
	};

	if(user.authenticated && user.id in ranks_cache.users) {
		var rank = ranks_cache[ranks_cache.users[user.id]];
		chatData.rankName = rank.name;
		chatData.rankColor = rank.chat_color;
	}

	// the plugin interface is subject to change - use at your own risk
	var chatPlugin = loadPlugin();
	if(chatPlugin && chatPlugin.chat) {
		var check = false;
		try {
			check = chatPlugin.chat({
				client: ws.sdata,
				user: user,
				world: world,
				message: {
					isCommand,
					isMuted,
					isOwner: is_owner,
					isMember: is_member,
					rankName: chatData.rankName,
					rankColor: chatData.rankColor,
					location: location,
					nickname: nick,
					username: username_to_display,
					message: msg,
					color: data.color,
					id: clientId
				}
			});
		} catch(e) {
			check = false;
		}
		if(check === true) {
			serverChatResponse("Message dropped.", location);
			return;
		}
	}

	if(!isCommand && !isMuted) {
		if(location == "page") {
			await add_to_chatlog(chatData, world.id);
		} else if(location == "global") {
			await add_to_chatlog(chatData, 0);
		}
	}

	if(!isCommand && user.operator && !safeOrigin) {
		msg = html_tag_esc(msg);
		chatData.message = msg;
	}

	if(isMuted) {
		var expTime = muteInfo[0];
		serverChatResponse("You are temporarily muted (" + calculateTimeDiff(expTime - Date.now()) + ")", location);
		return;
	}
	var websocketChatData = Object.assign({
		kind: "chat"
	}, chatData);

	var chatOpts = {
		// Global and Page updates should not appear in worlds with chat disabled
		isChat: true,
		location,
		clientId,
		username: user.authenticated ? username_to_display.toUpperCase() : null
	};

	if(isTestMessage) {
		websocketChatData.message = "This message is visible to only you.";
		send(websocketChatData);
	}

	if(!isCommand) {
		if(clientIpObj && location == "global") {
			clientIpObj[3] = Date.now();
		}
		if(location == "page") {
			broadcast(websocketChatData, chatOpts);
		} else if(location == "global") {
			ws_broadcast(websocketChatData, void 0, chatOpts);
		}
	}
}
