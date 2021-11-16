module.exports = async function(ws, data, send, vars, evars) {
	var broadcast = evars.broadcast; // broadcast to current world
	var clientId = evars.clientId;
	var user = evars.user;
	var world = evars.world;

	var db = vars.db;
	var san_nbr = vars.san_nbr;
	var tile_coord = vars.tile_coord;
	var modules = vars.modules;
	var ws_broadcast = vars.ws_broadcast; // site-wide broadcast
	var getWorldData = vars.getWorldData;
	var chat_mgr = vars.chat_mgr;

	var retrieveChatHistory = chat_mgr.retrieveChatHistory;

	//var props = JSON.parse(world.properties);
	var chat_perm = world.feature.chat; //props.chat_permission;
	var is_member = user.stats.member;
	var is_owner = user.stats.owner;

	var can_chat = false;
	if(!chat_perm) can_chat = true;
	if(chat_perm === 1 && (is_member || is_owner)) can_chat = true;
	if(chat_perm === 2 && is_owner) can_chat = true;

	var page_chat_prev = [];

	if(can_chat) {
		page_chat_prev = await retrieveChatHistory(world.id)
	}
	
	send({
		global_chat_prev: await retrieveChatHistory(0),
		page_chat_prev
	});
}