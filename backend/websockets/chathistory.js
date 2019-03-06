module.exports = async function(ws, data, send, vars, evars) {
    var transaction = evars.transaction;
    var broadcast = evars.broadcast; // broadcast to current world
    var clientId = evars.clientId;

    var db = vars.db;
    var user = vars.user;
    var world = vars.world;
    var san_nbr = vars.san_nbr;
    var tile_coord = vars.tile_coord;
    var modules = vars.modules;
    var ws_broadcast = vars.ws_broadcast; // site-wide broadcast
    var getWorldData = vars.getWorldData;
    var retrieveChatHistory = vars.retrieveChatHistory;

    var props = JSON.parse(world.properties);
    var chat_perm = props.chat_permission;
    var is_member = user.stats.member;
    var is_owner = user.stats.owner;

    var can_chat = false;
    if(chat_perm == 0 || chat_perm == undefined) can_chat = true;
    if(chat_perm === 1 && (is_member || is_owner)) can_chat = true;
    if(chat_perm === 2 && is_owner) can_chat = true;

    var page_chat_prev = [];

    if(can_chat) {
        page_chat_prev = await retrieveChatHistory(world.id)
    }
    
    send({
        global_chat_prev: await retrieveChatHistory(0),
        page_chat_prev
    })
}