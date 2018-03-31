module.exports = async function(ws, data, send, vars) {
    var db = vars.db;
    var user = vars.user;
    var world = vars.world;
    var transaction = vars.transaction;
    var san_nbr = vars.san_nbr;
    var tile_coord = vars.tile_coord;
    var modules = vars.modules;
    var broadcast = vars.broadcast; // broadcast to current world
    var clientId = vars.clientId;
    var ws_broadcast = vars.ws_broadcast; // site-wide broadcast
    var getWorldData = vars.getWorldData;
    var getGlobalChatlog = vars.getGlobalChatlog;

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
        page_chat_prev = getWorldData(world.name).chatlog.slice(-100);
    }

    send({
        global_chat_prev: getGlobalChatlog().slice(-100),
        page_chat_prev
    })
}