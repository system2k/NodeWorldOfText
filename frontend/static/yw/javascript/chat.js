var selectedChatTab      = 0; // 0 is the page chat, 1 is the global chat
var chatOpen             = 0;
var chatPageUnread       = 0;
var chatGlobalUnread     = 0;
var initPageTabOpen      = false;
var initGlobalTabOpen    = false;
var chatWriteHistory     = []; // history of user's chats
var chatRecordsPage      = [];
var chatRecordsGlobal    = [];
var chatWriteHistoryMax  = 100; // maximum size of chat write history length
var chatHistoryLimit     = 3500;
var chatWriteHistoryIdx  = -1; // location in chat write history
var chatLimitCombChars   = true;
var chatWriteTmpBuffer   = "";
var defaultChatColor     = window.localStorage ? parseInt(localStorage.getItem("chatcolor")) : null; // 24-bit Uint
var chatPageUnreadBar    = null;
var chatGlobalUnreadBar  = null;
var chatGreentext        = true;
var chatEmotes           = true;
var acceptChatDeletions  = true;

if(isNaN(defaultChatColor)) {
	defaultChatColor = null;
} else {
	if(defaultChatColor < 0) defaultChatColor = 0;
	if(defaultChatColor > 16777215) defaultChatColor = 16777215;
}

defineElements({ // elm[<name>]
	chat_window: byId("chat_window"),
	chat_open: byId("chat_open"),
	chatsend: byId("chatsend"),
	chatbar: byId("chatbar"),
	chat_close: byId("chat_close"),
	page_chatfield: byId("page_chatfield"),
	global_chatfield: byId("global_chatfield"),
	chat_page_tab: byId("chat_page_tab"),
	chat_global_tab: byId("chat_global_tab"),
	usr_online: byId("usr_online"),
	total_unread: byId("total_unread"),
	page_unread: byId("page_unread"),
	global_unread: byId("global_unread")
});

if(Permissions.can_chat(state.userModel, state.worldModel)) {
	OWOT.on("chat", function(e) {
		w.emit("chatMod", e);
		if(e.hide) return;
		event_on_chat(e);
	});
}

if(state.userModel.is_staff) {
	elm.chatbar.maxLength = 3030;
} else {
	elm.chatbar.maxLength = 400;
}

var canChat = Permissions.can_chat(state.userModel, state.worldModel);
if(!canChat) {
	selectedChatTab = 1;
	elm.chat_window.style.display = "none";
} else {
	elm.chat_open.style.display = "";
}

function api_chat_send(message, opts) {
	if(!message) return;
	if(!opts) opts = {};
	var exclude_commands = opts.exclude_commands;
	var nick = opts.nick || YourWorld.Nickname || state.userModel.username;
	var location = opts.location ? opts.location : (selectedChatTab == 0 ? "page" : "global");

	var msgLim = state.userModel.is_staff ? 3030 : 400;

	message = message.trim();
	if(!message.length) return;
	message = message.slice(0, msgLim);
	chatWriteHistory.push(message);
	if(chatWriteHistory.length > chatWriteHistoryMax) {
		chatWriteHistory.shift();
	}
	chatWriteHistoryIdx = -1;
	chatWriteTmpBuffer = "";

	var chatColor;
	if(!opts.color) {
		if(!YourWorld.Color) {
			chatColor = assignColor(nick);
		} else {
			chatColor = "#" + ("00000" + YourWorld.Color.toString(16)).slice(-6);
		}
	} else {
		chatColor = opts.color;
	}

	if(!exclude_commands && message.startsWith("/")) {
		var args = message.substr(1).split(" ");
		var command = args[0].toLowerCase();
		args.shift();
		if(client_commands.hasOwnProperty(command)) {
			client_commands[command](args);
			return;
		}
	}

	network.chat(message, location, nick, chatColor);
}

function clientChatResponse(message) {
	addChat(null, 0, "user", "[ Client ]", message, "Client", false, false, false, null, getDate());
}

var client_commands = {
	nick: function (args) {
		var newDisplayName = args.join(" ");
		if(!newDisplayName) {
			newDisplayName = "";
		}
		var nickLim = state.userModel.is_staff ? Infinity : 40;
		newDisplayName = newDisplayName.slice(0, nickLim);
		YourWorld.Nickname = newDisplayName;
		storeNickname();
		var nickChangeMsg;
		if(newDisplayName) {
			nickChangeMsg = "Set nickname to `" + newDisplayName + "`";
		} else {
			nickChangeMsg = "Nickname reset";
		}
		clientChatResponse(nickChangeMsg);
	},
	ping: function() {
		var pingTime = getDate();
		network.ping(function(resp, err) {
			if(err) {
				return clientChatResponse("Ping failed");
			}
			var pongTime = getDate();
			var pingMs = pongTime - pingTime;
			clientChatResponse("Ping: " + pingMs + " MS");
		});
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
		w.reloadRenderer();
		clientChatResponse("Changed grid size to " + width + "x" + height);
	},
	color: function(args) {
		var color = args.join(" ");
		color = resolveColorValue(color);
		YourWorld.Color = color;
		clientChatResponse("Changed text color to #" + ("00000" + YourWorld.Color.toString(16)).slice(-6).toUpperCase());
	},
	chatcolor: function(args) {
		var color = args.join(" ");
		if(!color) {
			localStorage.removeItem("chatcolor");
			defaultChatColor = null;
			clientChatResponse("Chat color reset");
		} else {
			defaultChatColor = resolveColorValue(color);
			localStorage.setItem("chatcolor", defaultChatColor);
			clientChatResponse("Changed chat color to #" + ("00000" + defaultChatColor.toString(16)).slice(-6).toUpperCase());
		}
	},
	warp: function(args) {
		var address = args[0];
		if(!address) address = "";
		positionX = 0;
		positionY = 0;
		if(address.charAt(0) == "/") address = address.substr(1);
		state.worldModel.pathname = "/" + address;
		ws_path = createWsPath();
		w.changeSocket(ws_path);
		clientChatResponse("Switching to world: \"" + address + "\"");
	},
	night: function() {
		w.night();
	},
	day: function() {
		w.day(true);
	}
}

function sendChat() {
	var chatText = elm.chatbar.value;
	elm.chatbar.value = "";
	var opts = {};
	if(defaultChatColor != null) {
		opts.color = "#" + ("00000" + defaultChatColor.toString(16)).slice(-6);
	}
	api_chat_send(chatText, opts);
}

function updateUnread() {
	var total = elm.total_unread;
	var page = elm.page_unread;
	var global = elm.global_unread;
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
	updateUnread();
	addChat(data.location, data.id, data.type,
		data.nickname, data.message, data.realUsername, data.op, data.admin, data.staff, data.color, data.date || Date.now(), data.dataObj);
}

elm.chatsend.addEventListener("click", function() {
	sendChat();
});

elm.chatbar.addEventListener("keypress", function(e) {
	var keyCode = e.keyCode;
	if(keyCode == 13) { // Enter
		sendChat();
	}
});

function moveCaretEnd(elm) {
	if(elm.selectionStart != void 0) {
		elm.selectionStart = elm.value.length;
		elm.selectionEnd = elm.value.length;
	} else if(elm.createTextRange != void 0) {
		elm.focus();
		var range = elm.createTextRange();
		range.collapse(false);
		range.select();
	}
}

elm.chatbar.addEventListener("keydown", function(e) {
	var keyCode = e.keyCode;
	// scroll through chat history that the client sent
	if(keyCode == 38) { // up
		// history modified
		if(chatWriteHistoryIdx > -1 && elm.chatbar.value != chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1]) {
			chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1] = elm.chatbar.value;
		}
		if(chatWriteHistoryIdx == -1 && elm.chatbar.value) {
			chatWriteTmpBuffer = elm.chatbar.value;
		}
		chatWriteHistoryIdx++;
		if(chatWriteHistoryIdx >= chatWriteHistory.length) chatWriteHistoryIdx = chatWriteHistory.length - 1;
		var upVal = chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1];
		if(!upVal) return;
		elm.chatbar.value = upVal;
		// pressing up will move the cursor all the way to the left by default
		e.preventDefault();
		moveCaretEnd(elm.chatbar);
	} else if(keyCode == 40) { // down
		// history modified
		if(chatWriteHistoryIdx > -1 && elm.chatbar.value != chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1]) {
			chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1] = elm.chatbar.value;
		}
		chatWriteHistoryIdx--;
		if(chatWriteHistoryIdx < -1) {
			chatWriteHistoryIdx = -1;
			return;
		}
		var str = "";
		if(chatWriteHistoryIdx != -1) {
			str = chatWriteHistory[chatWriteHistory.length - chatWriteHistoryIdx - 1];
		} else {
			if(chatWriteTmpBuffer) {
				str = chatWriteTmpBuffer;
				e.preventDefault();
				moveCaretEnd(elm.chatbar);
			}
		}
		elm.chatbar.value = str;
		e.preventDefault();
		moveCaretEnd(elm.chatbar);
	}
});

elm.chat_close.addEventListener("click", function() {
	w.emit("chatClose");
	elm.chat_window.style.display = "none";
	elm.chat_open.style.display = "";
	chatOpen = false;
});

elm.chat_open.addEventListener("click", function() {
	w.emit("chatOpen");
	elm.chat_window.style.display = "";
	elm.chat_open.style.display = "none";
	chatOpen = true;
	if(selectedChatTab == 0) {
		chatPageUnread = 0;
		updateUnread();
		if(!initPageTabOpen) {
			initPageTabOpen = true;
			elm.page_chatfield.scrollTop = elm.page_chatfield.scrollHeight;
		}
	} else {
		chatGlobalUnread = 0;
		updateUnread();
		if(!initGlobalTabOpen) {
			initGlobalTabOpen = true;
			elm.global_chatfield.scrollTop = elm.global_chatfield.scrollHeight;
		}
	}
	var chatWidth = chat_window.offsetWidth - 2;
	var chatHeight = chat_window.offsetHeight - 2;
	var screenRatio = window.devicePixelRatio;
	if(!screenRatio) screenRatio = 1;
	var virtWidth = owotWidth / screenRatio;
	if(chatWidth > virtWidth) {
		resizeChat(virtWidth - 2, chatHeight);
	}
});

elm.chat_page_tab.addEventListener("click", function() {
	elm.chat_page_tab.classList.add("chat_tab_selected");
	elm.chat_global_tab.classList.remove("chat_tab_selected");

	elm.global_chatfield.style.display = "none";
	elm.page_chatfield.style.display = "";
	selectedChatTab = 0;
	chatPageUnread = 0;
	updateUnread();
	if(!initPageTabOpen) {
		initPageTabOpen = true;
		elm.page_chatfield.scrollTop = elm.page_chatfield.scrollHeight;
	}
});

elm.chat_global_tab.addEventListener("click", function() {
	elm.chat_global_tab.classList.add("chat_tab_selected");
	elm.chat_page_tab.classList.remove("chat_tab_selected");

	elm.global_chatfield.style.display = "";
	elm.page_chatfield.style.display = "none";
	selectedChatTab = 1;
	chatGlobalUnread = 0;
	updateUnread();
	if(!initGlobalTabOpen) {
		initGlobalTabOpen = true;
		elm.global_chatfield.scrollTop = elm.global_chatfield.scrollHeight;
	}
});

function resizable_chat() {
	var state = 0;
	var isDown = false;
	var downX = 0;
	var downY = 0;
	var elmX = 0;
	var elmY = 0;
	var chatWidth = 0;
	var chatHeight = 0;
	chat_window.addEventListener("mousemove", function(e) {
		if(isDown) return;
		var posX = e.pageX - chat_window.offsetLeft;
		var posY = e.pageY - chat_window.offsetTop;
		var top = (posY) <= 4;
		var left = (posX) <= 3;
		var right = (chat_window.offsetWidth - posX) <= 4;
		var bottom = (chat_window.offsetHeight - posY) <= 5;
		var cursor = "";
		if(left || right) cursor = "ew-resize";
		if(top || bottom) cursor = "ns-resize";
		if((top && left) || (right && bottom)) cursor = "nwse-resize";
		if((bottom && left) || (top && right)) cursor = "nesw-resize";
		chat_window.style.cursor = cursor;
		state = bottom << 3 | right << 2 | left << 1 | top;
	});
	chat_window.addEventListener("mousedown", function(e) {
		downX = e.pageX;
		downY = e.pageY;
		if(state) {
			// subtract 2 for the borders
			chatWidth = chat_window.offsetWidth - 2;
			chatHeight = chat_window.offsetHeight - 2;
			elmX = chat_window.offsetLeft;
			elmY = chat_window.offsetTop;
			isDown = true;
			chatResizing = true;
		}
	});
	document.addEventListener("mouseup", function() {
		isDown = false;
		chatResizing = false;
	});
	document.addEventListener("mousemove", function(e) {
		if(!isDown) return;
		var offX = e.pageX - downX;
		var offY = e.pageY - downY;
		var resize_bottom = state >> 3 & 1;
		var resize_right = state >> 2 & 1;
		var resize_left = state >> 1 & 1;
		var resize_top = state & 1;

		var width_delta = 0;
		var height_delta = 0;
		var abs_top = chat_window.offsetTop;
		var abs_left = chat_window.offsetLeft;
		var snap_bottom = chat_window.style.bottom == "0px";
		var snap_right = chat_window.style.right == "0px";

		if(resize_top) {
			height_delta = -offY;
		} else if(resize_bottom) {
			height_delta = offY;
		}
		if(resize_left) {
			width_delta = -offX;
		} else if(resize_right) {
			width_delta = offX;
		}
		var res = resizeChat(chatWidth + width_delta, chatHeight + height_delta);
		if(resize_top && !snap_bottom) {
			chat_window.style.top = (elmY + (chatHeight - res[1])) + "px";
		}
		if(resize_bottom && snap_bottom) {
			chat_window.style.bottom = "";
			chat_window.style.top = abs_top + "px";
		}
		if(resize_right && snap_right) {
			chat_window.style.right = "";
			chat_window.style.left = abs_left + "px";
		}
		if(resize_left && !snap_right) {
			chat_window.style.left = (elmX + (chatWidth - res[0])) + "px";
		}
	});
}

function evaluateChatfield(chatfield) {
	var field;
	if(chatfield == "page") {
		field = elm.page_chatfield;
	} else if(chatfield == "global") {
		field = elm.global_chatfield;
	} else {
		field = getChatfield();
	}
	return field;
}

// a lookup table between the emote name and its atlas location
var emoteList = {
    "403": [0, 19],
    "OHHELLNO": [19, 16],
    "aaaHD": [35, 16],
    "aha": [51, 16],
    "areyoukidding": [67, 16],
    "awesome": [83, 16],
    "awesome2": [99, 16],
    "bad": [115, 16],
    "beepboop": [131, 16],
    "bootiful": [147, 16],
    "bruh": [163, 16],
    "catthinkaaa": [179, 22],
    "chaos": [201, 16],
    "ded": [217, 16],
    "derp": [233, 16],
    "dislike": [249, 15],
    "durr": [264, 16],
    "erhb": [280, 16],
    "failwhale": [296, 35],
    "fpthinkaaa": [331, 16],
    "huh": [347, 16],
    "karp": [363, 17],
    "lenny": [380, 16],
    "like": [396, 15],
    "lol": [411, 16],
    "mad": [427, 16],
    "meh": [443, 16],
    "mmm": [459, 16],
    "neat": [475, 16],
    "no": [491, 16],
    "notcool": [507, 16],
    "oOoo": [523, 16],
    "ohno": [539, 16],
    "okthen": [555, 16],
    "omg": [571, 16],
    "ouch": [587, 16],
    "sad": [603, 16],
    "sadsmug": [619, 16],
    "scruffy": [635, 19],
    "smug": [654, 16],
    "stahp": [670, 16],
    "teef": [686, 16],
    "thinq": [702, 16],
    "thunk": [718, 16],
    "tri": [734, 17],
    "troll1": [751, 16],
    "void": [767, 16],
    "what": [783, 16],
    "yeesh": [799, 16],
    "zzz": [815, 16]
};

/*
	[type]:
	* "user"	  :: registered non-renamed nick
	* "anon_nick" :: unregistered nick
	* "anon"	  :: unregistered
	* "user_nick" :: registered renamed nick
*/
function addChat(chatfield, id, type, nickname, message, realUsername, op, admin, staff, color, date, dataObj) {
	if(!dataObj) dataObj = {};
	if(!message) message = "";
	if(!realUsername) realUsername = "";
	if(!nickname) nickname = realUsername;
	if(!color) color = assignColor(nickname);
	var dateStr = "";
	if(date) dateStr = convertToDate(date);
	var field = evaluateChatfield(chatfield);
	var pm = dataObj.privateMessage;
	var isGreen = false;

	if(chatGreentext && message[0] == ">" && !(":;_-".includes(message[1]))) { // exception to some emoticons
		message = message.substr(1);
		isGreen = true;
	}

	if(chatLimitCombChars) {
		message = filterChatMessage(message);
		nickname = filterChatMessage(nickname);
	}

	if(!op) {
		message = html_tag_esc(message);
		nickname = html_tag_esc(nickname);
	}

	// do not give the tag to [ Server ]
	var hasTagDom = (op || admin || staff || dataObj.rankName) && !(!id && op);

	var tagDom;
	var nickTitle = [];
	var usernameHasSpecialChars = false;

	for(var i = 0; i < realUsername.length; i++) {
		if(realUsername.charCodeAt(i) > 256) {
			usernameHasSpecialChars = true;
			break;
		}
	}

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
		if(!usernameHasSpecialChars) {
			nickDom.style.fontWeight = "bold";
		}
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
		var impersonationWarning = "";
		if(usernameHasSpecialChars) {
			impersonationWarning = " (Special chars)";
		}
		nickTitle.push("Username \"" + realUsername + "\"" + impersonationWarning);
		if(state.userModel.is_operator) idTag = "[*" + id + "]";
	}

	if(state.userModel.is_operator) {
		idTag = "<span style=\"color: black; font-weight: normal;\">" + idTag + "</span>"
	}

	if(idTag && type != "anon") idTag += "&nbsp;"; // space between id and name

	if(id == 0) {
		idTag = "";
		nickname = "<span style=\"background-color: #e2e2e2;\">" + nickname + "</span>";
	}

	nickname = idTag + nickname;

	if(dateStr) nickTitle.push("(" + dateStr + ")");

	nickDom.innerHTML = nickname + (pm == "to_me" ? "" : ":");
	if(nickTitle.length) nickDom.title = nickTitle.join("; ");

	var pmDom = null;
	if(pm) {
		pmDom = document.createElement("div");
		pmDom.style.display = "inline";
		if(pm == "to_me") {
			pmDom.innerText = " -> Me:";
		} else if(pm == "from_me") {
			pmDom.innerText = "Me -> ";
		}
	}

	if(isGreen) {
		message = "<span style=\"color: #789922\">&gt;" + message + "</span>";
	}

	// parse emoticons
	if(chatEmotes) {
		var emoteMessage = "";
		var emoteBuffer = "";
		var emoteMode = false;
		var emoteCharset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
		// emotes are case sensitive
		for(var i = 0; i < message.length; i++) {
			var chr = message[i];
			if(chr == ":") {
				if(emoteBuffer == ":" && emoteMode) { // special case: two consecutive colons
					emoteMessage += emoteBuffer;
					continue;
				}
				emoteBuffer += chr;
				if(emoteMode) {
					var emoteName = emoteBuffer.slice(1, -1);
					if(emoteList.hasOwnProperty(emoteName)) {
						var position = emoteList[emoteName];
						emoteMessage += "<div title=':" + emoteName
							+ ":' class='chat_emote' style='background-position-x:-" + position[0]
							+ "px;width:" + position[1] + "px'></div>";
					} else {
						emoteMessage += emoteBuffer;
					}
					emoteMode = false;
					emoteBuffer = "";
				} else {
					emoteMode = true;
				}
			} else if(emoteMode) {
				emoteBuffer += chr;
				if(!emoteCharset.includes(chr)) {
					emoteMode = false;
					emoteMessage += emoteBuffer;
					emoteBuffer = "";
					continue;
				}
			} else {
				emoteMessage += chr;
			}
		}
		if(emoteBuffer) { // leftovers
			emoteMessage += emoteBuffer;
		}
		message = emoteMessage;
	}

	var msgDom = document.createElement("span");
	msgDom.innerHTML = "&nbsp;" + message;

	var maxScroll = field.scrollHeight - field.clientHeight;
	var scroll = field.scrollTop;
	var doScrollBottom = false;
	if(maxScroll - scroll < 20) { // if scrolled at least 20 pixels above bottom
		doScrollBottom = true;
	}

	var chatGroup = document.createElement("div");
	if(!pm && hasTagDom) chatGroup.appendChild(tagDom);
	if(pmDom) {
		if(pm == "to_me") {
			if(hasTagDom) chatGroup.appendChild(tagDom);
			chatGroup.appendChild(nickDom);
			chatGroup.appendChild(pmDom);
		} else if(pm == "from_me") {
			chatGroup.appendChild(pmDom);
			if(hasTagDom) chatGroup.appendChild(tagDom);
			chatGroup.appendChild(nickDom);
		}
	} else {
		chatGroup.appendChild(nickDom);
	}
	chatGroup.appendChild(msgDom);

	field.appendChild(chatGroup);

	maxScroll = field.scrollHeight - field.clientHeight;
	if(doScrollBottom) {
		field.scrollTop = maxScroll;
	}

	var chatRec = {
		id: id, date: date,
		field: field,
		element: chatGroup
	};
	if(field == elm.page_chatfield) {
		chatRecordsPage.push(chatRec);
	} else if(field == elm.global_chatfield) {
		chatRecordsGlobal.push(chatRec);
	}
	if(chatRecordsPage.length > chatHistoryLimit) { // overflow on current page
		var rec = chatRecordsPage.shift();
		rec.element.remove();
	}
	if(chatRecordsGlobal.length > chatHistoryLimit) { // overflow on global
		var rec = chatRecordsGlobal.shift();
		rec.element.remove();
	}
}

function removeChatByIdAndDate(id, date) {
	if(!acceptChatDeletions) return;
	var records = [chatRecordsPage, chatRecordsGlobal];
	for(var r = 0; r < records.length; r++) {
		var recList = records[r];
		for(var i = 0; i < recList.length; i++) {
			var currentRec = recList[i];
			if(currentRec.id == id && currentRec.date == date) {
				var elm = currentRec.element;
				elm.remove();
			}
		}
	}
}

function addUnreadChatBar(chatfield, message, checkSituation) {
	var field = evaluateChatfield(chatfield);
	if(checkSituation) {
		var maxScroll = field.scrollHeight - field.clientHeight;
		var scroll = field.scrollTop;
		var remScroll = maxScroll - scroll;
		if(chatfield == "page") {
			if(chatPageUnreadBar || selectedChatTab == 0) return;
		}
		if(chatfield == "global") {
			if(chatGlobalUnreadBar || selectedChatTab == 1) return;
		}
	}
	var msg = "New messages";
	if(message) msg = message;
	var bar = document.createElement("div");
	var barText = document.createElement("span");
	bar.className = "unread_bar";
	barText.className = "unread_bar_msg";
	barText.innerText = msg;
	bar.appendChild(barText);
	field.appendChild(bar);
	return bar;
}

// check if a character is a combining character
function isDiacriticalCombining(x) {
	if([[768, 879], [1155, 1161], [1425, 1469], [1473, 1474], [1476, 1477], [1552, 1562],
		[1611, 1631], [1750, 1756], [1759, 1764], [1767, 1768], [1770, 1773], [1840, 1866],
		[1958, 1968], [2027, 2035], [2070, 2073], [2075, 2083], [2085, 2087], [2089, 2093],
		[2137, 2139], [2200, 2207], [2250, 2273], [2275, 2306], [2369, 2376], [2385, 2391],
		[2402, 2403], [2497, 2500], [2530, 2531], [2561, 2562], [2625, 2626], [2631, 2632],
		[2635, 2637], [2672, 2673], [2689, 2690], [2753, 2757], [2759, 2760], [2786, 2787],
		[2810, 2815], [2881, 2884], [2901, 2902], [2914, 2915], [3134, 3136], [3142, 3144],
		[3146, 3149], [3157, 3158], [3170, 3171], [3276, 3277], [3298, 3299], [3328, 3329],
		[3387, 3388], [3393, 3396], [3426, 3427], [3538, 3540], [3636, 3642], [3655, 3662],
		[3764, 3772], [3784, 3790], [3864, 3865], [3953, 3966], [3968, 3972], [3974, 3975],
		[3981, 3991], [3993, 4028], [4141, 4144], [4146, 4151], [4153, 4154], [4157, 4158],
		[4184, 4185], [4190, 4192], [4209, 4212], [4229, 4230], [4957, 4959], [5906, 5908],
		[5938, 5939], [5970, 5971], [6002, 6003], [6068, 6069], [6071, 6077], [6089, 6099],
		[6155, 6157], [6277, 6278], [6432, 6434], [6439, 6440], [6457, 6459], [6679, 6680],
		[6744, 6750], [6757, 6764], [6771, 6780], [6832, 6862], [6912, 6915], [6966, 6970],
		[7019, 7027], [7040, 7041], [7074, 7077], [7080, 7081], [7083, 7085], [7144, 7145],
		[7151, 7153], [7212, 7219], [7222, 7223], [7376, 7378], [7380, 7392], [7394, 7400],
		[7416, 7417], [7616, 7679], [8400, 8447], [11503, 11505], [11744, 11775], [12330, 12333],
		[12441, 12442], [42607, 42610], [42612, 42621], [42654, 42655], [42736, 42737], [43045, 43046],
		[43204, 43205], [43232, 43249], [43302, 43309], [43335, 43345], [43392, 43394], [43446, 43449],
		[43452, 43453], [43561, 43566], [43569, 43570], [43573, 43574], [43698, 43700], [43703, 43704],
		[43710, 43711], [43756, 43757], [64606, 64611], [65024, 65039], [65056, 65071]].find(range => (x >= range[0] && x <= range[1]))) {
			return true;
		}

	if([1471, 1479, 1648, 1809, 2045, 2362, 2364, 2381, 2433, 2492, 2509, 2558, 2620, 2641, 2677,
		2748, 2765, 2817, 2876, 2879, 2893, 2946, 3008, 3021, 3072, 3076, 3132, 3201, 3260, 3263,
		3270, 3405, 3457, 3530, 3542, 3633, 3761, 3893, 3895, 3897, 4038, 4226, 4237, 4253, 6086,
		6109, 6159, 6313, 6450, 6683, 6742, 6752, 6754, 6783, 6964, 6972, 6978, 7142, 7149, 7405,
		7412, 11647, 43010, 43014, 43019, 43052, 43263, 43443, 43493, 43587, 43596, 43644, 43696,
		43713, 43766, 44005, 44008, 44013, 64286].includes(x)) return true;

	return false;
}

function isLongWidthChar(x) {
	switch(x) {
		case 0x0BF5: return true;
		case 0x2E3B: return true;
		case 0xA9C5: return true;
		case 0xFDFD: return true;
		case 0x12219: return true;
		case 0x1242B: return true;
	}
	return false;
}

function filterChatMessage(str) {
	if(typeof str != "string") return "";
	var res = "";
	var diacriticLimit = 3;
	var longWidthLimit = 1;
	var diacriticLength = 0;
	var longWidthCount = 0;
	str = [...str];
	for(var i = 0; i < str.length; i++) {
		var chr = str[i];
		var code = chr.codePointAt();
		var isComb = isDiacriticalCombining(code);
		var isLong = isLongWidthChar(code);
		if(isComb) {
			if(diacriticLength < diacriticLimit) {
				res += chr;
			}
			diacriticLength++;
		} else {
			if(isLong) {
				if(longWidthCount >= longWidthLimit) {
					res += ".";
				} else {
					res += chr;
					longWidthCount++;
				}
			} else {
				res += chr;
			}
			diacriticLength = 0;
		}
	}
	return res;
}

function getChatfield() {
	if(selectedChatTab == 0) {
		return elm.page_chatfield;
	} else if(selectedChatTab == 1) {
		return elm.global_chatfield;
	}
}

function updateUserCount() {
	var count = w.userCount;
	if(count == void 0) {
		elm.usr_online.innerText = "";
		return;
	}
	var unit = "user";
	var units = "users";
	var current_unit;
	if(count == 1) {
		current_unit = unit;
	} else {
		current_unit = units;
	}
	elm.usr_online.innerText = count + " " + current_unit + " online";
}

function chatType(registered, nickname, realUsername) {
	var nickMatches = (nickname + "").toUpperCase() == (realUsername + "").toUpperCase();
	var hasSpecialChars = false;
	if(realUsername == "[ Server ]") return "user";
	if(nickname) {
		for(var i = 0; i < nickname.length; i++) {
			if(nickname.charCodeAt(i) > 256) {
				hasSpecialChars = true;
				break;
			}
		}
	}
	if(registered && (nickMatches || !nickname)) {
		if(hasSpecialChars) {
			return "user_nick";
		} else {
			return "user";
		}
	}
	if(registered && !nickMatches) return "user_nick";
	if(!registered && !nickname) return "anon";
	if(!registered && nickname) return "anon_nick";
	return type;
}
