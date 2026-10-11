var { checkWhitelistFeature } = require("../utils/whitelist.js");

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var world = ctx.world;

	var chat_mgr = server.chat_mgr;
	var getServerSetting = server.getServerSetting;

	var retrieveChatHistory = chat_mgr.retrieveChatHistory;
	var isGlobalEnabled = getServerSetting("chatGlobalEnabled") == "1";

	var chat_perm = world.feature.chat;
	var is_member = !!world.members.map[user.id];
	var is_owner = user.id == world.ownerId;

	var ipHeaderAddr = ws.sdata.ipAddress;
	var wl_can_load_chat = checkWhitelistFeature(user.id, user.authenticated, ipHeaderAddr, world.name, "load_chat", server);
	if(!wl_can_load_chat) {
		return;
	}

	var can_chat = false;
	if(!chat_perm) can_chat = true;
	if(chat_perm === 1 && (is_member || is_owner)) can_chat = true;
	if(chat_perm === 2 && is_owner) can_chat = true;

	var page_chat_prev = [];
	var global_chat_prev = [];

	if(can_chat) {
		page_chat_prev = await retrieveChatHistory(world.id);
	}
	if(isGlobalEnabled) {
		global_chat_prev = await retrieveChatHistory(0);
	}
	
	send({
		global_chat_prev,
		page_chat_prev
	});
}