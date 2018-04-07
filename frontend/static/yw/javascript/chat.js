var selectedChatTab   = 0; // 0 is the page chat, 1 is the global chat
var chatOpen          = 0;
var chatPageUnread    = 0;
var chatGlobalUnread  = 0;
var initPageTabOpen   = false;
var initGlobalTabOpen = false;

var canChat = Permissions.can_chat(state.userModel, state.worldModel);
if(!canChat) { // can't chat, adjust the chat window for it
    selectedChatTab = 1;
    $("#chat_window").hide();
    $("#chat_open").hide();
}

function api_chat_send(message, opts) {
    if(!message) return;
    if(!opts) opts = {};
    var exclude_commands = opts.exclude_commands;
    var nick = opts.nick || YourWorld.Nickname;
    var location = opts.location ? opts.location : (selectedChatTab == 0 ? "page" : "global");

    var msgLim = state.userModel.is_staff ? Infinity : 400;
    var nickLim = state.userModel.is_staff ? Infinity : 20;

    message = trimSpace(message.slice(0, msgLim));

    var chatColor;
    if(!opts.color) {
        if(!YourWorld.Color) {
            chatColor = assignColor(YourWorld.Nickname)
        } else {
            chatColor = "#" + ("00000" + YourWorld.Color.toString(16)).slice(-6).toUpperCase();
        };
    } else {
        chatColor = opts.color;
    }

    if(!exclude_commands) {
        var nickCommand = "/nick";
        if(message.startsWith(nickCommand)) {
            message = trimSpace(message.substr(nickCommand.length));
            var newNick = message.slice(0, nickLim);
            if(!newNick) {
                newNick = state.userModel.username;
            }
            YourWorld.Nickname = newNick;
            storeNickname();
            var nickChangeMsg = "Set nickname to `" + message + "`";
            if(message == "") {
                nickChangeMsg = "Reset nickname"
            }
            addChat(null, 0, "user", "[ Server ]", nickChangeMsg, "Server");
            return;
        }
    }
    var isCommand = false;
    if(!exclude_commands && (message.startsWith("/") || message.startsWith("\\"))) {
        isCommand = true;
    }

    socket.send(JSON.stringify({
        kind: "chat",
        nickname: nick,
        message: message,
        location: location,
        color: chatColor
    }));

    var registered = state.userModel.authenticated;
    var username = state.userModel.username;
    var id = w.clientId;
    var nickname = YourWorld.Nickname;

    var type = "";
    if(registered && nickname == username) type = "user";
    if(registered && nickname != username) type = "user_nick";
    if(!registered && !nickname) type = "anon";
    if(!registered && nickname) type = "anon_nick";

    var op = opts.op || state.userModel.is_operator;
    var admin = opts.admin || state.userModel.is_superuser;
    var staff = opts.staff || state.userModel.is_staff;

    if(!isCommand) addChat(location, id, type, nickname,
                            message, username, op, admin, staff, chatColor);
};

// Performs send-chat-operation on chatbox
function sendChat() {
    var chatText = $("#chatbar")[0].value;
    $("#chatbar")[0].value = "";
    api_chat_send(chatText);
}

function updateUnread() {
    var total = $("#total_unread");
    var page = $("#page_unread");
    var global = $("#global_unread");
    var totalCount = chatPageUnread + chatGlobalUnread;
    total.hide();
    global.hide();
    page.hide();
    if(totalCount) {
        total.show();
        total.text(totalCount > 99 ? "99+" : "(" + totalCount + ")");
    }
    if(chatPageUnread) {
        page.show();
        page.text(chatPageUnread > 99 ? "99+" : "(" + chatPageUnread + ")");
    }
    if(chatGlobalUnread) {
        global.show();
        global.text(chatGlobalUnread > 99 ? "99+" : "(" + chatGlobalUnread + ")");
    }
}

function event_on_chat(data) {
    if((!chatOpen || selectedChatTab == 1) && data.location == "page") {
        chatPageUnread++;
    }
    if((!chatOpen || selectedChatTab == 0) && data.location == "global") {
        chatGlobalUnread++;
    }
    updateUnread()
    addChat(data.location, data.id, data.type,
        data.nickname, data.message, data.realUsername, data.op, data.admin, data.staff, data.color);
}

$("#chatsend").on("click", function() {
    sendChat();
})

$("#chatbar").on("keypress", function(e) {
    var keyCode = e.keyCode;
    if(keyCode == 13) { // Enter
        sendChat();
    }
})

$("#chat_close").on("click", function() {
    $("#chat_window").hide();
    $("#chat_open").show();
    chatOpen = false;
})

$("#chat_open").on("click", function() {
    $("#chat_window").show();
    $("#chat_open").hide();
    chatOpen = true;
    if(selectedChatTab == 0) {
        chatPageUnread = 0;
        updateUnread();
        if(!initPageTabOpen) {
            initPageTabOpen = true;
            $("#page_chatfield")[0].scrollTop = $("#page_chatfield")[0].scrollHeight;
        }
    } else {
        chatGlobalUnread = 0;
        updateUnread();
        if(!initGlobalTabOpen) {
            initGlobalTabOpen = true;
            $("#global_chatfield")[0].scrollTop = $("#global_chatfield")[0].scrollHeight;
        }
    }
})

$("#chat_page_tab").on("click", function() {
    $("#chat_global_tab")[0].style.backgroundColor = "";
    $("#chat_global_tab")[0].style.color = "";
    $("#chat_page_tab")[0].style.backgroundColor = "#8c8c8c";
    $("#chat_page_tab")[0].style.color = "white";

    $("#global_chatfield").hide();
    $("#page_chatfield").show();
    selectedChatTab = 0;
    chatPageUnread = 0;
    updateUnread();
    if(!initPageTabOpen) {
        initPageTabOpen = true;
        $("#page_chatfield")[0].scrollTop = $("#page_chatfield")[0].scrollHeight;
    }
})

$("#chat_global_tab").on("click", function() {
    $("#chat_global_tab")[0].style.backgroundColor = "#8c8c8c";
    $("#chat_global_tab")[0].style.color = "white";
    $("#chat_page_tab")[0].style.backgroundColor = "";
    $("#chat_page_tab")[0].style.color = "";

    $("#global_chatfield").show();
    $("#page_chatfield").hide();
    selectedChatTab = 1;
    chatGlobalUnread = 0;
    updateUnread();
    if(!initGlobalTabOpen) {
        initGlobalTabOpen = true;
        $("#global_chatfield")[0].scrollTop = $("#global_chatfield")[0].scrollHeight;
    }
})

/*
    [type]:
    * "user"      :: registered non-renamed nick
    * "anon_nick" :: unregistered nick
    * "anon"      :: unregistered
    * "user_nick" :: registered renamed nick
*/
function addChat(chatfield, id, type, nickname, message, realUsername, op, admin, staff, color) {
    if(!nickname) nickname = "";
    if(!message) message = ""; // Should this even happen?
    if(!realUsername) realUsername = "";
    if(!color) color = assignColor(nickname);
    var field;
    if(chatfield == "page") {
        field = $("#page_chatfield");
    } else if(chatfield == "global") {
        field = $("#global_chatfield");
    } else {
        field = getChatfield();
    }

    var hasTagDom = op || admin || staff;

    var tagDom;
    if(hasTagDom) {
        tagDom = document.createElement("span");
        if(op) {
            tagDom.innerText = "(OP) ";
            tagDom.style.color = "#0033cc";
            tagDom.style.fontWeight = "bold";
        } else if(admin) {
            tagDom.innerText = "(A) ";
            tagDom.style.color = "#FF0000";
            tagDom.style.fontWeight = "bold";
        } else if(staff) {
            tagDom.innerText = "(M) ";
            tagDom.style.color = "#009933";
            tagDom.style.fontWeight = "bold";
        }
    }

    var nickDom = document.createElement("a");
    nickDom.style.textDecoration = "underline";

    if(type == "user") {
        nickDom.style.color = color;
        nickDom.href = "javascript:alert(\"Registered; " + realUsername + "\")"
        nickDom.style.fontWeight = "bold";
    }
    if(type == "anon_nick") {
        nickname = "[*" + id + "] " + nickname;
    }
    if(type == "anon") {
        nickname = "[" + id + "]";
    }
    if(type == "user_nick") {
        nickDom.style.color = color;
        nickDom.href = "javascript:alert(\"Registered; " + realUsername + "\")"
    }
    nickDom.innerHTML = nickname + ":";

    var msgDom = document.createElement("span");
    msgDom.innerHTML = "&nbsp;" + message;

    var maxScroll = field[0].scrollHeight - field[0].clientHeight;
    var scroll = field[0].scrollTop;
    var doScrollBottom = false;
    if(maxScroll - scroll < 20) { // if scrolled at least 20 pixels above bottom
        doScrollBottom = true;
    }

    var chatGroup = document.createElement("div");
    if(hasTagDom) {
        chatGroup.appendChild(tagDom);
    }
    chatGroup.appendChild(nickDom);
    chatGroup.appendChild(msgDom);

    chatGroup.style.wordWrap = "break-word";
    chatGroup.style.wordBreak = "break-all";

    field.append(chatGroup);

    maxScroll = field[0].scrollHeight - field[0].clientHeight;
    if(doScrollBottom) {
        field[0].scrollTop = maxScroll;
    }
}

function getChatfield(elm) {
    if(selectedChatTab == 0) {
        return $("#page_chatfield");
    } else if(selectedChatTab == 1) {
        return $("#global_chatfield");
    }
}

function updateUsrCount() {
    var count = w.userCount;
    var plural = "s";
    if(count == 1) plural = "";
    $("#usr_online").text(count + " user" + plural + " online");
}

function chatType(registered, nickname, realUsername) {
    if(realUsername == "server") return "user"
    var type = "";
    if(registered && nickname == realUsername) type = "user";
    if(registered && nickname != realUsername) type = "user_nick";
    if(!registered && !nickname) type = "anon";
    if(!registered && nickname) type = "anon_nick";
    return type;
}
