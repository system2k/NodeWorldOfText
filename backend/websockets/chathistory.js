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

    send({
        global_chat_prev: getGlobalChatlog(),
        page_chat_prev: getWorldData(world.name).chatlog
    })
}