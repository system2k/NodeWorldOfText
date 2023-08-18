var YourWorld = {
	Color: window.localStorage ? +localStorage.getItem("color") : 0,
	Nickname: state.userModel.username
};

function init_dom() {
}
function getWndWidth() {
	return document.body.clientWidth || window.innerWidth;
}
function getWndHeight() {
	return document.body.clientHeight || window.innerHeight;
}
function decimal(percentage) {
	return percentage / 100;
}
function normFontSize(size) {
	return Math.floor(size / 0.1) * 0.1;
}
function deviceRatio() {
	var ratio = window.devicePixelRatio;
	if(!ratio) ratio = 1;
	return ratio;
}

var enums = {};
function makeEnum(vars) {
	var enums = {};
	for(var i = 0; i < vars.length; i++) {
		enums[vars[i]] = i;
	}
	return enums;
}

enums.edit = makeEnum(["tileY", "tileX", "charY", "charX", "time", "char", "id", "color"]);
enums.position = makeEnum(["tileX", "tileY", "charX", "charY"]);

var ws_path = createWsPath();

var menu, menuStyle;
var nextObjId              = 1; // Next edit ID
var owotWidth              = getWndWidth();
var owotHeight             = getWndHeight();
var js_alert_active        = false; // JS alert window is open
var worldFocused           = false;
var chatResizing           = false;
var tiles                  = {}; // All loaded tiles
var images                 = {}; // { name: [data RGBA, width, height] }
var keysPressed            = {};
var previousErase          = 0;
var verticalEnterPos       = [0, 0]; // position to go when pressing enter (tileX, charX)
var lastX                  = verticalEnterPos; // Deprecated; temp compat
var imgPatterns            = {};
var textColorOverride      = 0; // public-member-owner bitfield
var writeBuffer            = [];
var highlightFlash         = {};
var highlightCount         = 0;
var coloredChars           = {}; // highlighted chars
var shiftOptState          = { prevX: 0, prevY: 0, x1: 0, y1: 0, x2: 0, y2: 0, prevZoom: -1 };
var backgroundImage        = null;
var backgroundPattern      = null;
var backgroundPatternSize  = [0, 0];
var guestCursorsByTile     = {};
var guestCursors           = {};
var clientGuestCursorPos   = { tileX: 0, tileY: 0, charX: 0, charY: 0, hidden: false, updated: false };
var disconnectTimeout      = null;
var menuOptions            = {};
var undoBuffer             = new CircularBuffer(2048);
var textDecorationOffset   = 0x20F0;
var textDecorationModes    = { bold: false, italic: false, under: false, strike: false };
var fontTemplate           = "$px 'Courier New', monospace";
var specialFontTemplate    = "$px consolas, monospace";
var fontOrder              = ["Courier New", "monospace"];
var specialFontOrder       = ["consolas", "monospace"];
var initiallyFetched       = false;
var lastLinkHover          = null; // [tileX, tileY, charX, charY]
var lastTileHover          = null; // [type, tileX, tileY, (charX, charY)]
var regionSelections       = [];
var specialClientHooks     = {};
var specialClientHookMap   = 0; // bitfield (starts at 0): [before char rendering, (future expansion)]
var bgImageHasChanged      = false;
var remoteBoundary         = { centerX: 0, centerY: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
var boundaryStatus         = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

// configuration
var positionX              = 0; // client position in pixels
var positionY              = 0;
var coordSizeX             = 4;
var coordSizeY             = 4;
var gridEnabled            = false;
var subgridEnabled         = false; // character-level grid
var linksEnabled           = true;
var linksRendered          = true;
var colorsEnabled          = true;
var backgroundEnabled      = true; // render backgrounds if any
var scrollingEnabled       = true;
var zoomRatio              = deviceRatio(); // browser's default zoom ratio
var ws_path                = createWsPath();
var protectPrecision       = 0; // 0 = tile, 1 = char
var checkTileFetchInterval = 300; // how often to check for unloaded tiles (ms)
var zoom                   = decimal(100); // absolute zoom value (product of zoomRatio and userZoom)
var userZoom               = decimal(100); // user zoom setting (menubar zoom)
var unloadTilesAuto        = true; // automatically unload tiles to free up memory
var useHighlight           = true; // highlight new edits
var highlightLimit         = 10; // max chars to highlight at a time
var ansiBlockFill          = true; // fill certain ansi block characters
var colorizeLinks          = true;
var brBlockFill            = false; // render individual dots in braille characters as rectangles
var tileFetchOffsetX       = 0; // offset added to tile fetching and sending coordinates
var tileFetchOffsetY       = 0;
var ignoreCanvasContext    = true; // ignore canvas context menu when right clicking
var elementSnapApprox      = 10; // snapping margin for draggable elements
var mSpecRendering         = true; // render special properties if a certain combining character is included
var combiningCharsEnabled  = true;
var surrogateCharsEnabled  = true;
var defaultCoordLinkColor  = "#008000";
var defaultURLLinkColor    = "#0000FF";
var defaultHighlightColor  = [0xFF, 0xFF, 0x99];
var secureJSLink           = true; // display warning prompt when clicking on javascript links
var secureLink             = true; // display confirmation when clicking on links in a suspicious setting
var pasteDirRight          = true; // move cursor right when writing
var pasteDirDown           = true; // move cursor down after pressing enter
var defaultCursor          = "text";
var defaultDragCursor      = "move";
var fetchClientMargin      = 200;
var classicTileProcessing  = false; // directly process utf32 only
var unloadedPatternPanning = false;
var cursorRenderingEnabled = true;
var guestCursorsEnabled    = true; // render guest cursors
var showMyGuestCursor      = true; // show my cursor to everyone if the world allows it
var unobstructCursor       = false; // render cursor on top of characters that may block it
var shiftOptimization      = false;
var transparentBackground  = true;
var writeFlushRate         = state.worldModel.write_interval;
var bufferLargeChars       = true; // prevents certain large characters from being cut off by the grid
var cursorOutlineEnabled   = false;
var showCursorCoordinates  = false; // show cursor coords in coordinate bar
var textDecorationsEnabled = true; // bold, italic, underline, and strikethrough

window.addEventListener("load", function() {
	w.emit("clientLoaded");
});

defineElements({ // elm[<name>]
	chatbar: byId("chatbar"),
	announce_container: byId("announce_container"),
	chat_window: byId("chat_window"),
	usr_online: byId("usr_online"),
});

init_dom(); // TODO: put this elsewhere


function getStoredNickname() {
	var nick = YourWorld.Nickname;
	if(window.localStorage && localStorage.getItem) {
		nick = localStorage.getItem("nickname");
	}
	if(!nick) nick = YourWorld.Nickname;
	YourWorld.Nickname = nick;
}
function storeNickname() {
	if(window.localStorage && localStorage.setItem) {
		localStorage.setItem("nickname", YourWorld.Nickname);
	}
}

function getStoredConfig() {
	if(!window.localStorage || !localStorage.getItem) return;
	var conf = localStorage.getItem("config");
	if(!conf) return;
	conf = JSON.parse(conf);
	cursorOutlineEnabled = conf.cursorOutline;
}
function storeConfig() {
	if(!window.localStorage || !localStorage.setItem) return;
	var conf = {
		cursorOutline: cursorOutlineEnabled
	};
	localStorage.setItem("config", JSON.stringify(conf));
}


function event_keyup(e) {
	w.emit("keyUp", e);
}
document.addEventListener("keyup", event_keyup);

function convertKeyCode(key) {
	switch(key) {
		case "ESC": return "Escape";
		case "TAB": return "Tab";
		case "SPACE": return " ";
		case "PAGEUP": return "PageUp";
		case "PAGEDOWN": return "PageDown";
		case "UP": return "ArrowUp";
		case "DOWN": return "ArrowDown";
		case "LEFT": return "ArrowLeft";
		case "RIGHT": return "ArrowRight";
		case "CAPS": return "CapsLock";
		case "END": return "End";
		case "HOME": return "Home";
		case "INSERT": return "Insert";
		case "DELETE": return "Delete";
		case "PLUS": return "+";
		case "MINUS": return "-";
		case "ENTER": return "Enter";
		case "BACKSPACE": return "Backspace";
		case "COMMAND": return "Meta";
	}
	return key;
}

function checkKeyPress(e, combination) {
	// if combination arg is an array of combinations
	if(typeof combination == "object") {
		var res = false;
		for(var i = 0; i < combination.length; i++) {
			res = res || checkKeyPress(e, combination[i]);
		}
		return res;
	}
	combination = combination.split("+");
	var map = {
		ctrl: false,
		shift: false,
		alt: false,
		any: false, // does not check for ctrl/shift/alt
		key: ""
	};
	for(var i = 0; i < combination.length; i++) {
		var key = combination[i];
		switch(key) {
			case "CTRL": map.ctrl = true; break;
			case "SHIFT": map.shift = true; break;
			case "ALT": map.alt = true; break;
			case "*": map.any = true; break;
			default: map.key = convertKeyCode(key);
		}
	}
	if(!map.any) {
		if(map.ctrl != e.ctrlKey) return false;
		if(map.shift != e.shiftKey) return false;
		if(map.alt != e.altKey) return false;
	}
	if(e.keyCode == 37) e.key = "ArrowLeft";
	if(e.keyCode == 38) e.key = "ArrowUp";
	if(e.keyCode == 39) e.key = "ArrowRight";
	if(e.keyCode == 40) e.key = "ArrowDown";
	var eKey = e.key;
	// key must not be Ctrl/Shift/Alt because it's already stored in a boolean
	if(eKey == "Control") eKey = "";
	if(eKey == "Shift") eKey = "";
	if(eKey == "Alt") eKey = "";
	if(eKey != void 0) if(map.key.toUpperCase() != eKey.toUpperCase()) return false;
	return true;
}

// complex checking of key patterns
// e.g. Ctrl + A + B
function checkKeyPatterns(combination) {
	// if combination arg is an array of combinations
	if(typeof combination == "object") {
		var res = false;
		for(var i = 0; i < combination.length; i++) {
			res = res || checkKeyPatterns(e, combination[i]);
		}
		return res;
	}
	combination = combination.split("+");
	var keyMap = {};
	for(var i = 0; i < combination.length; i++) {
		var key = combination[i];
		switch(key) {
			case "CTRL": keyMap.Ctrl = 1; break;
			case "SHIFT": keyMap.Shift = 1; break;
			case "ALT": keyMap.Alt = 1; break;
			default: keyMap[convertKeyCode(key)] = 1;
		}
	}
	for(var k in keyMap) {
		if(!keydownTable[k]) return false;
	}
	for(var k in keydownTable) {
		if(!keyMap[k]) return false;
	}
	return true;
}

function createWsPath() {
	var search = window.location.search;
	if(!search) search = "";
	return "ws" + (window.location.protocol == "https:" ? "s" : "") + "://" + window.location.host + state.worldModel.pathname + "/ws/" + search;
}

var fetchInterval;
var timesConnected = 0;
function createSocket(getChatHist) {
	getChatHist = !!getChatHist;
	socket = new ReconnectingWebSocket(ws_path);
	w.socket = socket;
	timesConnected++;

	socket.binaryType = "arraybuffer";
	socket.onmessage = function(msg) {
		var data = JSON.parse(msg.data);
		var kind = data.kind;
		if(ws_functions[kind]) {
			ws_functions[kind](data);
		}
	}

	socket.onopen = function(msg) {
		console.log("Connected socket");
		if ((timesConnected == 1 || getChatHist))
		{
			network.chathistory();
		}
		timesConnected++;
		if(w.receivingBroadcasts) {
			w.broadcastReceive(true);
		}
		clearTimeout(disconnectTimeout);
		w.doAnnounce("", "err_connect");
		w.doAnnounce("", "err_access");
		w.doAnnounce("", "err_limit");
		disconnectTimeout = null;
	}

	socket.onclose = function() {
		console.log("Socket has closed. Reconnecting...");
		for(var i in network.callbacks) {
			var cb = network.callbacks[i];
			if(typeof cb == "function") {
				cb(null, true);
			}
			delete network.callbacks[i];
		}
		if(!disconnectTimeout) {
			disconnectTimeout = setTimeout(function() {
				w.doAnnounce("Connection lost. Please wait until the client reconnects.", "err_connect");
			}, 1000 * 2);
		}
	}

	socket.onerror = function(err) {
		console.log("Socket error:", err);
	}
}

var network = {
	latestID: 1,
	callbacks: {},
	transmit: function(data) {
		data = JSON.stringify(data);
		try {
			w.socket.send(data);
		} catch(e) {
			console.warn("Transmission error");
		}
	},
	cmd: function(data, include_username) {
		network.transmit({
			kind: "cmd",
			data: data, // maximum length of 2048
			include_username: include_username
		});
	},
	cmd_opt: function() {
		network.transmit({
			kind: "cmd_opt"
		});
	},
	chathistory: function() {
		network.transmit({
			kind: "chathistory"
		});
	},
	chat: function(message, location, nickname, color) {
		network.transmit({
			kind: "chat",
			nickname: nickname,
			message: message,
			location: location,
			color: color
		});
	},
	ping: function(callback) {
		var cb_id = void 0;
		if(callback) {
			cb_id = network.latestID++;
			network.callbacks[cb_id] = callback;
		}
		network.transmit({
			kind: "ping",
			id: cb_id // optional: number
		});
	}
};

Object.assign(w, {
	userCount: -1,
	clientId: -1,
	net: network,
	ui: {
		announcements: {}
	},
	doAnnounce: function(text, announceClass) {
		if(!announceClass) {
			announceClass = "main";
		}
		var an = w.ui.announcements[announceClass];
		if(an) {
			if(text) {
				an.text.innerHTML = text;
				an.bar.style.display = "";
			} else {
				an.bar.style.display = "none";
			}
		} else {
			if(!text) return;
			var anBar = document.createElement("div");
			var anText = document.createElement("span");
			var anClose = document.createElement("span");
			anBar.className = "ui-vis";
			anText.className = "announce_text";
			anText.innerHTML = text;
			anClose.className = "announce_close";
			anClose.onclick = function() {
				anBar.style.display = "none";
			}
			anClose.innerText = "X";
			anBar.appendChild(anText);
			anBar.appendChild(anClose);
			elm.announce_container.appendChild(anBar);
			w.ui.announcements[announceClass] = {
				bar: anBar,
				text: anText,
				close: anClose
			};
		}
	},
	socketChannel: null,
	receivingBroadcasts: false,
	chat: {
		send: api_chat_send
	},
	broadcastReceive: function(force) {
		if(w.receivingBroadcasts && !force) return;
		w.receivingBroadcasts = true;
		network.cmd_opt();
	},
	broadcastCommand: function(data, includeUsername) {
		network.cmd(data, includeUsername);
	},
	jquery: function(callback) {
		if(window.jQuery) return;
		var jqueryURL = "https://code.jquery.com/jquery-1.7.min.js";
		w.loadScript(jqueryURL, callback);
	}
});

document.onselectstart = function(e) {
	var target = e.target;
	if(closest(target, getChatfield()) || target == elm.chatbar || closest(target, elm.confirm_js_code) || closest(target, elm.announce_text)) {
		return true;
	}
	return false;
}

var ws_functions = {
	channel: function(data) {
		w.socketChannel = data.sender;
		w.clientId = data.id;
		w.userCount = data.initial_user_count;
		updateUserCount();
	},
	announcement: function(data) {
		w.emit("announcement", data);
		data.text = html_tag_esc(data.text);
		w.doAnnounce(data.text);
	},
	ping: function(data) {
		w.emit("ping", data);
		if(data.id) {
			if(network.callbacks[data.id]) {
				var cb = network.callbacks[data.id];
				delete network.callbacks[data.id];
				cb();
			}
		}
	},
	propUpdate: function(data) {
		w.emit("propUpdate", data.props);
		var props = data.props;
		for(var p = 0; p < props.length; p++) {
			var prop = props[p];
			var type = prop.type;
			var value = prop.value;
			switch(type) {
				case "isMember":
					state.userModel.is_member = value;
					break;
				case "isOwner":
					state.userModel.is_owner = value;
					break;
				case "readability":
					break;
				case "name":
					state.worldModel.name = value;
					state.worldModel.pathname = value ? "/" + value : "";
					if(!value || value.toLowerCase() == "main" || value.toLowerCase() == "owot") {
						document.title = "Our World of Text";
					} else {
						document.title = state.worldModel.pathname;
					}
					ws_path = createWsPath();
					if(window.history && window.history.replaceState) {
						history.replaceState({}, "", state.worldModel.pathname + window.location.search + window.location.hash);
					}
					break;
				case "charRate":
					state.worldModel.char_rate = value;
					break;
				case "writeInt":
					w.setFlushInterval(value);
					break;
			}
		}
	},
	chat: function(data) {
		var type = chatType(data.registered, data.nickname, data.realUsername);
		w.emit("chat", {
			location: data.location,
			id: data.id,
			type: type,
			nickname: data.nickname,
			message: data.message,
			realUsername: data.realUsername,
			op: data.op,
			admin: data.admin,
			staff: data.staff,
			color: data.color,
			date: data.date,
			dataObj: data,
			hide: false
		});
	},
	user_count: function(data) {
		var count = data.count;
		w.emit("userCount", count);
		w.userCount = count;
		updateUserCount();
	},
	chathistory: function(data) {
		if(data.error) {
			return;
		}
		var global_prev = data.global_chat_prev;
		var page_prev = data.page_chat_prev;
		for(var g = 0; g < global_prev.length; g++) {
			var chat = global_prev[g];
			var type = chatType(chat.registered, chat.nickname, chat.realUsername);
			addChat(chat.location, chat.id, type, chat.nickname,
				chat.message, chat.realUsername, chat.op, chat.admin, chat.staff, chat.color, chat.date, chat);
		}
		for(var p = 0; p < page_prev.length; p++) {
			var chat = page_prev[p];
			var type = chatType(chat.registered, chat.nickname, chat.realUsername);
			addChat(chat.location, chat.id, type, chat.nickname,
				chat.message, chat.realUsername, chat.op, chat.admin, chat.staff, chat.color, chat.date, chat);
		}
	},
	chatdelete: function(data) {
		// subject to change
		var id = data.id; // client id
		var time = data.time;
		removeChatByIdAndDate(id, time);
	},
	cmd: function(data) {
		w.emit("cmd", data);
	},
	error: function(data) {
		var code = data.code;
		var message = data.message;
		switch(code) {
			case "CONN_LIMIT": // too many connections
			case "INVALID_ADDR": // invalid websocket path
			case "NO_EXIST": // world does not exist
			case "NO_PERM": // no permission to access world
				console.log("Received error from the server with code [" + code + "]: " + message);
				if(code == "NO_PERM") {
					w.doAnnounce("Access to this world is denied. Please make sure you are logged in.", "err_access");
				} else if(code == "CONN_LIMIT") {
					w.doAnnounce("You have too many connections.", "err_limit");
				}
				break;
			case "PARAM": // invalid parameters in message
				break;
		}
	}
};

function begin() {
	getStoredConfig();
	getStoredNickname();

	if(state.announce) {
		w.doAnnounce(state.announce);
	}

	if(window.location.hostname == "www.ourworldoftext.com") {
		w.doAnnounce("You are currently under the 'www' subdomain. <a href=\"https://ourworldoftext.com\">You may want to go here instead.</a>", "www_warn");
	}
	createSocket();
}

begin();
