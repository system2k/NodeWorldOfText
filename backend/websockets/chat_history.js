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