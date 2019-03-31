var selectedChatTab     = 0; // 0 is the page chat, 1 is the global chat
var chatOpen            = 0;
var chatPageUnread      = 0;
var chatGlobalUnread    = 0;
var initPageTabOpen     = false;
var initGlobalTabOpen   = false;
var chatWriteHistory    = []; // history of user's chats
var chatWriteHistoryMax = 100; // maximum size of chat write history length
var chatWriteHistoryIdx = -1; // location in chat write history
var serverPingTime      = 0;

var chat_window      = document.getElementById("chat_window");
var chat_open        = document.getElementById("chat_open");
var chatsend         = document.getElementById("chatsend");
var chatbar          = document.getElementById("chatbar");
var chat_close       = document.getElementById("chat_close");
var page_chatfield   = document.getElementById("page_chatfield");
var global_chatfield = document.getElementById("global_chatfield");
var chat_page_tab    = document.getElementById("chat_page_tab");
var chat_global_tab  = document.getElementById("chat_global_tab");
var usr_online       = document.getElementById("usr_online");
var total_unread     = document.getElementById("total_unread");
var page_unread      = document.getElementById("page_unread");
var global_unread    = document.getElementById("global_unread");

if(state.userModel.is_staff) {
    chatbar.maxLength = 3030;
} else {
    chatbar.maxLength = 400;
}

var canChat = Permissions.can_chat(state.userModel, state.worldModel);
if(!canChat) {
    selectedChatTab = 1;
    chat_window.style.display = "none";
} else {
    chat_open.style.display = "";
}

function api_chat_send(message, opts) {
    if(!message) return;
    message = message.replace(/\uFDFD/g, "");
    if(!opts) opts = {};
    var exclude_commands = opts.exclude_commands;
    var nick = opts.nick || YourWorld.Nickname;
    var location = opts.location ? opts.location : (selectedChatTab == 0 ? "page" : "global");

    var msgLim = state.userModel.is_staff ? 3030 : 400;

    message = message.slice(0, msgLim).trim();
    chatWriteHistory.push(message);
    if(chatWriteHistory.length > chatWriteHistoryMax) {
        chatWriteHistory.shift();
    }
    chatWriteHistoryIdx = -1;

    var chatColor;
    if(!opts.color) {
        if(!YourWorld.Color) {
            chatColor = assignColor(YourWorld.Nickname)
        } else {
            chatColor = "#" + ("00000" + YourWorld.Color.toString(16)).slice(-6);
        };
    } else {
        chatColor = opts.color;
    }

    if(!exclude_commands && message.startsWith("/")) {
        var args = message.substr(1).split(" ");
        var command = args[0].toLowerCase();
        args.shift();
        if(client_commands[command]) {
            client_commands[command](args);
            return;
        }
    }
    var isCommand = false;
    if(!exclude_commands && message.startsWith("/")) {
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

    var type = chatType(registered, nickname, username);

    var op = opts.op || state.userModel.is_operator;
    var admin = opts.admin || state.userModel.is_superuser;
    var staff = opts.staff || state.userModel.is_staff;

    if(!isCommand) addChat(location, id, type, nickname,
                            message, username, op, admin, staff, chatColor, Date.now());
};

var client_commands = {
    nick: function (args) {
        var newDisplayName = args.join(" ");
        if(!newDisplayName) {
            newDisplayName = state.userModel.username;
        }
        var nickLim = state.userModel.is_staff ? Infinity : 40;
        newDisplayName = newDisplayName.slice(0, nickLim);
        YourWorld.Nickname = newDisplayName;
        storeNickname();
        var nickChangeMsg;
        if(newDisplayName) {
            nickChangeMsg = "Set nickname to `" + newDisplayName + "`";
        } else {
            nickChangeMsg = "Removed nickname";
        }
        addChat(null, 0, "user", "[ Server ]", nickChangeMsg, "Server", false, false, false, null, Date.now());
    },
    ping: function() {
        serverPingTime = Date.now();
        socket.send("2::@");
    },
    gridsize: function (args) {
        var size = args[0];
        if(!size) size = "10x18";
        size = size.split("x");
        var width = parseInt(size[0]);
        var height = parseInt(size[1]);
        if(!width || isNaN(width) || !isFinite(width)) width = 10;
        if(!height || isNaN(height) || !isFinite(height)) height = 18;
        if(width < 4) width = 4;
        if(width > 160) width = 160;
        if(height < 4) height = 4;
        if(height > 144) height = 144;
        defaultSizes.cellW = width;
        defaultSizes.cellH = height;
        updateScaleConsts();
        for(var i in tilePixelCache) delete tilePixelCache[i];
        renderTiles(true);
        addChat(null, 0, "user", "[ Server ]", "Changed grid size to " + width + "x" + height, "Server", false, false, false, null, Date.now());
    },
    color: function(args) {
        var color = args[0];
        if(!color) color = "000000";
        if(color.charAt(0) == "#") color = color.substr(1);
        if(!color) color = 0;
        YourWorld.Color = parseInt(color, 16);
        if(isNaN(color)) color = 0;
        addChat(null, 0, "user", "[ Server ]", "Changed text color to #" + ("00000" + YourWorld.Color.toString(16)).slice(-6).toUpperCase(), "Server", false, false, false, null, Date.now());
    },
    chatcolor: function(args) {
        var color = args[0];
        if(!color) color = "000000";
        if(color.charAt(0) == "#") color = color.substr(1);
        if(!color) color = 0;
        defaultChatColor = parseInt(color, 16);
        if(isNaN(color)) color = 0;
        addChat(null, 0, "user", "[ Server ]", "Changed chat color to #" + ("00000" + defaultChatColor.toString(16)).slice(-6).toUpperCase(), "Server", false, false, false, null, Date.now());
    },
    warp: function(args) {
        var address = args[0];
        if(!address) address = "";
        positionX = 0;
        positionY = 0;
        if(address.charAt(0) == "/") address = address.substr(1);
        state.worldModel.pathname = "/" + address;
        createWsPath();
        socket.close()
        createSocket();
        clearTiles(true);
        clearInterval(fetchInterval);
        addChat(null, 0, "user", "[ Server ]", "Switching to world: \"" + address + "\"", "Server", false, false, false, null, Date.now());
    },
    warpserver: function(args) {
        var address = args[0];
        if(!address) {
            createWsPath();
        } else {
            ws_path = address;
        }
        positionX = 0;
        positionY = 0;
        socket.close()
        createSocket();
        clearTiles(true);
        clearInterval(fetchInterval);
        addChat(null, 0, "user", "[ Server ]", "Switching to server: " + ws_path, "Server", false, false, false, null, Date.now());
    },
    night: function() {
        w.night();
    }
}

// Performs send-chat-operation on chatbox
function sendChat() {
    var chatText = chatbar.value;
    chatbar.value = "";
    var opts = {};
    if(defaultChatColor != null) {
        opts.color = "#" + ("00000" + defaultChatColor.toString(16)).slice(-6)
    }
    api_chat_send(chatText, opts);
}

function updateUnread() {
    var total = total_unread;
    var page = page_unread;
    var global = global_unread;
    var totalCount = chatPageUnread + chatGlobalUnread;
    total.style.display = "none";
    global.style.display = "none";
    page.style.display = "none";
    if(totalCount) {
        total.style.display = "";
        total.innerText = totalCount > 99 ? "99+" : "(" + totalCount + ")";
    }
    if(chatPageUnread) {
        page.style.display = "";
        page.innerText = chatPageUnread > 99 ? "99+" : "(" + chatPageUnread + ")";
    }
    if(chatGlobalUnread) {
        global.style.display = "";
        global.innerText = chatGlobalUnread > 99 ? "99+" : "(" + chatGlobalUnread + ")";
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
        data.nickname, data.message, data.realUsername, data.op, data.admin, data.staff, data.color, Date.now(), data.dataObj);
}

chatsend.addEventListener("click", function() {
    sendChat();
})

chatbar.addEventListener("keypress", function(e) {
    var keyCode = e.keyCode;
    if(keyCode == 13) { // Enter
        sendChat();
        chatbar.blur();
    }
})

chatbar.addEventListener("keydown", function(e) {
    var keyCode = e.keyCode;

    // scroll through chat history that the client sent
    if(keyCode == 38) { // up
        chatWriteHistoryIdx++;
        if(chatWriteHistoryIdx >= chatWriteHistory.length) chatWriteHistoryIdx = chatWriteHistory.length - 1;
        var upVal = chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1];
        if(!upVal) return;
        chatbar.value = upVal;
    } else if(keyCode == 40) { // down
        chatWriteHistoryIdx--;
        if(chatWriteHistoryIdx < -1) chatWriteHistoryIdx = -1;
        var str = "";
        if(chatWriteHistoryIdx != -1) {
            str = chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1];
        }
        chatbar.value = str;
    }
})

chat_close.addEventListener("click", function() {
    chat_window.style.display = "none";
    chat_open.style.display = "";
    chatOpen = false;
})

chat_open.addEventListener("click", function() {
    chat_window.style.display = "";
    chat_open.style.display = "none";
    chatOpen = true;
    if(selectedChatTab == 0) {
        chatPageUnread = 0;
        updateUnread();
        if(!initPageTabOpen) {
            initPageTabOpen = true;
            page_chatfield.scrollTop = page_chatfield.scrollHeight;
        }
    } else {
        chatGlobalUnread = 0;
        updateUnread();
        if(!initGlobalTabOpen) {
            initGlobalTabOpen = true;
            global_chatfield.scrollTop = global_chatfield.scrollHeight;
        }
    }
})

chat_page_tab.addEventListener("click", function() {
    chat_global_tab.style.backgroundColor = "";
    chat_global_tab.style.color = "";
    chat_page_tab.style.backgroundColor = "#8c8c8c";
    chat_page_tab.style.color = "white";

    global_chatfield.style.display = "none";
    page_chatfield.style.display=  "";
    selectedChatTab = 0;
    chatPageUnread = 0;
    updateUnread();
    if(!initPageTabOpen) {
        initPageTabOpen = true;
        page_chatfield.scrollTop = page_chatfield.scrollHeight;
    }
})

chat_global_tab.addEventListener("click", function() {
    chat_global_tab.style.backgroundColor = "#8c8c8c";
    chat_global_tab.style.color = "white";
    chat_page_tab.style.backgroundColor = "";
    chat_page_tab.style.color = "";

    global_chatfield.style.display = "";
    page_chatfield.style.display = "none";
    selectedChatTab = 1;
    chatGlobalUnread = 0;
    updateUnread();
    if(!initGlobalTabOpen) {
        initGlobalTabOpen = true;
        global_chatfield.scrollTop = global_chatfield.scrollHeight;
    }
})

/*
    [type]:
    * "user"      :: registered non-renamed nick
    * "anon_nick" :: unregistered nick
    * "anon"      :: unregistered
    * "user_nick" :: registered renamed nick
*/
function addChat(chatfield, id, type, nickname, message, realUsername, op, admin, staff, color, date, dataObj) {
    if(!dataObj) dataObj = {};
    if(!nickname) nickname = "";
    if(!message) message = "";
    if(!realUsername) realUsername = "";
    if(!color) color = assignColor(nickname);
    var dateStr = "";
    if(date) dateStr = convertToDate(date);
    var field;
    if(chatfield == "page") {
        field = document.getElementById("page_chatfield");
    } else if(chatfield == "global") {
        field = document.getElementById("global_chatfield");
    } else {
        field = getChatfield();
    }

    if(!op) message = html_tag_esc(message);
    if(!op) nickname = html_tag_esc(nickname);

     // do not give the tag to [ Server ]
    var hasTagDom = (op || admin || staff || dataObj.rankName) && !(!id && op);

    var tagDom;
    var nickTitle = [];

    if(type == "user" || type == "user_nick") {
        nickTitle.push("ID " + id);
    }

    if(hasTagDom) {
        tagDom = document.createElement("span");
        if(dataObj.rankName) {
            tagDom.innerHTML = "(" + dataObj.rankName + ")";
            tagDom.style.color = dataObj.rankColor;
            tagDom.style.fontWeight = "bold";
            nickTitle.push(dataObj.rankName);
        } else if(op) {
            tagDom.innerHTML = "(OP)";
            tagDom.style.color = "#0033cc";
            tagDom.style.fontWeight = "bold";
            nickTitle.push("Operator");
        } else if(admin) {
            tagDom.innerHTML = "(A)";
            tagDom.style.color = "#FF0000";
            tagDom.style.fontWeight = "bold";
            nickTitle.push("Administrator");
        } else if(staff) {
            tagDom.innerHTML = "(M)";
            tagDom.style.color = "#009933";
            tagDom.style.fontWeight = "bold";
            nickTitle.push("Staff");
        }
        tagDom.innerHTML += "&nbsp;";
    }

    var idTag = "";

    var nickDom = document.createElement("a");
    nickDom.style.textDecoration = "underline";

    if(type == "user") {
        nickDom.style.color = color;
        nickDom.style.fontWeight = "bold";
        nickDom.style.pointerEvents = "default";
        if(state.userModel.is_operator) idTag = "[" + id + "]";
    }
    if(type == "anon_nick") {
        idTag = "[*" + id + "]"
    }
    if(type == "anon") {
        idTag = "[" + id + "]"
    }
    if(type == "user_nick") {
        nickDom.style.color = color;
        nickTitle.push("Username \"" + realUsername + "\"");
        if(state.userModel.is_operator) idTag = "[*" + id + "]";
    }

    if(state.userModel.is_operator) {
        idTag = "<span style=\"color: black; font-weight: normal;\">" + idTag + "</span>"
    }

    if(idTag) idTag += "&nbsp;"; // space between id and name

    if(id == 0) {
        idTag = "";
        nickname = "<span style=\"background-color: #e2e2e2;\">" + nickname + "</span>";
    };

    nickname = idTag + nickname;

    if(dateStr) nickTitle.push("(" + dateStr + ")");

    nickDom.innerHTML = nickname + ":";
    if(nickTitle.length) nickDom.title = nickTitle.join("; ");

    var msgDom = document.createElement("span");
    msgDom.innerHTML = "&nbsp;" + message;

    var maxScroll = field.scrollHeight - field.clientHeight;
    var scroll = field.scrollTop;
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

    field.appendChild(chatGroup);

    maxScroll = field.scrollHeight - field.clientHeight;
    if(doScrollBottom) {
        field.scrollTop = maxScroll;
    }
}

function getChatfield(elm) {
    if(selectedChatTab == 0) {
        return document.getElementById("page_chatfield");
    } else if(selectedChatTab == 1) {
        return document.getElementById("global_chatfield");
    }
}

function updateUserCount() {
    var count = w.userCount;
    if(count == void 0) {
        usr_online.innerText = "";
        return;
    }
    var plural = "s";
    if(count == 1) plural = "";
    usr_online.innerText = count + " user" + plural + " online";
}

function chatType(registered, nickname, realUsername) {
    var nickMatches = (nickname + "").toUpperCase() == (realUsername + "").toUpperCase();
    if(realUsername == "[ Server ]") return "user"
    var type = "";
    if(registered && nickMatches) type = "user";
    if(registered && !nickMatches) type = "user_nick";
    if(!registered && !nickname) type = "anon";
    if(!registered && nickname) type = "anon_nick";
    return type;
}
