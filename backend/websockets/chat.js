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
    var add_global_chatlog = vars.add_global_chatlog;
    var add_page_chatlog = vars.add_page_chatlog;

    var chatsPerSecond = Math.trunc(1000 / 20);
    var msNow = Date.now();
    
    var lastSent = ws.lastSent;
    if(!lastSent) lastSent = 0;

    if(msNow - lastSent < chatsPerSecond) return;

    ws.lastSent = msNow;

    var nick = "";
    if(data.nickname) {
        nick = data.nickname + "";
    }
    nick = nick.slice(0, 20);

    var msg = "";
    if(data.message) {
        msg = data.message + "";
    }

    if(!msg) return;

    msg = msg.slice(0, 600);

    if(!(data.location == "global" || data.location == "page")) data.location = "page";

    var temporary_broadcast_function = broadcast;
    if(data.location == "global") {
        temporary_broadcast_function = ws_broadcast;
    }

    var chatData = {
        nickname: nick,
        realUsername: user.username,
        id: clientId,
        message: msg,
        registered: user.authenticated,
        location: data.location
    };

    if(data.location == "page") {
        add_page_chatlog(chatData, world.name);
    } else if(data.location == "global") {
        add_global_chatlog(chatData);
    }

    temporary_broadcast_function(Object.assign({
        kind: "chat",
        channel: vars.channel
    }, chatData))
}