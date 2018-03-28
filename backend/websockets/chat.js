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
    var html_tag_esc = vars.html_tag_esc;

    var props = JSON.parse(world.properties);
    var chat_perm = props.chat_permission;
    var is_member = user.stats.member;
    var is_owner = user.stats.owner;

    // sends `[ Server ]: <message>` in chat.
    function serverChatResponse(message, location) {
        send({
            kind: "chat",
            nickname: "[ Server ]",
            realUsername: "server",
            id: 0,
            message: message,
            registered: true,
            location: location
        })
    }
    
    var can_chat = false;
    if(chat_perm == 0 || chat_perm == undefined) can_chat = true;
    if(chat_perm === 1 && (is_member || is_owner)) can_chat = true;
    if(chat_perm === 2 && is_owner) can_chat = true;

    if(!(data.location == "global" || data.location == "page")) data.location = "page";

    if(data.location == "page" && !can_chat) {
        serverChatResponse("You do not have permission to chat here", "page")
        return;
    }

    var nick = "";
    if(data.nickname) {
        nick = data.nickname + "";
    }
    if(!user.staff) nick = nick.slice(0, 20);

    var msg = "";
    if(data.message) {
        msg = data.message + "";
    }

    if(!msg) return;

    var msNow = Date.now();

    var second = Math.floor(msNow / 1000);
    var chatsEverySecond = 3

    if(ws.lastChatSecond != second) {
        ws.lastChatSecond = second;
        ws.chatsSentInSecond = 0;
    } else {
        if(ws.chatsSentInSecond >= chatsEverySecond) {
            if(!user.staff) {
                serverChatResponse("You are chatting too fast.", data.location);
                return;
            }
        } else {
            ws.chatsSentInSecond++;
        }
    }

    if(!user.staff) msg = msg.slice(0, 600);

    var temporary_broadcast_function = broadcast;
    if(data.location == "global") {
        temporary_broadcast_function = ws_broadcast;
    }

    var chatData = {
        nickname: user.operator ? nick : html_tag_esc(nick),
        realUsername: user.username,
        id: clientId,
        message: user.operator ? msg : html_tag_esc(msg),
        registered: user.authenticated,
        location: data.location,
        op: user.operator,
        admin: user.superuser,
        staff: user.staff
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