var utils = require("../utils/utils.js");
var html_tag_esc = utils.html_tag_esc;
var san_nbr = utils.san_nbr;
var calculateTimeDiff = utils.calculateTimeDiff;
var create_date = utils.create_date;
var getClientIPByChatID = utils.getClientIPByChatID;

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
		if(Object.prototype.hasOwnProperty(k)) continue;

		var v = meta[k];
		if(typeof v != "string" && typeof v != "number") continue;
		if(v.length > 400) continue;

		output[k] = v;
	}

	return output;
}

var chat_ip_limits = {};

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var channel = ctx.channel;
	var user = ctx.user;
	var world = ctx.world;

	var db = server.db;
	var ws_broadcast = server.ws_broadcast; // site-wide broadcast
	var chat_mgr = server.chat_mgr;
	var tell_blocks = chat_mgr.tell_blocks;
	var wss = server.wss;
	var ranks_cache = server.ranks_cache;
	var accountSystem = server.accountSystem;
	var client_ips = server.client_ips;
	var wsSend = server.wsSend;
	var broadcastMonitorEvent = server.broadcastMonitorEvent;
	var loadPlugin = server.loadPlugin;
	var getServerSetting = server.getServerSetting;

	var add_to_chatlog = chat_mgr.add_to_chatlog;

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

	var muteInfo = chat_mgr.getMuteInfo(location == "global" ? 0 : world.id, ipHeaderAddr);
	var isMuted = false;
	if (muteInfo) isMuted = true;

	if(isMuted) {
		var expTime = muteInfo[0];
		if(!expTime || typeof expTime != "number" || Date.now() >= expTime) {
			isMuted = false;
			chat_mgr.unmute(location == "global" ? 0 : world.id, ipHeaderAddr);
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

	// [rank, name, args, description, example]
	var command_list = [
		// general
		[0, "help", null, "list all commands", null]

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

			var rawArgs = "";
			var rawExample = "";
			if(example) rawExample = " (/" + command + " " + example + ")";
			if(args) rawArgs = " <" + args.join(",") + ">";

			html += `/${command}${rawArgs} -> ${desc}${rawExample}\n`;

		}
		return html;
	}

	var com = {
		help: function(modifier) {
			return serverChatResponse(generate_command_list(), location);
		},
		passive: function(mode) {
			if(mode == "on") {
				ws.sdata.passiveCmd = true;
			} else if(mode == "off") {
				ws.sdata.passiveCmd = false;
			}
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
	if(isCommand) chatsEverySecond = 512;

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
			case "help":
				com.help();
				return;
			case "passive":
				com.passive(commandArgs[1]);
				return;
			default:
				serverChatResponse("Invalid command: " + msg);
		}
	}

	if(data.privateMessageTo) {
		var noClient = false;
		var id = san_nbr(data.privateMessageTo);

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

		if(isMuted) return;

		if(noClient) {
			return serverChatResponse("User not found", location);
		}

		var privateMessage = {
			nickname: nick,
			realUsername: username_to_display,
			id: clientId, // client id of sender
			message: msg,
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
			message: msg,
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
		if(client.sdata.chat_blocks.block_all) return;
		if(client.sdata.chat_blocks.no_tell) return;
		if(client.sdata.chat_blocks.no_anon && !user.authenticated) return;
		if(client.sdata.chat_blocks.no_reg && user.authenticated) return;
		if(user.authenticated && client.sdata.chat_blocks.user.includes(username_to_display.toUpperCase())) {
			return; // sender username is blocked by destination user
		}

		// user has blocked the TELLer by IP
		var tellblock = tell_blocks[client.sdata.ipAddress];
		if(tellblock && tellblock[ipHeaderAddr]) {
			return;
		}

		wsSend(client, JSON.stringify(privateMessage));
		if(clientIpObj && location == "global") {
			clientIpObj[3] = Date.now();
		}
		broadcastMonitorEvent("TellSpam", "Tell from " + clientId + " (" + ipHeaderAddr + ") to " + id + ", first 4 chars: [" + msg.slice(0, 4) + "]");
		return;
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
