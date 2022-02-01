var YourWorld = {
	Color: window.localStorage ? +localStorage.getItem("color") : 0,
	Nickname: state.userModel.username
};

var owot, owotCtx, textInput;
var linkElm, linkDiv;
var jscolorInput;
function init_dom() {
	owot = document.getElementById("owot");
	owot.style.display = "block";
	owot.style.cursor = defaultCursor;
	owotCtx = owot.getContext("2d");
	textInput = document.getElementById("textInput");
	textInput.value = "";
	linkElm = elm.link_element;
	linkDiv = elm.link_div;
	updateCoordDisplay();
	defineElements({
		owot: owot,
		textInput: textInput
	});
	addColorShortcuts();
}
function getWndWidth() {
	return window.innerWidth;
}
function getWndHeight() {
	return window.innerHeight;
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
var tileCanvasPool         = [];
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
var canAccessWorld         = true;

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
var protectPrecision       = 0; // 0 being tile and 1 being char
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
var priorityOverwriteChar  = false; // render cells in the following order: Owner, Member, Public
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
var writeFlushRate         = 1000;

var keyConfig = {
	reset: "ESC",
	copyColor: "ALT+C",
	copyCharacterText: "CTRL+C",
	copyCharacterMouse: "CTRL+M",
	sidewaysScroll: "SHIFT",
	tab: "TAB",
	autoSelect: "CTRL",
	autoApply: ["CTRL+S", "ALT+S"],
	autoDeselect: "SHIFT",
	erase: "BACKSPACE+*",
	cellErase: "DELETE+*",
	cursorUp: "UP+*",
	cursorDown: "DOWN+*",
	cursorLeft: "LEFT+*",
	cursorRight: "RIGHT+*",
	copyRegion: ["ALT+G", "CTRL+A"],
	centerTeleport: "HOME"
};

window.addEventListener("load", function() {
	w.emit("clientLoaded");
});

document.addEventListener("visibilitychange", function() {
	if(!document.hidden && zoom > 0.2) {
		w.redraw();
	}
});

defineElements({ // elm[<name>]
	loading: byId("loading"),
	coord_Y: byId("coord_Y"),
	coord_X: byId("coord_X"),
	chatbar: byId("chatbar"),
	color_input_form_input: byId("color_input_form_input"),
	protect_precision: byId("protect_precision"),
	announce: byId("announce"),
	announce_text: byId("announce_text"),
	announce_close: byId("announce_close"),
	tile_choice: byId("tile_choice"),
	char_choice: byId("char_choice"),
	menu_elm: byId("menu"),
	nav_elm: byId("nav"),
	coords: byId("coords"),
	chat_window: byId("chat_window"),
	confirm_js: byId("confirm_js"),
	confirm_js_code: byId("confirm_js_code"),
	main_view: byId("main_view"),
	usr_online: byId("usr_online"),
	link_element: byId("link_element"),
	link_div: byId("link_div"),
	color_shortcuts: byId("color_shortcuts")
});

w.on("clientLoaded", function() {
	jscolorInput = elm.color_input_form_input.jscolor;
	var r = (YourWorld.Color >> 16) & 255;
	var g = (YourWorld.Color >> 8) & 255;
	var b = YourWorld.Color & 255;
	setRGBColorPicker(r, g, b);
});

function setRGBColorPicker(r, g, b) {
	jscolorInput.fromRGB(r, g, b);
}

function setColorPickerRandom() {
	var r = Math.floor(Math.random() * 256);
	var g = Math.floor(Math.random() * 256);
	var b = Math.floor(Math.random() * 256);
	setRGBColorPicker(r, g, b);
}

function updateCoordDisplay() {
	var tileCoordX = -positionX / tileW;
	var tileCoordY = -positionY / tileH;
	var centerY = -Math.floor(tileCoordY / coordSizeY);
	var centerX = Math.floor(tileCoordX / coordSizeX);
	elm.coord_Y.innerText = centerY;
	elm.coord_X.innerText = centerX;
}

function createColorButton(color) {
	var celm = document.createElement("span");
	var colorInt = resolveColorValue(color);
	var colorValues = int_to_rgb(colorInt);
	celm.className = "color_btn";
	var hex = int_to_hexcode(colorInt);
	celm.style.backgroundColor = hex;
	celm.title = hex.toUpperCase();
	celm.onclick = function() {
		setRGBColorPicker(colorValues[0], colorValues[1], colorValues[2]);
		w._ui.colorInputModal.onSubmit();
	}
	return celm;
}

function addColorShortcuts() {
	var colors = [
		"#000000",
		"#FF0000",
		"#008000",
		"#0000FF",
		"#FFFFFF"
	];
	for(var i = 0; i < colors.length; i++) {
		var col = colors[i];
		elm.color_shortcuts.appendChild(createColorButton(col));
	}
	var rand = document.createElement("span");
	rand.className = "color_btn";
	rand.style.backgroundColor = "#FFFFFF";
	rand.innerText = "?";
	rand.title = "Random color";
	rand.onclick = setColorPickerRandom;
	elm.color_shortcuts.appendChild(rand);
}

init_dom();

var draggable_element_mousemove = [];
var draggable_element_mouseup = [];
function draggable_element(dragger, dragged, exclusions, onDrag) {
	if(!dragged) {
		dragged = dragger;
	}
	var elmX = 0;
	var elmY = 0;
	var elmHeight = 0;
	var elmWidth = 0;
	var dragging = false;

	var clickX = 0;
	var clickY = 0;
	dragger.addEventListener("mousedown", function(e) {
		if(exclusions) {
			for(var i = 0; i < exclusions.length; i++) {
				if(closest(e.target, exclusions[i])) {
					return;
				}
			}
		}
		if(!closest(e.target, dragger)) return;
		elmX = dragged.offsetLeft;
		elmY = dragged.offsetTop;
		elmWidth = dragged.offsetWidth;
		elmHeight = dragged.offsetHeight;
		dragging = true;
		clickX = e.pageX;
		clickY = e.pageY;
	});
	// when the element is being dragged
	draggable_element_mousemove.push(function(e, arg_pageX, arg_pageY) {
		if(!dragging) return;
		if(onDrag) {
			if(onDrag() == -1) return;
		}
		dragged.style.top = "";
		dragged.style.bottom = "";
		dragged.style.left = "";
		dragged.style.right = "";

		var diffX = arg_pageX - clickX;
		var diffY = arg_pageY - clickY;

		var newY = elmY + diffY;
		var newX = elmX + diffX;

		dragged.style.top = newY + "px";
		dragged.style.left = newX + "px";
		if(newX <= elementSnapApprox) {
			dragged.style.left = "0px";
		}
		if(newX + elmWidth >= getWndWidth() - elementSnapApprox) {
			dragged.style.left = "";
			dragged.style.right = "0px";
		}
		if(newY <= elementSnapApprox) {
			dragged.style.top = "0px";
		}
		if(newY + elmHeight >= getWndHeight() - elementSnapApprox) {
			dragged.style.top = "";
			dragged.style.bottom = "0px";
		}
	});
	// when the element is released
	draggable_element_mouseup.push(function() {
		dragging = false;
	});
}

function resizeChat(width, height) {
	// default: 400 x 300
	if(width < 350) width = 350;
	if(height < 57) height = 57;
	elm.chat_window.style.width = width + "px";
	elm.chat_window.style.height = height + "px";
	return [width, height];
}

draggable_element(elm.chat_window, null, [
	elm.chatbar, elm.chatsend, elm.chat_close, elm.chat_page_tab, elm.chat_global_tab, elm.page_chatfield, elm.global_chatfield
], function() {
	if(chatResizing) {
		return -1;
	}
});
draggable_element(elm.confirm_js, null, [
	elm.confirm_js_code
]);

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
resizable_chat();

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

getStoredNickname();

function loadBackgroundData(cb, timeout_cb) {
	if(!backgroundEnabled || !state.background) {
		return cb();
	}
	var backPath = state.background.path;
	var backImgElm = new Image();
	var error = false;
	var timeout = false;
	var loadTimeout = setTimeout(function() {
		timeout = true;
		cb();
	}, 300);
	backImgElm.src = backPath;
	backImgElm.onload = function() {
		clearTimeout(loadTimeout);
		if(error) {
			if(!timeout) cb();
			return;
		}
		backgroundImage = backImgElm;
		backgroundPattern = owotCtx.createPattern(backImgElm, "repeat");
		backgroundPatternSize = [backImgElm.width, backImgElm.height];
		if(timeout) {
			// if it eventually loads after timing out
			if(timeout_cb) timeout_cb();
		} else {
			cb();
		}
	}
	backImgElm.onerror = function() {
		error = true;
		backImgElm.onload();
	}
}

function keydown_regionSelect(e) {
	if(!checkKeyPress(e, keyConfig.copyRegion) || regionSelectionsActive()) return;
	if(w._state.uiModal) return;
	if(!worldFocused) return;
	e.preventDefault();
	w.regionSelect.startSelection();
}
document.addEventListener("keydown", keydown_regionSelect);

function handleRegionSelection(coordA, coordB, regWidth, regHeight) {
	var tileX = coordA[0];
	var tileY = coordA[1];
	var charX = coordA[2];
	var charY = coordA[3];
	var reg = "";
	var colors = [];
	var links = [];
	var protections = [];
	for(var y = 0; y < regHeight; y++) {
		if(y != 0) {
			reg += "\n";
		}
		for(var x = 0; x < regWidth; x++) {
			var charInfo = getCharInfo(tileX, tileY, charX, charY);
			var char = charInfo.char;
			char = char.replace(/\r|\n|\x1b/g, " ");
			reg += char;
			colors.push(charInfo.color);
			var tile = Tile.get(tileX, tileY);
			var containsLink = false;
			if(tile && tile.properties && tile.properties.cell_props) {
				if(tile.properties.cell_props[charY] && tile.properties.cell_props[charY][charX]) {
					var link = tile.properties.cell_props[charY][charX];
					if(link.link) {
						link = link.link;
						containsLink = true;
						if(link.type == "url") {
							links.push("$u" + "\"" + escapeQuote(link.url) + "\"");
						} else if(link.type == "coord") {
							links.push("$c" + "[" + link.link_tileX + "," + link.link_tileY + "]");
						}
					}
				}
			}
			protections.push(charInfo.protection);
			if(!containsLink) {
				links.push(null);
			}
			charX++;
			if(charX >= tileC) {
				charX = 0;
				tileX++;
			}
		}
		tileX = coordA[0];
		charX = coordA[2];
		charY++;
		if(charY >= tileR) {
			charY = 0;
			tileY++;
		}
	}
	w._ui.selectionModal.open(reg, colors, links, protections);
	w.emit("regionSelected", {
		a: coordA,
		b: coordB
	});
}

var defaultSizes = {
	// in pixels
	cellW: 10,
	cellH: 18,
	// assigned later
	tileW: null,
	tileH: null,
	// in characters
	tileC: 16, // columns (width)
	tileR: 8 // rows (height)
}
if(state.worldModel.square_chars) defaultSizes.cellW = 18;
if(state.worldModel.half_chars) defaultSizes.cellH = 20;
if(state.worldModel.tileCols) defaultSizes.tileC = state.worldModel.tileCols;
if(state.worldModel.tileRows) defaultSizes.tileR = state.worldModel.tileRows;

var cellWidthPad, tileW, tileH, cellW, cellH, font, specialCharFont, tileC, tileR, tileArea;
var tileWidth, tileHeight; // exact tile dimensions for determining rendering size of tiles
var dTileW, dTileH; // locked tile sizes for background image generation

var fontTemplate = "$px 'Courier New', monospace";
var specialCharFontTemplate = "$px consolas, monospace";

function updateScaleConsts() {
	defaultSizes.tileW = defaultSizes.cellW * defaultSizes.tileC;
	defaultSizes.tileH = defaultSizes.cellH * defaultSizes.tileR;
	dTileW = defaultSizes.tileW;
	dTileH = defaultSizes.tileH;
	cellWidthPad = Math.floor((defaultSizes.cellW - 10) / 2); // X text offset if the cell is wider

	tileW = defaultSizes.tileW * zoom;
	tileH = defaultSizes.tileH * zoom;
	cellW = defaultSizes.cellW * zoom;
	cellH = defaultSizes.cellH * zoom;

	tileWidth = Math.ceil(tileW);
	tileHeight = Math.ceil(tileH);

	var fontSize = normFontSize(16 * zoom);

	font = fontTemplate.replace("$", fontSize);
	specialCharFont = specialCharFontTemplate.replace("$", fontSize);

	textRenderCanvas.width = tileWidth;
	textRenderCanvas.height = tileHeight;
	textRenderCtx.font = font;

	tileC = defaultSizes.tileC;
	tileR = defaultSizes.tileR;
	tileArea = tileC * tileR;
}

var textRenderCanvas;
var textRenderCtx;
function setupTextRenderCtx() {
	if(!textRenderCanvas) {
		textRenderCanvas = document.createElement("canvas");
	} else {
		textRenderCanvas.remove();
		textRenderCanvas = document.createElement("canvas");
	}
	if(transparentBackground) {
		textRenderCtx = textRenderCanvas.getContext("2d");
	} else {
		textRenderCtx = textRenderCanvas.getContext("2d", {
			alpha: false
		});
	}
}

setupTextRenderCtx();
updateScaleConsts();

function reloadRenderer() {
	if(tileCanvasPool.length) {
		removeAllTilesFromPools();
		deleteAllPools();
		w.render(true);
	}
}

// set absolute zoom
function doZoom(percentage) {
	if(percentage < 3) percentage = 3;
	if(percentage > 1000) percentage = 1000;
	percentage = decimal(percentage);
	zoom = percentage;

	if(zoom < 0.20) {
		shiftOptimization = true;
	}
	updateScaleConsts();

	if(tileWidth * tileHeight > 100000000) {
		throw "Memory leak";
	}
	textRenderCanvas.width = tileWidth;
	textRenderCanvas.height = tileHeight;
	textRenderCtx.font = font;

	// change size of invisible link
	linkDiv.style.width = (cellW / zoomRatio) + "px";
	linkDiv.style.height = (cellH / zoomRatio) + "px";

	// rerender everything
	reloadRenderer();
}

// set user zoom
function changeZoom(percentage) {
	positionX /= zoom;
	positionY /= zoom;
	userZoom = percentage / 100;
	if(userZoom < 0.2) userZoom = 0.2;
	if(userZoom > 10) userZoom = 10;
	doZoom(userZoom * deviceRatio() * 100);
	positionX *= zoom;
	positionY *= zoom;
	positionX = Math.trunc(positionX); // remove decimals
	positionY = Math.trunc(positionY);
	w.render();
	setZoombarValue();
}

function setZoombarValue() {
	// zoombar is logarithmic. work in reverse.
	zoombar.value = fromLogZoom(userZoom) * 100;
}

function fromLogZoom(val) {
	if(val <= 1) {
		val = Math.pow(2, -1 / val); 
	} else {
		val = 1 - Math.pow(2, -val);
	}
	return val;
}

function toLogZoom(val) {
	if(val <= 0.5) {
		val = -1 / Math.log2(val);
	} else {
		val = -Math.log2(1 - val);
	}
	return val;
}

function browserZoomAdjust(initial) {
	zoomRatio = deviceRatio();
	var absZoom = zoomRatio * userZoom;
	if(zoom == absZoom && !initial) return false; // if no zoom change is detected, do nothing
	positionX /= zoom;
	positionY /= zoom;
	adjust_scaling_DOM(zoomRatio);
	doZoom(absZoom * 100);
	positionX *= zoom;
	positionY *= zoom;
	positionX = Math.trunc(positionX);
	positionY = Math.trunc(positionY);
	return true;
}

function createTilePool() {
	var pCanv = document.createElement("canvas");
	var pDims = getPoolDimensions(tileWidth, tileHeight);
	var pWidth = pDims[0] * tileWidth;
	var pHeight = pDims[1] * tileHeight;
	pCanv.width = pWidth;
	pCanv.height = pHeight;
	var pCtx = pCanv.getContext("2d");
	var pMap = {};
	var pool = {
		canv: pCanv,
		ctx: pCtx,
		map: pMap,
		width: pDims[0],
		height: pDims[1],
		size: 0
	};
	tileCanvasPool.push(pool);
	return pool;
}

function allocateTile() {
	var pLocated = false;
	var pObj, pTilePos;
	for(var i = 0; i < tileCanvasPool.length; i++) {
		var pool = tileCanvasPool[i];
		var area = pool.width * pool.height;
		if(pool.size >= area) continue;
		var map = pool.map;
		for(var t = 0; t < area; t++) {
			if(map[t]) continue;
			pLocated = true;
			pObj = pool;
			pTilePos = t;
			break;
		}
		if(pLocated) break;
	}
	if(!pLocated) {
		pObj = createTilePool();
		pTilePos = 0;
	}
	var pMap = pObj.map;
	pObj.size++;
	var mapX = pTilePos % pObj.width;
	var mapY = Math.floor(pTilePos / pObj.width);
	var tileObj = {
		pool: pObj,
		x: mapX,
		y: mapY,
		idx: pTilePos,
		poolX: mapX * tileWidth,
		poolY: mapY * tileHeight
	};
	pMap[pTilePos] = tileObj;
	return tileObj;
}

function deallocateTile(obj) {
	var pool = obj.pool;
	var idx = obj.idx;
	if(pool.map[idx]) {
		delete pool.map[idx];
		pool.size--;
	}
}

function reallocateTile(obj) {
	var pX = obj.poolX;
	var pY = obj.poolY;
	var pool = obj.pool;
	deallocateTile(obj);
	var newObj = allocateTile();
	var newPool = newObj.pool;
	var newPX = newObj.poolX;
	var newPY = newObj.poolY;
	// transfer rendered text data if it has moved to a new spot
	if(pX != newPX || pY != newPY || pool != newPool) {
		newPool.ctx.clearRect(newPX, newPY, tileWidth, tileHeight);
		newPool.ctx.drawImage(pool.canv, pX, pY, tileWidth, tileHeight, newPX, newPY, tileWidth, tileHeight);
	}
	return newObj;
}

function deletePool(pool) {
	var canv = pool.canv;
	canv.width = 0;
	canv.height = 0;
	delete pool.canv;
	for(var t in pool.map) {
		delete pool.map[t];
	}
}

function deleteEmptyPools() {
	for(var i = 0; i < tileCanvasPool.length; i++) {
		var pool = tileCanvasPool[i];
		if(pool.size == 0) {
			deletePool(pool);
			tileCanvasPool.splice(i, 1);
			i--;
		}
	}
}

function deleteAllPools() {
	for(var i = 0; i < tileCanvasPool.length; i++) {
		var pool = tileCanvasPool[i];
		deletePool(pool);
		tileCanvasPool.splice(i, 1);
		i--;
	}
}

var tilePixelCache = {};
function loadTileFromPool(tileX, tileY, doNotCreate) {
	var pos = tileY + "," + tileX;
	if(tilePixelCache[pos]) {
		return tilePixelCache[pos];
	}
	if(doNotCreate) return null;
	var newTile = allocateTile();
	tilePixelCache[pos] = newTile;
	return newTile;
}

function shiftAllTilesInPools() {
	if(tileCanvasPool.length <= 1) return;
	for(var tile in tilePixelCache) {
		tilePixelCache[tile] = reallocateTile(tilePixelCache[tile]);
	}
	deleteEmptyPools();
}

function removeTileFromPool(tileX, tileY) {
	var pos = tileY + "," + tileX;
	if(!tilePixelCache[pos]) return;
	deallocateTile(tilePixelCache[pos]);
	delete tilePixelCache[pos];
}

function removeAllTilesFromPools() {
	for(var tile in tilePixelCache) {
		deallocateTile(tilePixelCache[tile]);
		delete tilePixelCache[tile];
	}
}

var tileProtectAuto = {
	selected: {},
	selectedTile: null,
	xPos: 0,
	yPos: 0,
	charXPos: 0,
	charYPos: 0,
	lastPos: null,
	mode: 0,
	ctrlDown: false,
	shiftDown: false,
	clearSelections: function() {
		for(var i in tileProtectAuto.selected) {
			tiles[i].backgroundColor = "";
			delete tileProtectAuto.selected[i];
		}
	},
	active: false
}

var linkAuto = {
	selected: {},
	ctrlDown: 0,
	shiftDown: 0,
	mode: 0,
	url: "",
	coordTileX: 0,
	coordTileY: 0,
	lastPos: null,
	active: false
}

var autoTotal = 0;
function updateAutoProg() {
	if(autoTotal > 0) {
		auto_prog.style.display = "";
	} else {
		auto_prog.style.display = "none";
	}
	auto_prog.innerText = autoTotal + " remaining";
}

// Fast tile protecting
function mousemove_tileProtectAuto() {
	if(!tileProtectAuto.active) return;
	var tile = Tile.get(currentPosition[0], currentPosition[1]);
	if(!tile) return;
	tileProtectAuto.selectedTile = tile;
	var tileX = currentPosition[0];
	var tileY = currentPosition[1];
	var charX = currentPosition[2];
	var charY = currentPosition[3];
	var lastPos = tileProtectAuto.lastPos;
	tileProtectAuto.xPos = tileX;
	tileProtectAuto.yPos = tileY;
	tileProtectAuto.charXPos = charX;
	tileProtectAuto.charYPos = charY;
	if(tileProtectAuto.ctrlDown) {
		var line = null;
		var absX = tileX * tileC + charX;
		var absY = tileY * tileR + charY;
		if(protectPrecision == 0) {
			absX = tileX;
			absY = tileY;
		}
		if(lastPos && lastPos[4] == protectPrecision) {
			var labsX = lastPos[0] * tileC + lastPos[2];
			var labsY = lastPos[1] * tileR + lastPos[3];
			if(protectPrecision == 0) {
				labsX = lastPos[0];
				labsY = lastPos[1];
			}
			line = lineGen(labsX, labsY, absX, absY, 1000);
		} else {
			line = [[absX, absY]];
		}
		tileProtectAuto.lastPos = [tileX, tileY, charX, charY, protectPrecision];
		var updTiles = {};
		for(var i = 0; i < line.length; i++) {
			var chr = line[i];
			var x = chr[0];
			var y = chr[1];
			var ctileX = Math.floor(x / tileC);
			var ctileY = Math.floor(y / tileR);
			var ccharX = x - ctileX * tileC;
			var ccharY = y - ctileY * tileR;
			if(protectPrecision == 0) {
				ctileX = x;
				ctileY = y;
			}
			var tempTile = Tile.get(ctileX, ctileY);
			var mode = tileProtectAuto.mode;
			if(protectPrecision == 0 && tempTile) {
				tileProtectAuto.selected[ctileY + "," + ctileX] =
					[protectPrecision, mode, tempTile];
			} else if(protectPrecision == 1 && tempTile) {
				tileProtectAuto.selected[ctileY + "," + ctileX + "," + ccharY + "," + ccharX] =
					[protectPrecision, mode, tempTile];
			}
			var colors = ["red", "green", "blue", "teal"];
			var color = colors[mode];
			if(protectPrecision == 0) {
				if(tempTile) tempTile.backgroundColor = color;
			} else if(protectPrecision == 1) {
				colorChar(ctileX, ctileY, ccharX, ccharY, w.protect_bg, true);
			}
			updTiles[ctileY + "," + ctileX] = 1;
		}
		for(var i in updTiles) {
			var pos = i.split(",");
			var tileX = parseInt(pos[1]);
			var tileY = parseInt(pos[0]);
			w.setTileRedraw(tileX, tileY);
		}
	}
	if(tileProtectAuto.shiftDown) {
		var pos = tileY + "," + tileX;
		if(protectPrecision == 1) {
			pos = tileY + "," + tileX + "," + charY + "," + charX;
		}
		if(tileProtectAuto.selected[pos] !== void 0) {
			var precision = tileProtectAuto.selected[pos][0];
			if(precision == 0) {
				tile.backgroundColor = "";
			} else if(precision == 1) {
				uncolorChar(tileX, tileY, charX, charY);
			}
			delete tileProtectAuto.selected[pos];
			w.setTileRender(tileX, tileY);
		}
	}
}
document.addEventListener("mousemove", mousemove_tileProtectAuto);

function keydown_tileProtectAuto(e) {
	if(!worldFocused) return;
	if(checkKeyPress(e, keyConfig.autoApply)) { // Alt/Ctrl + S to protect tiles
		var selected = tileProtectAuto.selected;
		var types = ["owner-only", "member-only", "public"];
		var keys = Object.keys(selected);
		if(keys.length == 0) return;
		e.preventDefault();
		autoTotal += keys.length;
		updateAutoProg();

		var idx = 0;
		function step() {
			var i = keys[idx];
			idx++;
			var pos = i.split(",").map(Number);
			var precision = selected[i][0];
			var prot = selected[i][1];

			var tileX = pos[1];
			var tileY = pos[0];
			var charX = pos[3];
			var charY = pos[2];

			var position = {
				tileY: tileY,
				tileX: tileX
			};
			if(precision == 1) {
				position.charX = charX;
				position.charY = charY;
			}
			var type;
			if(prot == 3) {
				type = "unprotect";
			} else {
				type = types[prot];
			}
			network.protect(position, type);

			autoTotal--;
			updateAutoProg();
			if(precision == 0) {
				selected[i][2].backgroundColor = "";
				delete selected[i];
				w.setTileRender(tileX, tileY);
			} else if(precision == 1) {
				delete selected[i];
				uncolorChar(tileX, tileY, charX, charY);
				w.setTileRedraw(tileX, tileY);
			}

			if(idx >= keys.length) return;
			setTimeout(step, 4);
		}
		step();
	} else {
		var ctrlState = tileProtectAuto.ctrlDown;
		tileProtectAuto.ctrlDown = checkKeyPress(e, keyConfig.autoSelect);
		tileProtectAuto.shiftDown = checkKeyPress(e, keyConfig.autoDeselect);
		if(!ctrlState && tileProtectAuto.ctrlDown) {
			tileProtectAuto.lastPos = null;
		}
	}
}
document.body.addEventListener("keydown", keydown_tileProtectAuto);

// Fast linking
function mousemove_linkAuto() {
	if(!linkAuto.active) return;
	var tile = Tile.get(currentPosition[0], currentPosition[1]);
	if(!tile) return;
	
	var tileX = currentPosition[0];
	var tileY = currentPosition[1];
	var charX = currentPosition[2];
	var charY = currentPosition[3];
	var lastPos = linkAuto.lastPos;
	
	var color = "blue";
	if(linkAuto.mode == 1) {
		color = "green";
	}

	if(linkAuto.ctrlDown) {
		var line = null;
		var absX = tileX * tileC + charX;
		var absY = tileY * tileR + charY;
		if(lastPos) {
			var labsX = lastPos[0] * tileC + lastPos[2];
			var labsY = lastPos[1] * tileR + lastPos[3];
			line = lineGen(labsX, labsY, absX, absY, 1000);
		} else {
			line = [[absX, absY]];
		}
		linkAuto.lastPos = [tileX, tileY, charX, charY];
		var updTiles = {};
		for(var i = 0; i < line.length; i++) {
			var chr = line[i];
			var x = chr[0];
			var y = chr[1];
			var ctileX = Math.floor(x / tileC);
			var ctileY = Math.floor(y / tileR);
			var ccharX = x - ctileX * tileC;
			var ccharY = y - ctileY * tileR;

			colorChar(ctileX, ctileY, ccharX, ccharY, color);
			updTiles[ctileY + "," + ctileX] = 1;
			var ar = [ctileX, ctileY, ccharX, ccharY, linkAuto.mode];
			if(linkAuto.mode == 0) {
				ar.push([linkAuto.url])
			} else if(linkAuto.mode == 1) {
				ar.push([linkAuto.coordTileX, linkAuto.coordTileY]);
			}
			linkAuto.selected[ctileY + "," + ctileX + "," + ccharY + "," + ccharX] = ar;
		}
		for(var i in updTiles) {
			var pos = i.split(",");
			var tileX = parseInt(pos[1]);
			var tileY = parseInt(pos[0]);
			w.setTileRedraw(tileX, tileY);
		}
	}
	if(linkAuto.shiftDown) {
		var elm = linkAuto.selected[tileY + "," + tileX + "," + charY + "," + charX];
		if(elm !== void 0) {
			uncolorChar(tileX, tileY, charX, charY);
			w.setTileRedraw(tileX, tileY);
			delete linkAuto.selected[tileY + "," + tileX + "," + charY + "," + charX];
		}
	}
}
document.addEventListener("mousemove", mousemove_linkAuto);

function keydown_linkAuto(e) {
	if(!worldFocused) return;
	if(checkKeyPress(e, keyConfig.autoApply)) { // Alt/Ctrl + S to add links
		var selected = linkAuto.selected;
		var keys = Object.keys(selected);
		if(keys.length == 0) return;
		e.preventDefault();
		autoTotal += keys.length;
		updateAutoProg();

		var idx = 0;
		function step() {
			var i = keys[idx];
			idx++;
			var pos = i.split(",").map(Number);
			var tileX = pos[1];
			var tileY = pos[0];
			var charX = pos[3];
			var charY = pos[2];

			var mode = selected[i][4];
			var linkData = selected[i][5];

			var data = {};
			var link_type;
			if(mode == 0) {
				data.url = w.url_input;
				link_type = "url";
				data.url = linkData[0];
			} else if(mode == 1) {
				link_type = "coord";
				data.x = linkData[0];
				data.y = linkData[1];
			}

			network.link({
				tileY: tileY,
				tileX: tileX,
				charY: charY,
				charX: charX
			}, link_type, data);

			autoTotal--;
			updateAutoProg();
			delete selected[i];
			uncolorChar(tileX, tileY, charX, charY);
			w.setTileRedraw(tileX, tileY);

			if(idx >= keys.length) return;
			setTimeout(step, 4);
		}
		step();
	} else {
		var ctrlState = linkAuto.ctrlDown;
		linkAuto.ctrlDown = checkKeyPress(e, keyConfig.autoSelect);
		linkAuto.shiftDown = checkKeyPress(e, keyConfig.autoDeselect);
		if(!ctrlState && linkAuto.ctrlDown) {
			linkAuto.lastPos = null;
		}
	}
}
document.body.addEventListener("keydown", keydown_linkAuto);

function onKeyUp(e) {
	var sel = checkKeyPress(e, keyConfig.autoSelect);
	var des = checkKeyPress(e, keyConfig.autoDeselect);
	linkAuto.ctrlDown = sel;
	linkAuto.shiftDown = des;
	tileProtectAuto.ctrlDown = sel;
	tileProtectAuto.shiftDown = des;

	if(checkKeyPress(e, keyConfig.cursorUp)) { // arrow up
		autoArrowKeyMoveStop("up");
	}
	if(checkKeyPress(e, keyConfig.cursorDown)) { // arrow down
		autoArrowKeyMoveStop("down");
	}
	if(checkKeyPress(e, keyConfig.cursorLeft)) { // arrow left
		autoArrowKeyMoveStop("left");
	}
	if(checkKeyPress(e, keyConfig.cursorRight)) { // arrow right
		autoArrowKeyMoveStop("right");
	}
	if(checkKeyPress(e, keyConfig.centerTeleport)) { // home
		w.doGoToCoord(0, 0);
	}
}
document.body.addEventListener("keyup", onKeyUp);

function adjust_scaling_DOM(ratio) {
	var window_width = getWndWidth();
	var window_height = getWndHeight();
	// change variable sizes to the screen-width of the inner browser (same, regardless of zoom)
	owotWidth = Math.round(window_width * ratio);
	owotHeight = Math.round(window_height * ratio);
	// make size of canvas the size of the inner browser screen-size
	elm.owot.width = Math.round(window_width * ratio);
	elm.owot.height = Math.round(window_height * ratio);
	// make the display size the size of the viewport
	elm.owot.style.width = window_width + "px";
	elm.owot.style.height = window_height + "px";
	if(shiftOptimization) {
		shiftOptState.zoom = -1;
	}
}

function event_resize() {
	var ratio = deviceRatio();
	if(!ratio) ratio = 1;
	w.emit("resize", ratio);
	if(!browserZoomAdjust()) {
		adjust_scaling_DOM(ratio);
	}
	w.render();
}
window.addEventListener("resize", event_resize);

browserZoomAdjust(true);

function getChar(tileX, tileY, charX, charY) {
	if(tileX == void 0 && tileY == void 0 && charX == void 0 && charY == void 0) {
		if(!cursorCoords) return -1;
		tileX = cursorCoords[0];
		tileY = cursorCoords[1];
		charX = cursorCoords[2];
		charY = cursorCoords[3];
	}
	var tile = Tile.get(tileX, tileY);
	if(!tile) return " ";
	var content = tile.content;
	return content[charY * tileC + charX];
}

function getCharColor(tileX, tileY, charX, charY) {
	if(tileX == void 0 && tileY == void 0 && charX == void 0 && charY == void 0) {
		if(!cursorCoords) return -1;
		tileX = cursorCoords[0];
		tileY = cursorCoords[1];
		charX = cursorCoords[2];
		charY = cursorCoords[3];
	}
	var tile = Tile.get(tileX, tileY);
	if(!tile) return 0;
	if(!tile.properties.color) return 0;
	return tile.properties.color[charY * tileC + charX];
}

function getCharProtection(tileX, tileY, charX, charY) {
	if(tileX == void 0 && tileY == void 0 && charX == void 0 && charY == void 0) {
		if(!cursorCoords) return -1;
		tileX = cursorCoords[0];
		tileY = cursorCoords[1];
		charX = cursorCoords[2];
		charY = cursorCoords[3];
	}
	var tile = Tile.get(tileX, tileY);
	if(!tile) return state.worldModel.writability;
	var prot = tile.properties.writability;
	if(tile.properties && tile.properties.char) {
		prot = tile.properties.char[charY * tileC + charX];
		// null indicates that it inherits writability from its parent
		if(prot == null) prot = tile.properties.writability;
	}
	if(prot == null) prot = state.worldModel.writability;
	return prot;
}

function getCharInfo(tileX, tileY, charX, charY) {
	if(tileX == void 0 && tileY == void 0 && charX == void 0 && charY == void 0) {
		if(!cursorCoords) return -1;
		tileX = cursorCoords[0];
		tileY = cursorCoords[1];
		charX = cursorCoords[2];
		charY = cursorCoords[3];
	}
	return {
		loaded: isTileLoaded(tileX, tileY),
		char: getChar(tileX, tileY, charX, charY),
		color: getCharColor(tileX, tileY, charX, charY),
		protection: getCharProtection(tileX, tileY, charX, charY)
	};
}

function getCharInfoXY(x, y) {
	var tileX = Math.floor(x / tileC);
	var tileY = Math.floor(y / tileR);
	var charX = x - tileX * tileC;
	var charY = y - tileY * tileR;
	return getCharInfo(tileX, tileY, charX, charY);
}

function getLink(tileX, tileY, charX, charY) {
	if(!Tile.get(tileX, tileY)) return null;
	var tile = Tile.get(tileX, tileY);
	if(!tile) return null;
	var props = tile.properties.cell_props;
	if(!props) return null;
	if(!props[charY]) return null;
	if(!props[charY][charX]) return null;
	if(!props[charY][charX].link) return null;
	return props[charY][charX].link;
}

function getLinkXY(x, y) {
	var tileX = Math.floor(x / tileC);
	var tileY = Math.floor(y / tileR);
	var charX = x - tileX * tileC;
	var charY = y - tileY * tileR;
	return getLink(tileX, tileY, charX, charY);
}

// copy individual chars
function event_keydown_copy_char(e) {
	if(w._state.uiModal) return;
	if(!worldFocused) return;
	if(document.activeElement.tagName == "INPUT" && document.activeElement.type == "text" && document.activeElement != elm.textInput) return;
	var textCursorCopy = checkKeyPress(e, keyConfig.copyCharacterText);
	var mouseCursorCopy = checkKeyPress(e, keyConfig.copyCharacterMouse);
	if(!textCursorCopy && !mouseCursorCopy) return;
	stopPasting();
	// ctrl + c to copy characters where the text cursor is,
	// ctrl + m to copy characters where the mouse cursor is
	var pos_ref = cursorCoords;
	if(mouseCursorCopy) { // copy where mouse cursor is
		pos_ref = currentPosition;
	}
	if(!pos_ref) return;
	var tileX = pos_ref[0];
	var tileY = pos_ref[1];
	var charX = pos_ref[2];
	var charY = pos_ref[3];
	var char = getChar(tileX, tileY, charX, charY);
	char = char.replace(/\r|\n/g, " ");
	w.clipboard.copy(char);
}
document.addEventListener("keydown", event_keydown_copy_char);

// color picker
function event_keydown_copy_color(e) {
	if(!worldFocused) return;
	if(!checkKeyPress(e, keyConfig.copyColor)) return;
	stopPasting();
	// alt + c to use color of text cell (where mouse cursor is) as main color
	var pos = currentPosition;
	if(!pos) return;
	var tileX = pos[0];
	var tileY = pos[1];
	var charX = pos[2];
	var charY = pos[3];
	var color = getCharColor(tileX, tileY, charX, charY);
	w.changeColor(color);
}
document.addEventListener("keydown", event_keydown_copy_color);

// convert color value to rgb24 int
function resolveColorValue(val) {
	if(typeof val == "number") {
		if(!isFinite(val)) return 0;
		if(isNaN(val)) return 0;
		val = Math.trunc(val);
		if(val < 0) return 0;
		if(val > 16777215) return 16777215;
		return val;
	}
	if(typeof val != "string" || !val) return 0;
	var orig = val;
	if(val[0] == "#") val = val.substr(1);
	if(isHexString(val)) {
		if(val.length == 3) {
			return parseInt(val[0] + val[0] + val[1] + val[1] + val[2] + val[2], 16);
		} else if(val.length == 6) {
			return parseInt(val, 16);
		}
	}
	var num = parseInt(val);
	if(!isNaN(num)) {
		num = Math.trunc(num);
		if(num < 0) num = 0;
		if(num > 16777215) num = 16777215;
		return num;
	}
	owotCtx.fillStyle = "#000000";
	owotCtx.fillStyle = orig;
	var fs = owotCtx.fillStyle;
	if(fs[0] == "#" && fs.length == 7) {
		return parseInt(fs.substr(1).slice(0, 6), 16);
	}
	return 0;
}

elm.owot.width = owotWidth;
elm.owot.height = owotHeight;

var cursorCoords = null; // [tileX, tileY, charX, charY]; Coordinates of text cursor. If mouse is deselected, the value is null.
var cursorCoordsCurrent = [0, 0, 0, 0, -1]; // [tileX, tileY, charX, charY]; cursorCoords that don't reset to null.
var currentPosition = [0, 0, 0, 0]; // [tileX, tileY, charX, charY]; Tile and char coordinates where mouse cursor is located.
var currentPositionInitted = false;
var currentMousePosition = [0, 0, 0, 0]; // [x, y, pageX, pageY]; Position of mouse cursor.

var Tile = {};
Tile.set = function(tileX, tileY, data) {
	var str = tileY + "," + tileX;
	if(!(str in tiles)) {
		w.tile.count++;
	}
	tiles[str] = data;
	return data;
}
Tile.delete = function(tileX, tileY) {
	var str = tileY + "," + tileX;
	removeTileFromPool(tileX, tileY);
	w.periodDeletedTiles++;
	if(str in tiles) {
		delete tiles[str];
		w.tile.count--;
	}
}
Tile.get = function(tileX, tileY) {
	var tile = tiles[tileY + "," + tileX];
	return tile;
}
// does this tile exist (or is reserved) in memory?
Tile.exists = function(tileX, tileY) {
	var str = tileY + "," + tileX;
	return str in tiles;
}
// is this tile fully loaded?
Tile.loaded = function(tileX, tileY) {
	return !!Tile.get(tileX, tileY);
}
Tile.visible = function(tileX, tileY) {
	var tilePosX = tileX * tileW + positionX + Math.trunc(owotWidth / 2);
	var tilePosY = tileY * tileH + positionY + Math.trunc(owotHeight / 2);
	// too far left/top. check if the right/bottom edge of tile is also too far left/top
	if((tilePosX < 0 || tilePosY < 0) && (tilePosX + tileW - 1 < 0 || tilePosY + tileH - 1 < 0)) {
		return false;
	}
	// too far right/bottom
	if(tilePosX >= owotWidth || tilePosY >= owotHeight) {
		return false;
	}
	return true;
}

var poolCleanupInterval = setInterval(function() {
	if(w.periodDeletedTiles < 50) return;
	w.periodDeletedTiles = 0;
	shiftAllTilesInPools();
}, 1000 * 10);

// deprecated
var textLayerCtx = owotCtx;

function createWsPath() {
	var search = window.location.search;
	if(!search) search = "";
	return "ws" + (window.location.protocol == "https:" ? "s" : "") + "://" + window.location.host + state.worldModel.pathname + "/ws/" + search;
}

function checkTextColorOverride() {
	var public = 4;
	var member = 2;
	var owner = 1;
	// if custom text color is set to a zone, use that color instead of main default
	if(styles.public_text != "#000" && styles.public_text != "#000000") {
		textColorOverride |= public;
	} else {
		textColorOverride &= textColorOverride ^ public;
	}
	if(styles.member_text != "#000" && styles.member_text != "#000000") {
		textColorOverride |= member;
	} else {
		textColorOverride &= textColorOverride ^ member;
	}
	if(styles.owner_text != "#000" && styles.owner_text != "#000000") {
		textColorOverride |= owner;
	} else {
		textColorOverride &= textColorOverride ^ owner;
	}
}
var styles = null;

var menuStyle;
function menu_color(color) {
	if(color.toLowerCase() == "#e5e5ff") {
		if(window.menuStyle) {
			window.menuStyle.remove();
			window.menuStyle = null;
		}
		return;
	}
	// change menu color
	if(!window.menuStyle) {
		menuStyle = document.createElement("style");
		document.head.appendChild(menuStyle);
	}
	var rgb = int_to_rgb(resolveColorValue(color));
	var value = Math.max(rgb[0], rgb[1], rgb[2]);
	var bDelta = 25;
	var hDelta = 35;
	var tColor = "#CCCCCC";
	if(value > 128) {
		bDelta = -25;
		hDelta = -35;
		tColor = "#000000";
	}
	var bRgb = [
		Math.max(0, rgb[0] + bDelta),
		Math.max(0, rgb[1] + bDelta),
		Math.max(0, rgb[2] + bDelta)
	];
	var hRgb = [
		Math.min(255, rgb[0] + hDelta),
		Math.min(255, rgb[1] + hDelta),
		Math.min(255, rgb[2] + hDelta)
	];
	var bColor = int_to_hexcode(rgb_to_int(bRgb[0], bRgb[1], bRgb[2]));
	var hColor = int_to_hexcode(rgb_to_int(hRgb[0], hRgb[1], hRgb[2]));
	menuStyle.innerHTML = "#menu.hover, #nav {" +
			"background: " + color + ";" +
			"border-color: " + bColor + ";" +
			"color: " + tColor + ";" +
		"}\n" +
			"#nav li {" +
			"border-top-color: " + bColor + ";" +
		"}\n" +
		"#nav li.hover {" +
			"background-color: " + hColor + ";" +
		"}\n" +
		"#coords {" +
			"background-color: " + bColor + ";" +
			"color: " + tColor + ";" +
		"}";
}

function defaultStyles() {
	return {
		owner: "#ddd",
		member: "#eee",
		public: "#fff",
		cursor: "#ff0",
		guestCursor: "#ffa",
		text: "#000",
		menu: "#e5e5ff",
		public_text: "#000",
		member_text: "#000",
		owner_text: "#000"
	};
}

function manageCoordHash() {
	if(!Permissions.can_go_to_coord(state.userModel, state.worldModel)) return;
	try {
		var coord = window.location.hash.match(/#x:-?\d+,y:-?\d+$/);
		if(coord) {
			coord = window.location.hash.split(/#x:|,y:/).slice(1).map(function(a) {
				return parseInt(a, 10);
			});
			w.doGoToCoord(coord[1], coord[0]);
		}
	} catch(e) {
		console.log(e);
	}
}

// type: "style" or "props"
// callback: function(style, error)
function getWorldProps(world, type, cb) {
	if(!type) type = "style";
	var propUrl;
	if(type == "style") {
		propUrl = "/world_style/";
	} else if(type == "props") {
		propUrl = "/world_props/";
	} else {
		console.error("Invalid type: " + type);
		return cb(null, true);
	}
	if(window.location.search) {
		propUrl += window.location.search + "&world=" + world;
	} else {
		propUrl += "?world=" + world;
	}
	ajaxRequest({
		type: "GET",
		url: propUrl,
		done: function(data) {
			try {
				data = JSON.parse(data);
			} catch(e) {
				return cb(null, true);
			}
			cb(data, false);
		},
		error: function() {
			cb(null, true);
		}
	});
}

function stopLinkUI() {
	if(!lastLinkHover) return;
	if(!w.isLinking) return;
	w.isLinking = false;
	linkAuto.active = false;
	elm.owot.style.cursor = defaultCursor;
	var tileX = lastLinkHover[0];
	var tileY = lastLinkHover[1];
	var charX = lastLinkHover[2];
	var charY = lastLinkHover[3];
	// remove highlight
	uncolorChar(tileX, tileY, charX, charY);
	w.setTileRedraw(tileX, tileY);
}

function removeTileProtectHighlight() {
	if(!lastTileHover) return;
	var precision = lastTileHover[0];
	var tileX = lastTileHover[1];
	var tileY = lastTileHover[2];
	var charX = lastTileHover[3];
	var charY = lastTileHover[4];

	if(Tile.get(tileX, tileY)) {
		if(precision == 0) {
			Tile.get(tileX, tileY).backgroundColor = "";
		} else if(precision == 1) {
			uncolorChar(tileX, tileY, charX, charY);
		}
	}
	w.setTileRedraw(tileX, tileY);
}

function stopTileUI() {
	if(!lastTileHover) return;
	if(!w.isProtecting) return;
	elm.protect_precision.style.display = "none";
	w.isProtecting = false;
	tileProtectAuto.active = false;
	tileProtectAuto.lastPos = null;
	elm.owot.style.cursor = defaultCursor;
	removeTileProtectHighlight();
}

function doLink() {
	if(!lastLinkHover) return;
	stopLinkUI();
	var tileX = lastLinkHover[0];
	var tileY = lastLinkHover[1];
	var charX = lastLinkHover[2];
	var charY = lastLinkHover[3];
	var data = {};
	var link_type;
	if(w.link_input_type == 0) {
		data.url = w.url_input;
		link_type = "url";
	} else if(w.link_input_type == 1) {
		data.x = w.coord_input_x;
		data.y = w.coord_input_y;
		link_type = "coord";
	}
	network.link({
		tileY: tileY,
		tileX: tileX,
		charY: charY,
		charX: charX
	}, link_type, data);
}

function doProtect() {
	if(!lastTileHover) return;
	stopTileUI();
	var tileX = lastTileHover[1];
	var tileY = lastTileHover[2];
	var types = ["public", "member-only", "owner-only"];
	var position = {
		tileY: tileY,
		tileX: tileX
	};
	var action;
	if(w.protect_type == null) {
		action = "unprotect";
	} else {
		action = types[w.protect_type];
	}
	if(protectPrecision == 1) {
		position.charX = lastTileHover[3];
		position.charY = lastTileHover[4];
	}
	network.protect(position, action);
}

var dragStartX = 0;
var dragStartY = 0;
// the offset before clicking to drag
var dragPosX = 0;
var dragPosY = 0;
var isDragging = false;
var hasDragged = false;
var draggingEnabled = true;
function event_mousedown(e, arg_pageX, arg_pageY) {
	currentMousePosition[0] = e.pageX;
	currentMousePosition[1] = e.pageY;
	var target = e.target;
	if(closest(target, getChatfield()) || target == elm.chatbar || target == elm.confirm_js_code) {
		worldFocused = false;
	} else {
		worldFocused = true;
	}

	var pageX = Math.trunc(e.pageX * zoomRatio);
	var pageY = Math.trunc(e.pageY * zoomRatio);
	if(arg_pageX != void 0) pageX = arg_pageX;
	if(arg_pageY != void 0) pageY = arg_pageY;
	if(target != elm.owot && target != linkDiv) {
		return;
	}
	if(draggingEnabled) {
		dragStartX = pageX;
		dragStartY = pageY;
		dragPosX = positionX;
		dragPosY = positionY;
		isDragging = true;
	}
	stopPasting();
	if(w.isLinking) {
		doLink();
	}
	if(w.isProtecting) {
		doProtect();
	}
	var foundActiveSelection = false;
	for(var i = 0; i < regionSelections.length; i++) {
		var reg = regionSelections[i];
		if(reg.isSelecting) {
			reg.regionCoordA = currentPosition;
			reg.show();
			reg.setSelection(reg.regionCoordA, reg.regionCoordA);
			foundActiveSelection = true;
		}
	}
	if(foundActiveSelection) return;
	var pos = getTileCoordsFromMouseCoords(pageX, pageY);
	w.emit("mouseDown", {
		tileX: pos[0],
		tileY: pos[1],
		charX: pos[2],
		charY: pos[3],
		pageX: pageX,
		pageY: pageY
	});
	elm.owot.style.cursor = defaultDragCursor;
	w.menu.hideNow();
}
document.addEventListener("mousedown", event_mousedown);

function event_touchstart(e) {
	var pos = touch_pagePos(e);
	touchPosX = pos[0];
	touchPosY = pos[1];
	event_mousemove(e, touchPosX, touchPosY);
	if(w.isProtecting) {
		var cp = currentPosition;
		lastTileHover = [protectPrecision, cp[0], cp[1], cp[2], cp[3]];
	}
	if(w.isLinking) {
		lastLinkHover = currentPosition;
	}
	event_mousedown(e, pos[0], pos[1]);
}
document.addEventListener("touchstart", event_touchstart, { passive: false });

// change cursor position
function renderCursor(coords) {
	var newTileX = coords[0];
	var newTileY = coords[1];
	var tile = Tile.get(newTileX, newTileY);
	if(!tile) return false;
	var writability = tile.properties.writability;
	var thisTile = {
		writability: writability,
		char: tile.properties.char
	}
	var tileX = 0;
	var tileY = 0;
	if(cursorCoords) {
		tileX = cursorCoords[0];
		tileY = cursorCoords[1];
	}
	var selCharX = coords[2];
	var selCharY = coords[3];
	if(!Permissions.can_edit_tile(state.userModel, state.worldModel, thisTile, selCharX, selCharY)) {
		removeCursor();
		return false;
	}

	if(cursorCoords) {
		cursorCoords = null;
		w.setTileRender(tileX, tileY);
	} else {
		w.emit("cursorShow", {
			tileX: coords[0],
			tileY: coords[1],
			charX: coords[2],
			charY: coords[3]
		});
	}
	cursorCoords = coords.slice(0);
	cursorCoordsCurrent = coords.slice(0);
	w.setTileRender(coords[0], coords[1]);

	var pixelX = (coords[0] * tileW) + (coords[2] * cellW) + positionX + Math.trunc(owotWidth / 2);
	var pixelY = (coords[1] * tileH) + (coords[3] * cellH) + positionY + Math.trunc(owotHeight / 2);
	
	var diff = null;
	// keep record of old positions to check if they changed
	var posXCompare = positionX;
	var posYCompare = positionY;

	if(pixelX < 0) { // cursor too far left
		diff = Math.abs(pixelX);
		positionX += diff;
	}
	if(pixelX + cellW >= owotWidth) { // cursor too far right
		diff = owotWidth - pixelX;
		positionX -= cellW - diff;
	}
	if(pixelY < 0) { // cursor too far up
		diff = Math.abs(pixelY);
		positionY += diff;
	}
	if(pixelY + cellH >= owotHeight) { // cursor too far down
		diff = owotHeight - pixelY;
		positionY -= cellH - diff;
	}

	if(diff != null && (posXCompare != positionX || posYCompare != positionY)) w.render();
	if(cursorCoords) w.emit("cursorMove", {
		tileX: cursorCoords[0],
		tileY: cursorCoords[1],
		charX: cursorCoords[2],
		charY: cursorCoords[3]
	});
}

function removeCursor() {
	if(!cursorCoords) return;
	var remTileX = cursorCoords[0];
	var remTileY = cursorCoords[1];
	var cursorPos = {
		tileX: cursorCoords[0],
		tileY: cursorCoords[1],
		charX: cursorCoords[2],
		charY: cursorCoords[3]
	};
	cursorCoords = null;
	w.setTileRender(remTileX, remTileY);
	w.emit("cursorHide", cursorPos);
}

function stopDragging() {
	isDragging = false;
	hasDragged = false;
	elm.owot.style.cursor = defaultCursor;
}

var cursorEnabled = true;
function event_mouseup(e, arg_pageX, arg_pageY) {
	var pageX = Math.trunc(e.pageX * zoomRatio);
	var pageY = Math.trunc(e.pageY * zoomRatio);
	if(arg_pageX != void 0) pageX = arg_pageX;
	if(arg_pageY != void 0) pageY = arg_pageY;
	var canShowMobileKeyboard = !hasDragged;
	stopDragging();

	for(var i = 0; i < draggable_element_mouseup.length; i++) {
		draggable_element_mouseup[i](e, pageX, pageY);
	}

	if(e.target != elm.owot && e.target != linkDiv) return;

	if(e.which == 3) { // right click
		if(ignoreCanvasContext) {
			ignoreCanvasContext = false;
			elm.owot.style.pointerEvents = "none";
			setTimeout(function() {
				ignoreCanvasContext = true;
				elm.owot.style.pointerEvents = "";
			}, 1);
		}
		return;
	}

	var foundActiveSelection = false;
	for(var i = 0; i < regionSelections.length; i++) {
		var reg = regionSelections[i];
		if(reg.isSelecting) {
			reg.regionCoordB = currentPosition;
			reg.handleSelection();
			reg.stopSelectionUI();
			foundActiveSelection = true;
		}
	}
	if(foundActiveSelection) return;

	if(closest(e.target, elm.main_view) && canShowMobileKeyboard) {
		elm.textInput.focus();
	}

	// set cursor
	var pos = getTileCoordsFromMouseCoords(pageX, pageY);
	w.emit("mouseUp", {
		tileX: pos[0],
		tileY: pos[1],
		charX: pos[2],
		charY: pos[3],
		pageX: pageX,
		pageY: pageY
	});
	if(cursorEnabled && Tile.get(pos[0], pos[1]) !== void 0) {
		verticalEnterPos[0] = pos[0];
		verticalEnterPos[1] = pos[2];
		// change position of the cursor and get results
		if(renderCursor(pos) == false) {
			// cursor should be removed if on area where user cannot write
			if(cursorCoords) {
				removeCursor();
			}
		}
	}
}

document.addEventListener("mouseup", event_mouseup);
function event_touchend(e) {
	event_mouseup(e, touchPosX, touchPosY);
}
document.addEventListener("touchend", event_touchend);
function event_mouseleave(e) {
	w.emit("mouseLeave", e);
}
document.addEventListener("mouseleave", event_mouseleave);
function event_mouseenter(e) {
	w.emit("mouseEnter", e);
}
document.addEventListener("mouseenter", event_mouseenter);

function is_link(tileX, tileY, charX, charY) {
	if(!Tile.get(tileX, tileY)) return;
	var tile = Tile.get(tileX, tileY);
	if(!tile) return;
	var props = tile.properties.cell_props;
	if(!props) return false;
	if(!props[charY]) return false;
	if(!props[charY][charX]) return false;
	if(!props[charY][charX].link) return false;
	return [props[charY][charX].link];
}

function flushWrites() {
	if(w.socket.socket.readyState != WebSocket.OPEN) return;
	network.write(writeBuffer.slice(0, 512));
	writeBuffer.splice(0, 512);
}

var writeInterval;
function setWriteInterval() {
	clearInterval(writeInterval);
	writeInterval = setInterval(function() {
		if(!writeBuffer.length) return;
		try {
			flushWrites();
			sendCursorPosition();
		} catch(e) {
			console.log(e);
		}
	}, writeFlushRate);
}
setWriteInterval();

function moveCursor(direction, preserveVertPos) {
	if(!cursorCoords) return;
	// [tileX, tileY, charX, charY]
	var pos = cursorCoords.slice(0);
	if(direction == "up") {
		pos[3]--;
		if(pos[3] < 0) {
			pos[3] = tileR - 1;
			pos[1]--
		}
	} else if(direction == "down") {
		pos[3]++;
		if(pos[3] > tileR - 1) {
			pos[3] = 0;
			pos[1]++;
		}
	} else if(direction == "left") {
		pos[2]--;
		if(pos[2] < 0) {
			pos[2] = tileC - 1;
			pos[0]--;
		}
	} else if(direction == "right") {
		pos[2]++;
		if(pos[2] > tileC - 1) {
			pos[2] = 0;
			pos[0]++;
		}
	}
	if(!preserveVertPos) {
		verticalEnterPos[0] = pos[0];
		verticalEnterPos[1] = pos[2];
	}
	return renderCursor(pos);
}

// place a character
function writeCharTo(char, charColor, tileX, tileY, charX, charY) {
	if(!Tile.get(tileX, tileY)) {
		Tile.set(tileX, tileY, blankTile());
	}
	
	var cell_props = Tile.get(tileX, tileY).properties.cell_props;
	if(!cell_props) cell_props = {};
	var color = Tile.get(tileX, tileY).properties.color;
	if(!color) color = new Array(tileArea).fill(0);

	// delete link locally
	if(cell_props[charY]) {
		if(cell_props[charY][charX]) {
			delete cell_props[charY][charX];
		}
	}
	// change color
	if(Permissions.can_color_text(state.userModel, state.worldModel)) {
		color[charY * tileC + charX] = charColor;
		Tile.get(tileX, tileY).properties.color = color; // if the color array doesn't already exist in the tile
	}

	// update cell properties (link positions)
	Tile.get(tileX, tileY).properties.cell_props = cell_props;

	// set char locally
	var con = Tile.get(tileX, tileY).content;
	con[charY * tileC + charX] = char;
	w.setTileRedraw(tileX, tileY);

	var editArray = [tileY, tileX, charY, charX, getDate(), char, nextObjId];
	if(tileFetchOffsetX || tileFetchOffsetY) {
		editArray[0] += tileFetchOffsetY;
		editArray[1] += tileFetchOffsetX;
	}
	if(charColor && Permissions.can_color_text(state.userModel, state.worldModel)) {
		editArray.push(charColor);
	}
	tellEdit.push([tileX, tileY, charX, charY, nextObjId]);
	writeBuffer.push(editArray);
	nextObjId++;
}

function writeCharToXY(char, charColor, x, y) {
	writeCharTo(char, charColor,
		Math.floor(x / tileC),
		Math.floor(y / tileR),
		x - Math.floor(x / tileC) * tileC,
		y - Math.floor(y / tileR) * tileR);
}

// type a character
function writeChar(char, doNotMoveCursor, temp_color, noNewline) {
	char += "";
	var charColor = temp_color || YourWorld.Color;
	if(temp_color == 0) charColor = 0;
	var cursor = cursorCoords;
	if(!cursor && (char == "\n" || char == "\r") && !noNewline) {
		cursor = cursorCoordsCurrent;
	}
	var skipChar = false;
	if(char == "") {
		skipChar = true;
	} else {
		char = w.split(char);
		char = char[0];
		if(char == void 0) return;
	}
	if(!cursor) return; // cursor is not visible
	var tileX = cursor[0];
	var tileY = cursor[1];
	var charX = cursor[2];
	var charY = cursor[3];
	var newLine = (char == "\n" || char == "\r") && !noNewline;
	if(!doNotMoveCursor) {
		var pos = propagatePosition({
			tileX: cursor[0],
			tileY: cursor[1],
			charX: cursor[2],
			charY: cursor[3]
		}, char, noNewline);
		renderCursor([
			pos.tileX, pos.tileY,
			pos.charX, pos.charY
		]);
		// wait if the tile hasn't loaded
		if(cursorCoords) {
			var compare = cursor.slice(0);
			if(cursorCoords[0] == compare[0] && cursorCoords[1] == compare[1] &&
			   cursorCoords[2] == compare[2] && cursorCoords[3] == compare[3]) {
				return null;
			}
		}
	}
	if(!newLine && !skipChar) {
		var data = {
			char: char,
			color: charColor,
			tileX: tileX,
			tileY: tileY,
			charX: charX,
			charY: charY
		};
		w.emit("writeBefore", data);
		writeCharTo(data.char, data.color, data.tileX, data.tileY, data.charX, data.charY);
		w.emit("write", data);
	}
}

function coordinateAdd(tileX1, tileY1, charX1, charY1, tileX2, tileY2, charX2, charY2) {
	return [
		tileX1 + tileX2 + Math.floor((charX1 + charX2) / tileC),
		tileY1 + tileY2 + Math.floor((charY1 + charY2) / tileR),
		(charX1 + charX2) % tileC,
		(charY1 + charY2) % tileR
	];
}

function propagatePosition(coords, char, noEnter, noVertPos) {
	// coords: {tileX, tileY, charX, charY}
	// char: <string>
	var newline = char == "\n" || char == "\r";
	if(newline && !noEnter) {
		if(pasteDirDown) {
			coords.charY++;
			if(coords.charY >= tileR) {
				coords.charY = 0;
				coords.tileY++;
			}
		} else {
			coords.charY--;
			if(coords.charY < 0) {
				coords.charY = tileY - 1;
				coords.tileY--;
			}
		}
		if(noVertPos) {
			coords.tileX = 0;
			coords.charX = 0;
		} else {
			coords.tileX = verticalEnterPos[0];
			coords.charX = verticalEnterPos[1];
		}
	} else {
		if(pasteDirRight) {
			coords.charX++;
			if(coords.charX >= tileC) {
				coords.charX = 0;
				coords.tileX++;
			}
		} else {
			coords.charX--;
			if(coords.charX < 0) {
				coords.charX = tileC - 1;
				coords.tileX--;
			}
		}
	}
	return coords;
}

function textcode_parser(value, coords, defaultColor) {
	if(typeof value == "string") value = w.split(value);
	var hex = "ABCDEF";
	var pasteColor = defaultColor;
	if(!pasteColor) pasteColor = 0;
	var index = 0;
	var off = {
		tileX: 0, tileY: 0,
		charX: 0, charY: 0
	};
	if(coords) {
		off.tileX = coords.tileX;
		off.tileY = coords.tileY;
		off.charX = coords.charX;
		off.charY = coords.charY;
	}
	var pos = {
		tileX: 0, tileY: 0,
		charX: 0, charY: 0
	};
	var next = function() {
		if(index >= value.length) return -1;
		var chr = value[index];
		var doWriteChar = true;
		var newline = true;
		if(chr == "\x1b") {
			doWriteChar = false;
			var hCode = value[index + 1];
			if(hCode == "$") { // contains links
				index += 2;
				var lType = value[index];
				index++;
				if(lType == "c") { // coord
					var strPoint = index;
					var buf = "";
					var mode = 0;
					while(true) {
						if(value[strPoint] == "[" && mode == 0) {
							mode = 1;
							if(++strPoint >= value.length) break;
							continue;
						}
						if(value[strPoint] == "]" && mode == 1) {
							strPoint++;
							break;
						}
						if(mode == 1) {
							buf += value[strPoint];
							if(++strPoint >= value.length) break;
							continue;
						}
						if(++strPoint >= value.length) break;
					}
					index = strPoint;
					buf = buf.split(",");
					var coordTileX = parseFloat(buf[0].trim());
					var coordTileY = parseFloat(buf[1].trim());
					var charPos = coordinateAdd(pos.tileX, pos.tileY, pos.charX, pos.charY,
						off.tileX, off.tileY, off.charX, off.charY);
					return {
						type: "link",
						linkType: "coord",
						tileX: charPos[0],
						tileY: charPos[1],
						charX: charPos[2],
						charY: charPos[3],
						coord_tileX: coordTileX,
						coord_tileY: coordTileY
					};
				} else if(lType == "u") { // urllink
					var strPoint = index;
					var buf = "";
					var quotMode = 0;
					while(true) {
						if(value[strPoint] == "\"" && quotMode == 0) {
							quotMode = 1;
							if(++strPoint >= value.length) break;
							continue;
						}
						if(value[strPoint] == "\"" && quotMode == 1) {
							strPoint++;
							break;
						}
						if(quotMode == 1) {
							if(value[strPoint] == "\\") {
								quotMode = 2;
								if(++strPoint >= value.length) break;
								continue;
							}
							buf += value[strPoint];
						}
						if(quotMode == 2) {
							buf += value[strPoint];
							quotMode = 1;
							if(++strPoint >= value.length) break;
							continue;
						}
						if(++strPoint >= value.length) break;
					}
					index = strPoint;
					var charPos = coordinateAdd(pos.tileX, pos.tileY, pos.charX, pos.charY,
						off.tileX, off.tileY, off.charX, off.charY);
					return {
						type: "link",
						linkType: "url",
						tileX: charPos[0],
						tileY: charPos[1],
						charX: charPos[2],
						charY: charPos[3],
						url: buf
					};
				}
			} else if(hCode == "P") { // contains area protections
				index += 2;
				var protType = parseInt(value[index]);
				index++;
				if(isNaN(protType)) protType = 0;
				if(!(protType >= 0 && protType <= 2)) protType = 0;
				var charPos = coordinateAdd(pos.tileX, pos.tileY, pos.charX, pos.charY,
					off.tileX, off.tileY, off.charX, off.charY);
				return {
					type: "protect",
					protType: protType,
					tileX: charPos[0],
					tileY: charPos[1],
					charX: charPos[2],
					charY: charPos[3]
				};
			} else if(hCode == "*") { // skip character
				index++;
				chr = "";
				doWriteChar = true;
			} else if(hCode == "x" || hCode == "X" || (hCode >= "A" && hCode <= "F")) { // colored paste
				var cCol = "";
				if(hCode == "x") {
					cCol = "000000";
					index += 2;
				} else if(hCode == "X") {
					// -1 does not overwrite color
					cCol = "-1";
					index += 2;
				} else {
					var code = hex.indexOf(hCode);
					if(code > -1) {
						cCol = value.slice(index + 2, index + 2 + code + 1).join("");
						index += code + 1;
					}
					index += 2;
				}
				pasteColor = parseInt(cCol, 16);
				return {
					type: "yield"
				};
			} else {
				index += 2;
				doWriteChar = true;
				if(hCode == "\n") { // paste newline character itself
					chr = "\n";
					newline = false;
				} else if(hCode == "\r") { // paste carriage return character itself
					chr = "\r";
					newline = false;
				} else if(hCode == "\x1b") { // paste ESC character itself
					chr = "\x1b";
				} else {
					chr = hCode;
				}
			}
		} else {
			index++;
		}
		var charPos = coordinateAdd(pos.tileX, pos.tileY, pos.charX, pos.charY,
			off.tileX, off.tileY, off.charX, off.charY);
		propagatePosition(pos, chr, false, true);
		return {
			type: "char",
			char: chr,
			color: pasteColor,
			writable: doWriteChar,
			newline: newline, // if false, interpret newline characters as characters
			tileX: charPos[0],
			tileY: charPos[1],
			charX: charPos[2],
			charY: charPos[3]
		};
	}
	return {
		next: next,
		nextItem: function() {
			while(true) {
				var item = next();
				if(item == -1) return -1;
				if(item.type == "yield") continue;
				return item;
			}
		}
	};
}

function stabilizeTextInput() {
	elm.textInput.selectionEnd = elm.textInput.value.length;
	elm.textInput.selectionStart = elm.textInput.selectionEnd;
}

elm.textInput.addEventListener("keydown", stabilizeTextInput);

var write_busy = false; // currently pasting
var pasteInterval;
var linkQueue = [];
var char_input_check = setInterval(function() {
	if(w._state.uiModal) return;
	if(write_busy) return;
	var value = elm.textInput.value;
	var hasErased = getDate() - previousErase < 1000;
	if(!value) {
		if(hasErased) {
			elm.textInput.value = "\x7F";
		}
		return;
	}
	if(value == "\x7F") {
		if(!hasErased) {
			elm.textInput.value = "";
		}
		return;
	}
	stabilizeTextInput();
	value = w.split(value.replace(/\r\n/g, "\n").replace(/\x7F/g, ""));
	if(value.length == 1) {
		writeChar(value[0]);
		elm.textInput.value = "";
		return;
	}
	clearInterval(pasteInterval);
	var pastePerm = Permissions.can_paste(state.userModel, state.worldModel);
	var requestNextItem = true;
	if(!cursorCoords) {
		elm.textInput.value = "";
		return;
	}
	var parser = textcode_parser(value, {
		tileX: cursorCoords[0],
		tileY: cursorCoords[1],
		charX: cursorCoords[2],
		charY: cursorCoords[3]
	}, YourWorld.Color);
	var item;
	var charCount = 0;
	var pasteFunc = function() {
		if(requestNextItem) {
			item = parser.nextItem();
		} else {
			requestNextItem = true;
		}
		if(item == -1)  {
			return -1;
		}
		if(item.type == "char") {
			if(item.writable) {
				if(item.char == "\x7F") {
					return true;
				}
				var res = writeChar(item.char, false, item.color, !item.newline);
				if(res === null) {
					// pause until tile loads
					requestNextItem = false;
					return false;
				}
				charCount++;
			}
		} else if(item.type == "link") {
			if(item.linkType == "url" && Permissions.can_urllink(state.userModel, state.worldModel)) {
				linkQueue.push(["url", item.tileX, item.tileY, item.charX, item.charY, item.url]);
			} else if(item.linkType == "coord" && Permissions.can_coordlink(state.userModel, state.worldModel)) {
				linkQueue.push(["coord", item.tileX, item.tileY, item.charX, item.charY, item.coord_tileX, item.coord_tileY]);
			}
		} else if(item.type == "protect") {
			var protType = item.protType;
			var canProtect = true;
			if(protType <= 1) { // public, member
				if(!Permissions.can_protect_tiles(state.userModel, state.worldModel)) canProtect = false;
			}
			if(protType == 2) { // owner
				if(!Permissions.can_admin(state.userModel, state.worldModel)) protType = 1; // member
			}
			if(canProtect) {
				network.protect({
					tileY: item.tileY,
					tileX: item.tileX,
					charY: item.charY,
					charX: item.charX
				}, ["public", "member-only", "owner-only"][protType]);
			}
		}
		return true;
	};
	if(!pastePerm) {
		while(true) {
			var res = pasteFunc();
			if(!res || res == -1 || charCount >= 4) break;
		}
		elm.textInput.value = "";
		return;
	}
	write_busy = true;
	pasteInterval = setInterval(function() {
		var res = pasteFunc();
		if(res == -1) {
			clearInterval(pasteInterval);
			write_busy = false;
			elm.textInput.value = "";
		}
	}, Math.floor(1000 / 230));
}, 10);

function stopPasting() {
	if(write_busy) elm.textInput.value = "";
	clearInterval(pasteInterval);
	write_busy = false;
}

var autoArrowKeyMoveInterval = null;
var autoArrowKeyMoveActive = false;
var autoArrowKeyMoveState = {
	up: false,
	down: false,
	left: false,
	right: false,
	x_t: 0,
	y_t: 0,
	prog_x: 0,
	prog_y: 0
};
function autoArrowKeyMoveStart(dir) {
	if(!autoArrowKeyMoveActive) {
		autoArrowKeyMoveActive = true;
		autoArrowKeyMoveInterval = setInterval(function() {
			if(cursorCoords) {
				clearInterval(autoArrowKeyMoveInterval);
				autoArrowKeyMoveActive = false;
				autoArrowKeyMoveState.y_t = 0;
				autoArrowKeyMoveState.prog_y = 0;
				autoArrowKeyMoveState.x_t = 0;
				autoArrowKeyMoveState.prog_x = 0;
				return;
			}
			var date = getDate();
			var s_up = autoArrowKeyMoveState.up;
			var s_down = autoArrowKeyMoveState.down;
			var s_left = autoArrowKeyMoveState.left;
			var s_right = autoArrowKeyMoveState.right;
			var x_t = autoArrowKeyMoveState.x_t;
			var y_t = autoArrowKeyMoveState.y_t;
			if(x_t) {
				var diff = (date - x_t) / (1000 / 240);
				if(s_right && !s_left) {
					var addDiff = diff - autoArrowKeyMoveState.prog_x;
					autoArrowKeyMoveState.prog_x = diff;
					positionX -= addDiff;
					w.render();
				}
				if(s_left && !s_right) {
					var addDiff = diff - autoArrowKeyMoveState.prog_x;
					autoArrowKeyMoveState.prog_x = diff;
					positionX += addDiff;
					w.render();
				}
			}
			if(y_t) {
				var diff = (date - y_t) / (1000 / 240);
				if(s_up && !s_down) {
					var addDiff = diff - autoArrowKeyMoveState.prog_y;
					autoArrowKeyMoveState.prog_y = diff;
					positionY += addDiff;
					w.render();
				}
				if(s_down && !s_up) {
					var addDiff = diff - autoArrowKeyMoveState.prog_y;
					autoArrowKeyMoveState.prog_y = diff;
					positionY -= addDiff;
					w.render();
				}
			}
		}, 10);
	}
	switch(dir) {
		case "up":
			autoArrowKeyMoveState.up = true;
			if(autoArrowKeyMoveState.y_t == 0) autoArrowKeyMoveState.y_t = getDate();
			break;
		case "down":
			autoArrowKeyMoveState.down = true;
			if(autoArrowKeyMoveState.y_t == 0) autoArrowKeyMoveState.y_t = getDate();
			break;
		case "left":
			autoArrowKeyMoveState.left = true;
			if(autoArrowKeyMoveState.x_t == 0) autoArrowKeyMoveState.x_t = getDate();
			break;
		case "right":
			autoArrowKeyMoveState.right = true;
			if(autoArrowKeyMoveState.x_t == 0) autoArrowKeyMoveState.x_t = getDate();
			break;
	}
}
function autoArrowKeyMoveStop(dir) {
	switch(dir) {
		case "up":
			autoArrowKeyMoveState.up = false;
			autoArrowKeyMoveState.y_t = 0;
			autoArrowKeyMoveState.prog_y = 0;
			if(autoArrowKeyMoveState.down) autoArrowKeyMoveState.y_t = getDate();
			break;
		case "down":
			autoArrowKeyMoveState.down = false;
			autoArrowKeyMoveState.y_t = 0;
			autoArrowKeyMoveState.prog_y = 0;
			if(autoArrowKeyMoveState.up) autoArrowKeyMoveState.y_t = getDate();
			break;
		case "left":
			autoArrowKeyMoveState.left = false;
			autoArrowKeyMoveState.x_t = 0;
			autoArrowKeyMoveState.prog_x = 0;
			if(autoArrowKeyMoveState.right) autoArrowKeyMoveState.x_t = getDate();
			break;
		case "right":
			autoArrowKeyMoveState.right = false;
			autoArrowKeyMoveState.x_t = 0;
			autoArrowKeyMoveState.prog_x = 0;
			if(autoArrowKeyMoveState.left) autoArrowKeyMoveState.x_t = getDate();
			break;
	}
	if(!autoArrowKeyMoveState.up && !autoArrowKeyMoveState.down && !autoArrowKeyMoveState.left && !autoArrowKeyMoveState.right) {
		clearInterval(autoArrowKeyMoveInterval);
		autoArrowKeyMoveActive = false;
	}
}

function event_keydown(e) {
	var actElm = document.activeElement;
	if(!worldFocused) return;
	if(w._state.uiModal) return;
	if(actElm == elm.chatbar) return;
	if(actElm == elm.confirm_js_code) return;
	if(actElm.tagName == "INPUT" && actElm.type == "text" && actElm != elm.textInput) return;
	if(actElm != elm.textInput) elm.textInput.focus();
	stopPasting();
	if(checkKeyPress(e, keyConfig.cursorUp)) { // arrow up
		moveCursor("up");
		if(!cursorCoords) autoArrowKeyMoveStart("up");
	}
	if(checkKeyPress(e, keyConfig.cursorDown)) { // arrow down
		moveCursor("down");
		if(!cursorCoords) autoArrowKeyMoveStart("down");
	}
	if(checkKeyPress(e, keyConfig.cursorLeft)) { // arrow left
		moveCursor("left");
		if(!cursorCoords) autoArrowKeyMoveStart("left");
	}
	if(checkKeyPress(e, keyConfig.cursorRight)) { // arrow right
		moveCursor("right");
		if(!cursorCoords) autoArrowKeyMoveStart("right");
	}
	if(checkKeyPress(e, keyConfig.reset)) { // esc
		w.emit("esc");
		stopLinkUI();
		stopTileUI();
		for(var i = 0; i < regionSelections.length; i++) {
			regionSelections[i].stopSelectionUI();
		}
		removeCursor();
		tileProtectAuto.active = false;
		tileProtectAuto.lastPos = null;
		linkAuto.active = false;
	}
	if(checkKeyPress(e, "CTRL+ENTER")) {
		writeChar("\n");
	}
	if(checkKeyPress(e, keyConfig.erase)) { // erase character
		moveCursor("left", true);
		writeChar(" ", true);
		previousErase = getDate();
	}
	if(checkKeyPress(e, keyConfig.cellErase)) {
		writeChar(" ", true);
	}
	if(checkKeyPress(e, keyConfig.tab)) { // tab
		for(var i = 0; i < 4; i++) writeChar(" ");
		e.preventDefault();
	}
	w.emit("keyDown", e);
}
document.addEventListener("keydown", event_keydown);

function event_keyup(e) {
	w.emit("keyUp", e);
}
document.addEventListener("keyup", event_keyup);

function getTileCoordsFromMouseCoords(x, y) {
	var tileX = 0;
	var tileY = 0;
	var charX = 0;
	var charY = 0;
	// position relative to position in client and mouse
	var mpX = x - positionX - Math.trunc(owotWidth / 2);
	var mpY = y - positionY - Math.trunc(owotHeight / 2);
	// cell position (relative to anywhere)
	charX = Math.floor(mpX / cellW);
	charY = Math.floor(mpY / cellH);
	// add tile position
	tileX = Math.floor(charX / tileC);
	tileY = Math.floor(charY / tileR);
	// in-tile cell position
	charX = charX - (Math.floor(charX / tileC) * tileC);
	charY = charY - (Math.floor(charY / tileR) * tileR);
	return [tileX, tileY, charX, charY];
}

function getTileScreenPosition(tileX, tileY) {
	var offsetX = tileX * tileW + Math.trunc(owotWidth / 2) + Math.floor(positionX);
	var offsetY = tileY * tileH + Math.trunc(owotHeight / 2) + Math.floor(positionY);
	return [offsetX, offsetY];
}

function getVisibleTileRange(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, owotHeight - 1 + margin);
	var startX = clipIntMax(A[0]);
	var startY = clipIntMax(A[1]);
	var endX = clipIntMax(B[0]);
	var endY = clipIntMax(B[1]);
	if(startX > endX || startY > endY || (B[0] - A[0] + 1) > 100000 || (B[1] - A[1] + 1) > 100000) {
		throw "Invalid ranges";
	}
	return [[startX, startY], [endX, endY]];
}

function getVisibleTiles(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, owotHeight - 1 + margin);
	return getRange(A[0], A[1], B[0], B[1]);
}

function getWidth(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, 0);
	return B[0] - A[0] + 1;
}

function getHeight(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0, 0 - margin);
	var B = getTileCoordsFromMouseCoords(0, owotHeight - 1 + margin);
	return B[1] - A[1] + 1;
}

function getArea(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, owotHeight - 1 + margin);
	return (B[0] - A[0] + 1) * (B[1] - A[1] + 1);
}

function tileAndCharsToWindowCoords(tileX, tileY, charX, charY) {
	// first, define x and y as tile coords, not adjusted for center nor position offsets
	var x = tileX * tileW;
	var y = tileY * tileH;
	// add char offsets
	x += charX * cellW;
	y += charY * cellH;
	// add drag position offsets
	x += positionX;
	y += positionY;
	// add center offsets
	x += Math.trunc(owotWidth / 2);
	y += Math.trunc(owotHeight / 2);
	return [Math.trunc(x / zoomRatio), Math.trunc(y / zoomRatio)];
}

function alertJS(data) {
	js_alert_active = true;
	elm.confirm_js.style.display = "";
	elm.confirm_js_code.innerText = data;
	run_js_confirm.onclick = function() {
		confirmRunJSLink(data);
		return false;
	}
	confirm_js_cancel.onclick = closeJSAlert;
	confirm_js_cancel_x.onclick = closeJSAlert;
}

function closeJSAlert() {
	if(!js_alert_active) return;
	js_alert_active = false;
	elm.confirm_js.style.display = "none";
}

function executeJS(code) {
	var jsCode = new Function(code);
	return jsCode();
}

function confirmRunJSLink(data) {
	var preview = data;
	if(preview.length > 256) {
		preview = preview.slice(0, 256) + " [...]";
	}
	var doRun = confirm("Confirm that you will be running this script.\nPress cancel to NOT run it.\n\"" + preview + "\"");
	if(!doRun) return closeJSAlert();
	executeJS(data);
	closeJSAlert();
}

function runJSLink(data) {
	if(secureJSLink) {
		alertJS(data);
	} else {
		executeJS(data);
	}
}

var linkParams = {
	protocol: "",
	url: "",
	coord: false
};
linkDiv.style.width = (cellW / zoomRatio) + "px";
linkDiv.style.height = (cellH / zoomRatio) + "px";
linkElm.style.top = "-1000px";
linkElm.style.left = "-1000px";
linkElm.ondragstart = function() {
	return false;
}
linkElm.onclick = function(e) {
	if(linkParams.coord) {
		coord_link_click(e);
		return;
	}
	var linkEvent = url_link_click(e);
	var prot = linkParams.protocol;
	var url = linkParams.url;
	if(prot == "javascript") {
		runJSLink(url);
		return false;
	} else if(prot == "com") {
		w.broadcastCommand(url);
		return false;
	} else if(prot == "comu") {
		w.broadcastCommand(url, true);
		return false;
	}
	if(linkEvent && linkEvent[0]) {
		return linkEvent[0];
	}
}
var currentSelectedLink = null;
var currentSelectedLinkCoords = null; // [tileX, tileY, charX, charY]

function coord_link_click(evt) {
	if(!currentSelectedLink) return;
	w.doGoToCoord(currentSelectedLink.link_tileY, currentSelectedLink.link_tileX);
}
function url_link_click(evt) {
	if(!currentSelectedLink) return;
	var returnValue = [undefined];
	w.emit("linkClick", {
		url: currentSelectedLink.url,
		tileX: currentSelectedLinkCoords[0],
		tileY: currentSelectedLinkCoords[1],
		charX: currentSelectedLinkCoords[2],
		charY: currentSelectedLinkCoords[3],
		elm: linkElm,
		evt: evt,
		returnValue: returnValue
	});
	return returnValue[0];
}

function updateHoveredLink(mouseX, mouseY, evt, safe) {
	if(mouseX == void 0 && mouseY == void 0) {
		mouseX = currentMousePosition[0];
		mouseY = currentMousePosition[1];
	}
	var coords = getTileCoordsFromMouseCoords(mouseX, mouseY);
	var tileX = coords[0];
	var tileY = coords[1];
	var charX = coords[2];
	var charY = coords[3];
	if(evt) {
		if(!closest(evt.target, elm.main_view) && evt.target != linkDiv) return;
	}
	var link = getLink(tileX, tileY, charX, charY);
	if(safe) {
		if(!link) return;
		if(link.type != "coord") return;
	}
	if(link && linksEnabled && !regionSelectionsActive()) {
		currentSelectedLink = link;
		currentSelectedLinkCoords = coords;
		var pos = tileAndCharsToWindowCoords(tileX, tileY, charX, charY);
		elm.owot.style.cursor = "pointer";
		linkElm.style.left = pos[0] + "px";
		linkElm.style.top = pos[1] + "px";
		linkElm.hidden = false;
		linkElm.target = "_blank";
		linkElm.href = "";
		linkElm.rel = "";
		linkElm.title = "";
		if(link.type == "url") {
			linkParams.coord = false;
			var URL_Link = link.url;
			linkElm.href = URL_Link;
			linkElm.rel = "noopener noreferrer";
			var linkProtocol = linkElm.protocol;
			if(linkProtocol == "javascript:") {
				linkElm.target = "";
				linkParams.protocol = "javascript";
				var url = URL_Link.slice(linkProtocol.length);
				linkParams.url = url;
			} else if(linkProtocol == "com:") {
				linkElm.target = "";
				linkParams.protocol = "com";
				var url = URL_Link.slice(linkProtocol.length);
				linkParams.url = url;
				linkElm.title = "com:" + url;
			} else if(linkProtocol == "comu:") {
				linkElm.target = "";
				linkParams.protocol = "comu";
				var url = URL_Link.slice(linkProtocol.length);
				linkParams.url = url;
				linkElm.title = "comu:" + url;
			} else {
				linkParams.protocol = "";
				linkElm.rel = "noopener noreferrer";
				linkParams.url = URL_Link;
			}
			if(!linkElm.title) linkElm.title = "Link to URL " + linkElm.href;
		} else if(link.type == "coord") {
			linkParams.coord = true;
			linkParams.protocol = "";
			linkElm.target = "";
			linkElm.href = "javascript:void(0);";
			linkElm.target = "";
			var pos = link.link_tileX + "," + link.link_tileY;
			linkElm.title = "Link to coordinates " + pos;
		}
	} else {
		currentSelectedLink = null;
		currentSelectedLinkCoords = null;
		if(!linkElm.hidden) elm.owot.style.cursor = defaultCursor;
		linkElm.style.top = "-1000px";
		linkElm.style.left = "-1000px";
		linkElm.hidden = true;
	}
}

var touchPosX = 0;
var touchPosY = 0;
function event_mousemove(e, arg_pageX, arg_pageY) {
	currentMousePosition[0] = e.pageX;
	currentMousePosition[1] = e.pageY;
	var pageX = e.pageX * zoomRatio;
	var pageY = e.pageY * zoomRatio;
	if(arg_pageX != void 0) pageX = arg_pageX;
	if(arg_pageY != void 0) pageY = arg_pageY;
	var coords = getTileCoordsFromMouseCoords(pageX, pageY);
	currentPosition = coords;
	currentPositionInitted = true;
	var tileX = coords[0];
	var tileY = coords[1];
	var charX = coords[2];
	var charY = coords[3];
	w.emit("mouseMove", {
		tileX: tileX,
		tileY: tileY,
		charX: charX,
		charY: charY,
		pageX: pageX,
		pageY: pageY
	});
	for(var i = 0; i < draggable_element_mousemove.length; i++) {
		draggable_element_mousemove[i](e, e.pageX, e.pageY);
	}
	updateHoveredLink(pageX, pageY, e);
	if(e.target != elm.owot && e.target != linkDiv && !isDragging) return;

	// region selecting
	for(var i = 0; i < regionSelections.length; i++) {
		var reg = regionSelections[i];
		if(!reg.isSelecting) continue;
		if(reg.lastSelectionHover) {
			var tileX = reg.lastSelectionHover[0];
			var tileY = reg.lastSelectionHover[1];
			var charX = reg.lastSelectionHover[2];
			var charY = reg.lastSelectionHover[3];
			if(reg.tiled) {
				if(Tile.get(tileX, tileY)) {
					Tile.get(tileX, tileY).backgroundColor = "";
				}
			} else {
				uncolorChar(tileX, tileY, charX, charY);
			}
			w.setTileRedraw(tileX, tileY);
		}
		reg.lastSelectionHover = currentPosition;
		var newTileX = currentPosition[0];
		var newTileY = currentPosition[1];
		var newCharX = currentPosition[2];
		var newCharY = currentPosition[3];
		if(Tile.get(newTileX, newTileY)) {
			if(reg.tiled) {
				Tile.get(newTileX, newTileY).backgroundColor = reg.charColor;
			} else {
				colorChar(newTileX, newTileY, newCharX, newCharY, reg.charColor, true);
			}
			// re-render tile
			w.setTileRedraw(newTileX, newTileY);
		}
		reg.regionCoordB = currentPosition;
		if(reg.regionCoordA && reg.regionCoordB) reg.setSelection(reg.regionCoordA, reg.regionCoordB);
	}

	// url/coordinate linking
	if(w.isLinking) {
		if(lastLinkHover) {
			var tileX = lastLinkHover[0];
			var tileY = lastLinkHover[1];
			var charX = lastLinkHover[2];
			var charY = lastLinkHover[3];
			uncolorChar(tileX, tileY, charX, charY);
			w.setTileRedraw(tileX, tileY);
		}
		lastLinkHover = currentPosition;
		var newTileX = currentPosition[0];
		var newTileY = currentPosition[1];
		var newCharX = currentPosition[2];
		var newCharY = currentPosition[3];
		if(Tile.get(newTileX, newTileY)) {
			colorChar(newTileX, newTileY, newCharX, newCharY, "#aaf", true);
			// re-render tile
			w.setTileRedraw(newTileX, newTileY);
		}
	}

	// tile protection
	if(w.isProtecting) {
		if(lastTileHover) {
			var precision = lastTileHover[0];
			var tileX = lastTileHover[1];
			var tileY = lastTileHover[2];
			var charX = lastTileHover[3];
			var charY = lastTileHover[4];
			if(precision == 0) {
				if(Tile.get(tileX, tileY) && !tileProtectAuto.selected[tileY + "," + tileX]) {
					Tile.get(tileX, tileY).backgroundColor = "";
				}
			} else if(precision == 1) {
				uncolorChar(tileX, tileY, charX, charY);
				w.setTileRedraw(tileX, tileY);
			}
			w.setTileRedraw(tileX, tileY);
		}
		var cp = currentPosition;
		lastTileHover = [protectPrecision, cp[0], cp[1], cp[2], cp[3]];
		var newTileX = currentPosition[0];
		var newTileY = currentPosition[1];
		var newCharX = currentPosition[2];
		var newCharY = currentPosition[3];
		if(protectPrecision == 0) {
			if(Tile.get(newTileX, newTileY) && !tileProtectAuto.selected[newTileY + "," + newTileX]) {
				Tile.get(newTileX, newTileY).backgroundColor = w.protect_bg;
				w.setTileRender(newTileX, newTileY);
			}
		} else if(protectPrecision == 1) {
			if(Tile.get(newTileX, newTileY)) {
				colorChar(newTileX, newTileY, newCharX, newCharY, w.protect_bg);
				w.setTileRedraw(newTileX, newTileY);
			}
		}
	}

	if(!isDragging || regionSelectionsActive()) return;

	positionX = dragPosX + (pageX - dragStartX);
	positionY = dragPosY + (pageY - dragStartY);
	hasDragged = true;
	w.render();
}
document.addEventListener("mousemove", event_mousemove);
function event_touchmove(e) {
	var pos = touch_pagePos(e);
	touchPosX = pos[0];
	touchPosY = pos[1];
	if(closest(e.target, elm.main_view) || w._state.uiModal) {
		e.preventDefault();
	}
	event_mousemove(e, pos[0], pos[1]);
}
document.addEventListener("touchmove", event_touchmove, { passive: false });

// get position from touch event
function touch_pagePos(e) {
	var first_touch = e.touches[0];
	return [Math.trunc(first_touch.pageX * zoomRatio), Math.trunc(first_touch.pageY * zoomRatio)];
}

function event_wheel(e) {
	if(w._state.uiModal) return;
	if(!scrollingEnabled) return; // return if disabled
	// if focused on chat, don't scroll world
	if(closest(e.target, getChatfield())) return;
	if(closest(e.target, elm.confirm_js)) return;
	if(e.ctrlKey) return; // don't scroll if ctrl is down (zooming)
	var deltaX = Math.trunc(e.deltaX);
	var deltaY = Math.trunc(e.deltaY);
	if(e.deltaMode && deltaY) { // not zero (default)?
		deltaX = 0;
		deltaY = (deltaY / Math.abs(deltaY)) * 100;
	}
	if(checkKeyPress(e, keyConfig.sidewaysScroll)) { // if shift, scroll sideways
		deltaX = deltaY;
		deltaY = 0;
	}
	positionY -= deltaY;
	positionX -= deltaX;
	w.emit("scroll", {
		deltaX: -deltaX,
		deltaY: -deltaY
	});
	w.render();
}
document.addEventListener("wheel", event_wheel);

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

var fetchInterval;
var timesConnected = 0;
function createSocket() {
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
		clearAllGuestCursors();
		for(var tile in tiles) {
			if(tiles[tile] == null) {
				delete tiles[tile];
				w.tile.count--;
			}
		}
		w.fetchUnloadedTiles();
		clearInterval(fetchInterval);
		fetchInterval = setInterval(function() {
			w.fetchUnloadedTiles();
		}, checkTileFetchInterval);
		if(timesConnected == 1) {
			if(Permissions.can_chat(state.userModel, state.worldModel)) {
				network.chathistory();
			}
		}
		timesConnected++;
		if(w.receivingBroadcasts) {
			w.broadcastReceive(true);
		}
		if(disconnectTimeout != null) {
			clearTimeout(disconnectTimeout);
			disconnectTimeout = null;
			w.doAnnounce("");
		}
	}

	socket.onclose = function() {
		console.log("Socket has closed. Reconnecting...");
		for(var i in network.callbacks) {
			var cb = network.callbacks[i];
			if(typeof cb == "function") {
				cb(null, true);
			}
		}
		disconnectTimeout = setTimeout(function() {
			w.doAnnounce("Connection lost. Please wait until the client reconnects.");
			canAccessWorld = false;
		}, 1000 * 5);
	}

	socket.onerror = function(err) {
		console.log("Socket error:", err);
	}
}

function cullRanges(map, width, height) {
	var completelyFilled = true;
	for(var i = 0; i < map.length; i++) {
		if(!map[i]) {
			completelyFilled = false;
			break;
		}
	}
	if(completelyFilled) return [];
	var ranges = [];
	var iterNum = 0;
	var lastStartX = 0;
	var lastStartY = 0;
	while(true) {
		var startX = lastStartX;
		var startY = lastStartY;
		var startFound = false;
		var boundX = width - 1;
		var boundY = height - 1;
		var wLen = 0;
		var hLen = 1;
		for(var i = startY * width + startX; i < width * height; i++) {
			if(!map[i]) {
				startX = i % width;
				startY = Math.floor(i / width);
				startFound = true;
				break;
			}
		}
		if(!startFound) break;
		for(var i = startX; i <= boundX; i++) {
			if(map[startY * width + i]) break;
			wLen++;
		}
		// first row is skipped
		for(var y = startY + 1; y <= boundY; y++) {
			var invRow = false;
			for(var i = startX; i <= startX + wLen - 1; i++) {
				if(map[y * width + i]) {
					invRow = true;
					break;
				}
			}
			if(invRow) {
				break;
			} else {
				hLen++;
			}
		}
		var endX = startX + wLen - 1;
		var endY = startY + hLen - 1;
		for(var y = startY; y <= endY; y++) {
			for(var x = startX; x <= endX; x++) {
				map[y * width + x] = true;
			}
		}
		lastStartX = startX;
		lastStartY = startY;
		ranges.push([startX, startY, endX, endY]);
		iterNum++;
		if(iterNum > width * height) break;
	}
	var totalArea = 0;
	for(var i = 0; i < ranges.length; i++) {
		var range = ranges[i];
		var width = Math.abs(range[2] - range[0]) + 1;
		var height = Math.abs(range[3] - range[1]) + 1;
		if(width * height > 50 * 50) {
			if(width > 50 && height > 50) {
				range[2] -= width - 50; // reduce width
				range[3] -= height - 50; // reduce height
				width = 50;
				height = 50;
			} else if(width > 50) {
				range[2] -= width - 50;
				width = 50;
			} else if(height > 50) {
				range[3] -= height - 50;
				height = 50;
			}
		}
		totalArea += width * height;
		if(totalArea > 5000) {
			ranges = ranges.slice(0, i);
			break;
		}
	}
	if(ranges.length > 50) ranges = ranges.slice(0, 50);
	return ranges;
}

// fetches only unloaded tiles
function getAndFetchTiles() {
	var viewWidth = getWidth(fetchClientMargin);
	var viewHeight = getHeight(fetchClientMargin);
	var viewArea = viewWidth * viewHeight;
	if(!viewArea) return;

	var visibleRange = getVisibleTileRange(fetchClientMargin);
	var startX = visibleRange[0][0];
	var startY = visibleRange[0][1];
	var endX = visibleRange[1][0];
	var endY = visibleRange[1][1];
	var map = [];
	for(var y = startY; y <= endY; y++) {
		for(var x = startX; x <= endX; x++) {
			map.push(Tile.exists(x, y));
		}
	}
	var ranges = cullRanges(map, viewWidth, viewHeight);

	var toFetch = [];
	for(var i = 0; i < ranges.length; i++) {
		var range = ranges[i];
		var bounds = {
			minX: range[0] + startX + tileFetchOffsetX,
			minY: range[1] + startY + tileFetchOffsetY,
			maxX: range[2] + startX + tileFetchOffsetX,
			maxY: range[3] + startY + tileFetchOffsetY
		};
		toFetch.push(bounds);
		bounds.minX = clipIntMax(bounds.minX);
		bounds.minY = clipIntMax(bounds.minY);
		bounds.maxX = clipIntMax(bounds.maxX);
		bounds.maxY = clipIntMax(bounds.maxY);
		for(var y = bounds.minY; y <= bounds.maxY; y++) {
			for(var x = bounds.minX; x <= bounds.maxX; x++) {
				Tile.set(x, y, null);
			}
		}
	}
	if(toFetch.length > 0) {
		network.fetch(toFetch);
	}
}

// clears all tiles outside the viewport (to free up memory)
function clearTiles(all) {
	var coordinates;
	var visible = {};
	if(!all) {
		coordinates = getVisibleTiles();
		// reference to tile coordinates (EG: "5,6")
		visible = {};
		for(var i = 0; i < coordinates.length; i++) {
			visible[coordinates[i][1] + "," + coordinates[i][0]] = 1;
		}
	}
	for(var i in tiles) {
		if(!(i in visible) || all) {
			var pos = getPos(i);
			Tile.delete(pos[1], pos[0]);
		}
	}
}

function clearVisibleTiles() {
	var visibleRange = getVisibleTileRange(fetchClientMargin);
	var startX = visibleRange[0][0];
	var startY = visibleRange[0][1];
	var endX = visibleRange[1][0];
	var endY = visibleRange[1][1];
	for(var y = startY; y <= endY; y++) {
		for(var x = startX; x <= endX; x++) {
			Tile.delete(x, y);
		}
	}
}

function highlight(positions, unlimited) {
	for(var i = 0; i < positions.length; i++) {
		var tileX = positions[i][0];
		var tileY = positions[i][1];
		var charX = positions[i][2];
		var charY = positions[i][3];
		if(highlightCount > highlightLimit && !unlimited) return;
		if(!highlightFlash[tileY + "," + tileX]) {
			highlightFlash[tileY + "," + tileX] = {};
		}
		if(!highlightFlash[tileY + "," + tileX][charY]) {
			highlightFlash[tileY + "," + tileX][charY] = {};
		}
		if(!highlightFlash[tileY + "," + tileX][charY][charX]) {
			var r = defaultHighlightColor[0];
			var g = defaultHighlightColor[1];
			var b = defaultHighlightColor[2];
			highlightFlash[tileY + "," + tileX][charY][charX] = [getDate(), [r, g, b]];
			highlightCount++;
		}
	}
}

var flashAnimateInterval = setInterval(function() {
	if(!highlightCount) return;
	var tileGroup = {}; // tiles to re-render after highlight
	var flashDuration = 500;
	for(var tile in highlightFlash) {
		for(var charY in highlightFlash[tile]) {
			for(var charX in highlightFlash[tile][charY]) {
				var data = highlightFlash[tile][charY][charX];
				var time = data[0];
				var diff = getDate() - time;
				// after 500 milliseconds
				if(diff >= flashDuration) {
					delete highlightFlash[tile][charY][charX];
					if(!Object.keys(highlightFlash[tile][charY]).length) {
						delete highlightFlash[tile][charY];
					}
					if(!Object.keys(highlightFlash[tile]).length) {
						delete highlightFlash[tile];
					}
					highlightCount--;
				} else {
					var pos = easeOutQuad(diff, 0, 1, flashDuration);
					var r = defaultHighlightColor[0];
					var g = defaultHighlightColor[1];
					var b = defaultHighlightColor[2];
					var flashRGB = highlightFlash[tile][charY][charX][1];
					flashRGB[0] = r + (255 - r) * pos;
					flashRGB[1] = g + (255 - g) * pos;
					flashRGB[2] = b + (255 - b) * pos;
				}
				// mark tile to re-render
				tileGroup[tile] = 1;
			}
		}
	}
	// re-render tiles
	for(var i in tileGroup) {
		var pos = getPos(i);
		w.setTileRender(pos[1], pos[0]);
	}
}, 1000 / 60);

function blankTile() {
	var newTile = {
		content: new Array(tileArea).fill(" "),
		properties: {
			cell_props: {},
			writability: null,
			color: null
		}
	}
	newTile.properties.color = new Array(tileArea).fill(0);
	return newTile;
}

/*
	coloredChars format:
	{
		"tileY,tileX": {
			charY: {
				charX: colorCode,
				etc...
			},
			etc...
		},
		etc...
	}
*/

function colorChar(tileX, tileY, charX, charY, color, is_link_hovers) {
	var pos = tileY + "," + tileX + "," + charY + "," + charX;
	if(linkAuto.selected[pos] && is_link_hovers) return;
	if(!coloredChars[tileY + "," + tileX]) {
		coloredChars[tileY + "," + tileX] = {};
	}
	if(!coloredChars[tileY + "," + tileX][charY]) {
		coloredChars[tileY + "," + tileX][charY] = {};
	}
	coloredChars[tileY + "," + tileX][charY][charX] = color;
}

function uncolorChar(tileX, tileY, charX, charY) {
	var pos = tileY + "," + tileX + "," + charY + "," + charX;
	if(coloredChars[tileY + "," + tileX] && !linkAuto.selected[pos] && !tileProtectAuto.selected[pos]) {
		if(coloredChars[tileY + "," + tileX][charY]) {
			if(coloredChars[tileY + "," + tileX][charY][charX]) {
				delete coloredChars[tileY + "," + tileX][charY][charX];
			}
			if(Object.keys(coloredChars[tileY + "," + tileX][charY]).length == 0) {
				delete coloredChars[tileY + "," + tileX][charY];
			}
		}
		if(Object.keys(coloredChars[tileY + "," + tileX]).length == 0) {
			delete coloredChars[tileY + "," + tileX];
		}
	}
}

var isTileLoaded = Tile.loaded;
var isTileVisible = Tile.visible;

var brOrder = [1, 8, 2, 16, 4, 32, 64, 128];
var base64table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/*
	Writability format (tiles and chars):
		null: Writability of parent tile
		0: public
		1: members
		2: owners
*/
function decodeCharProt(str) {
	var res = new Array(tileArea).fill(0);
	var encoding = str.charAt(0);
	str = str.substr(1);
	if(encoding == "@") {
		for(var i = 0; i < str.length; i++) {
			var code = base64table.indexOf(str.charAt(i));
			var char1 = Math.trunc(code / (4*4) % 4);
			var char2 = Math.trunc(code / (4) % 4);
			var char3 = Math.trunc(code / (1) % 4);
			res[i*3 + 0] = char1;
			if(i*3 + 1 > tileArea - 1) break;
			res[i*3 + 1] = char2;
			if(i*3 + 2 > tileArea - 1) break;
			res[i*3 + 2] = char3;
		}
	} else if(encoding == "#") {
		var temp = str.split(",");
		for(var i = 0; i < temp.length; i++) {
			res[i] = parseInt(temp[i], 10);
		}
	} else if(encoding == "x") {
		for(var i = 0; i < str.length / 2; i++) {
			var code = parseInt(str.charAt(i * 2) + str.charAt(i * 2 + 1), 16);
			res[i] = code;
		}
	}
	// convert from base64-format to writability-format
	for(var c = 0; c < res.length; c++) {
		switch(res[c]) {
			case 0: res[c] = null; continue;
			case 1: res[c] = 0; continue;
			case 2: res[c] = 1; continue;
			case 3: res[c] = 2; continue;
		}
	}
	return res;
}
function encodeCharProt(array, encoding) {
	/*
		encodings:
			0: base64 - only 4 possible values
			1: number values
			2: hex values, values 0-255 only
	*/
	var arrayCom = array.slice(0);
	// convert array from writability-format to base64-format
	for(var c = 0; c < arrayCom.length; c++) {
		switch(arrayCom[c]) {
			case null: arrayCom[c] = 0; continue;
			case 0: arrayCom[c] = 1; continue;
			case 1: arrayCom[c] = 2; continue;
			case 2: arrayCom[c] = 3; continue;
		}
	}
	var str = "";
	if(!encoding) {
		str = "@";
		var bytes = Math.ceil(tileArea / 3);
		for(var i = 0; i < bytes; i++) {
			var idx = i * 3;
			var char1 = ((4*4)*arrayCom[idx + 0]);
			var char2 = ((4)*arrayCom[idx + 1]);
			var char3 = ((1)*arrayCom[idx + 2]);
			if(idx + 1 > tileArea - 1) char2 = 0;
			if(idx + 2 > tileArea - 1) char3 = 0;
			var code = char1 + char2 + char3;
			str += base64table.charAt(code);
		}
	} else if(encoding == 1) {
		str = "#" + arrayCom.join(",");
	} else if(encoding == 2) {
		str = "x";
		for(var i = 0; i < tileArea; i++) {
			var chr = arrayCom[i];
			str += chr.toString(16).padStart(2, 0).toUpperCase();
		}
	}
	return str;
}

function fillBlockChar(charCode, textRender, x, y) {
	if((charCode & 0x1FB00) != 0x1FB00 && (charCode & 0x2500) != 0x2500) return false; // symbols for legacy computing
	var transform = [0, 1]; // (left, right, up, down = 0, 1, 2, 3), percentage
	switch(charCode) { // 1/8 blocks
		case 0x2580: transform = [2, 4/8]; break;
		case 0x2581: transform = [3, 1/8]; break;
		case 0x2582: transform = [3, 2/8]; break;
		case 0x2583: transform = [3, 3/8]; break;
		case 0x2584: transform = [3, 4/8]; break;
		case 0x2585: transform = [3, 5/8]; break;
		case 0x2586: transform = [3, 6/8]; break;
		case 0x2587: transform = [3, 7/8]; break;
		case 0x2588: transform = [0, 8/8]; break;
		case 0x2589: transform = [0, 7/8]; break;
		case 0x258A: transform = [0, 6/8]; break;
		case 0x258B: transform = [0, 5/8]; break;
		case 0x258C: transform = [0, 4/8]; break;
		case 0x258D: transform = [0, 3/8]; break;
		case 0x258E: transform = [0, 2/8]; break;
		case 0x258F: transform = [0, 1/8]; break;
		case 0x2590: transform = [1, 4/8]; break;
		case 0x2594: transform = [2, 1/8]; break;
		case 0x2595: transform = [1, 1/8]; break;
		case 0x1FB82: transform = [2, 2/8]; break;
		case 0x1FB83: transform = [2, 3/8]; break;
		case 0x1FB84: transform = [2, 5/8]; break;
		case 0x1FB85: transform = [2, 6/8]; break;
		case 0x1FB86: transform = [2, 7/8]; break;
		case 0x1FB87: transform = [1, 2/8]; break;
		case 0x1FB88: transform = [1, 3/8]; break;
		case 0x1FB89: transform = [1, 5/8]; break;
		case 0x1FB8A: transform = [1, 6/8]; break;
		case 0x1FB8B: transform = [1, 7/8]; break;
		default:
			if(charCode >= 0x2596 && charCode <= 0x259F) { // 2x2 blocks
				var pattern = [2, 1, 8, 11, 9, 14, 13, 4, 6, 7][charCode - 0x2596];
				if(pattern & 8) textRender.fillRect(x, y, cellW / 2, cellH / 2);
				if(pattern & 4) textRender.fillRect(x + cellW / 2, y, cellW / 2, cellH / 2);
				if(pattern & 2) textRender.fillRect(x, y + cellH / 2, cellW / 2, cellH / 2);
				if(pattern & 1) textRender.fillRect(x + cellW / 2, y + cellH / 2, cellW / 2, cellH / 2);
				return true;
			} else if(charCode >= 0x1FB00 && charCode <= 0x1FB3B) { // 2x3 blocks
				var code = 0;
				if(charCode >= 0x1FB00 && charCode <= 0x1FB13) code = charCode - 0x1FB00 + 1;
				if(charCode >= 0x1FB14 && charCode <= 0x1FB27) code = charCode - 0x1FB00 + 2;
				if(charCode >= 0x1FB28 && charCode <= 0x1FB3B) code = charCode - 0x1FB00 + 3;
				for(var i = 0; i < 6; i++) {
					if(!(code >> i & 1)) continue;
					textRender.fillRect(x + (cellW / 2) * (i & 1), y + (cellH / 3) * (i >> 1), cellW / 2, cellH / 3);
				}
				return true;
			} else {
				return false;
			}
	}
	var dir = transform[0];
	var frac = transform[1];
	switch(dir) {
		case 0: textRender.fillRect(x, y, cellW * frac, cellH); break;
		case 1: textRender.fillRect(x + cellW - (cellW * frac), y, cellW * frac, cellH); break;
		case 2: textRender.fillRect(x, y, cellW, cellH * frac); break;
		case 3: textRender.fillRect(x, y + cellH - (cellH * frac), cellW, cellH * frac);
	}
	return true;
}

function renderChar(textRender, x, y, str, content, colors, writability, props) {
	// adjust baseline
	var textYOffset = cellH - (5 * zoom);

	var fontX = x * cellW;
	var fontY = y * cellH;

	// fill background if defined
	if(coloredChars[str] && coloredChars[str][y] && coloredChars[str][y][x]) {
		var color = coloredChars[str][y][x];
		textRender.fillStyle = color;
		textRender.fillRect(fontX, fontY, cellW, cellH);
	}

	var char = content[y * tileC + x];
	var color = colors[y * tileC + x];
	// initialize link color to default text color in case there's no link to color
	var linkColor = styles.text;
	if(textColorOverride) {
		if(writability == 0 && textColorOverride & 4) linkColor = styles.public_text;
		if(writability == 1 && textColorOverride & 2) linkColor = styles.member_text;
		if(writability == 2 && textColorOverride & 1) linkColor = styles.owner_text;
	}

	var isLink = false;

	// check if this char is a link
	if(linksRendered) {
		if(props[y]) {
			if(props[y][x]) {
				var link = props[y][x].link;
				if(link) {
					isLink = true;
					if(link.type == "url") {
						linkColor = defaultURLLinkColor;
					} else if(link.type == "coord") {
						linkColor = defaultCoordLinkColor;
					}
				}
			}
		}
	}
	if(!char) char = " ";
	var cCode = char.codePointAt(0);

	// if text has no color, use default text color. otherwise, colorize it
	if(color == 0 || !colorsEnabled || (isLink && !colorizeLinks)) {
		textRender.fillStyle = linkColor;
	} else {
		textRender.fillStyle = "rgb(" + (color >> 16 & 255) + "," + (color >> 8 & 255) + "," + (color & 255) + ")";
	}

	// x padding of text if the char width is > 10
	var XPadding = cellWidthPad * zoom;

	// underline link
	if(isLink) {
		textRender.fillRect(fontX, fontY + textYOffset + zoom, cellW, zoom);
	}

	// don't render whitespaces
	if(cCode == 0x0020 || cCode == 0x00A0) return;

	if(brBlockFill && (cCode & 0x2800) == 0x2800) { // render braille chars as rectangles
		var dimX = cellW / 2;
		var dimY = cellH / 4;
		for(var b = 0; b < 8; b++) {
			if((cCode & brOrder[b]) == 0) continue;
			textRender.fillRect(fontX + (b % 2) * dimX, fontY + ((b / 2) | 0) * dimY, dimX, dimY);
		}
	} else if(ansiBlockFill && fillBlockChar(cCode, textRender, fontX, fontY)) {
		return;
	} else { // character rendering
		if(char.length > 1 ) textRender.font = specialCharFont;
		textRender.fillText(char, Math.round(fontX + XPadding), Math.round(fontY + textYOffset));
		if(char.length > 1) textRender.font = font;
	}
}

function drawGrid(renderCtx, gridColor) {
	var offsetX = 0;
	var offsetY = 0;
	if(subgridEnabled) {
		renderCtx.strokeStyle = "#B9B9B9";
		var dashSize = Math.ceil(zoom);
		if(dashSize < 1) dashSize = 1;
		renderCtx.setLineDash([dashSize]);
		renderCtx.lineWidth = dashSize;
		for(var x = 1; x < tileC; x++) {
			for(var y = 1; y < tileR; y++) {
				renderCtx.beginPath();
				renderCtx.moveTo(0, y * cellH + 0.5);
				renderCtx.lineTo(tileW, y * cellH + 0.5);
				renderCtx.stroke();
			}
			renderCtx.beginPath();
			renderCtx.moveTo(x * cellW + 0.5, 0);
			renderCtx.lineTo(x * cellW + 0.5, tileH);
			renderCtx.stroke();
		}
	}
	renderCtx.fillStyle = gridColor;
	renderCtx.fillRect(offsetX, offsetY + tileH - zoom, tileW, zoom);
	renderCtx.fillRect(offsetX + tileW - zoom, offsetY, zoom, tileH);
}

function drawObstructedCursor(renderCtx, content, curX, curY, offsetX, offsetY) {
	var idx = curY * tileC + curX;
	// if the char is a full block, force the cursor over it.
	if(content) {
		if(content[idx] == "\u2588") {
			renderCtx.fillStyle = styles.cursor;
			renderCtx.fillRect(offsetX + curX * cellW, offsetY + curY * cellH, cellW, cellH);
		}
	}
}

function renderTileBackground(renderCtx, offsetX, offsetY, tile, tileX, tileY, cursorVisibility) {
	var computed_writability = tile.properties.writability;
	if(computed_writability == null) computed_writability = state.worldModel.writability;
	
	if(!tile.backgroundColor) {
		if(computed_writability == 0) renderCtx.fillStyle = styles.public;
		if(computed_writability == 1) renderCtx.fillStyle = styles.member;
		if(computed_writability == 2) renderCtx.fillStyle = styles.owner;
	} else {
		renderCtx.fillStyle = tile.backgroundColor;
	}
	var backColor = renderCtx.fillStyle;

	// fill tile background color
	renderCtx.fillRect(offsetX, offsetY, tileWidth, tileHeight);

	// render char protections
	if(tile.properties.char && !tile.backgroundColor) {
		for(var p = 0; p < tileArea; p++) {
			var code = tile.properties.char[p]; // writability
			var cX = p % tileC;
			var cY = Math.floor(p / tileC);
			if(code != null) {
				if(code == 0) renderCtx.fillStyle = styles.public;
				if(code == 1) renderCtx.fillStyle = styles.member;
				if(code == 2) renderCtx.fillStyle = styles.owner;
				if(cellW >= 1 && cellH >= 1) {
					// clamp to nearest axis
					var tmpCellW = tileWidth / tileC;
					var tmpCellH = tileHeight / tileR;
					var sx = Math.floor(cX * tmpCellW);
					var sy = Math.floor(cY * tmpCellH);
					var x2 = Math.floor((cX + 1) * tmpCellW);
					var y2 = Math.floor((cY + 1) * tmpCellH);
					renderCtx.fillRect(offsetX + sx, offsetY + sy, x2 - sx, y2 - sy);
				} else {
					renderCtx.fillRect(offsetX + cX * cellW, offsetY + cY * cellH, cellW, cellH);
				}
			}
		}
	}

	if(guestCursorsEnabled) {
		renderGuestCursors(renderCtx, offsetX, offsetY, tile, tileX, tileY);
	}

	// render cursor
	if(cursorVisibility) {
		var charX = cursorCoords[2];
		var charY = cursorCoords[3];
		renderCtx.fillStyle = styles.cursor;
		renderCtx.fillRect(offsetX + charX * cellW, offsetY + charY * cellH, cellW, cellH);
	}

	var highlight = highlightFlash[tileY + "," + tileX];
	if(highlight) { // highlighted edits
		for(var y = 0; y < tileR; y++) {
			for(var x = 0; x < tileC; x++) {
				if(highlight[y]) {
					if(highlight[y][x] !== void 0) {
						var flashRGB = highlight[y][x][1];
						renderCtx.fillStyle = "rgb(" + flashRGB[0] + "," + flashRGB[1] + "," + flashRGB[2] + ")";
						renderCtx.fillRect(offsetX + x * cellW, offsetY + y * cellH, cellW, cellH);
					}
				}
			}
		}
	}
	return backColor;
}

function renderTileBackgroundImage(renderCtx, tileX, tileY) {
	var startX = tileX * tileW;
	var startY = tileY * tileH;
	var backRatioW = tileWidth / dTileW;
	var backRatioH = tileHeight / dTileH;

	var imgWidth = backgroundPatternSize[0];
	var imgHeight = backgroundPatternSize[1];

	var repeat = w.backgroundInfo.rmod;
	var offX = w.backgroundInfo.x;
	var offY = w.backgroundInfo.y;
	var patWidth = w.backgroundInfo.w;
	var patHeight = w.backgroundInfo.h;
	var alpha = w.backgroundInfo.alpha;

	if(!patWidth) patWidth = imgWidth;
	if(!patHeight) patHeight = imgHeight;

	startX += offX * backRatioW;
	startY += offY * backRatioH;

	backRatioW *= patWidth / imgWidth;
	backRatioH *= patHeight / imgHeight;

	/*
		0: repeat
		1: center
		2: singular
	*/
	if(repeat == 0) {
		if(!window.DOMMatrix || !backgroundPattern) return false;
		backgroundPattern.setTransform(new DOMMatrix([backRatioW, 0, 0, backRatioH, -startX, -startY]));
		renderCtx.fillStyle = backgroundPattern;
		renderCtx.globalAlpha = alpha;
		renderCtx.fillRect(0, 0, tileWidth, tileHeight);
		renderCtx.globalAlpha = 1;
		return true;
	} else if(repeat == 1 || repeat == 2) {
		if(!backgroundImage) return false;
		if(repeat == 1) {
			startX += Math.floor(imgWidth / 2) * backRatioW;
			startY += Math.floor(imgHeight / 2) * backRatioH;
		}
		renderCtx.globalAlpha = alpha;
		renderCtx.drawImage(backgroundImage, -startX, -startY, imgWidth * backRatioW, imgHeight * backRatioH);
		renderCtx.globalAlpha = 1;
		return true;
	}
	return false;
}

function clearTile(tileX, tileY) {
	if(!Tile.visible(tileX, tileY)) return;
	var tileScreenPos = getTileScreenPosition(tileX, tileY);
	var offsetX = Math.floor(tileScreenPos[0]);
	var offsetY = Math.floor(tileScreenPos[1]);
	owotCtx.clearRect(offsetX, offsetY, tileWidth, tileHeight);
}

function renderTile(tileX, tileY, redraw) {
	if(!Tile.loaded(tileX, tileY)) return;
	var str = tileY + "," + tileX;
	var tileScreenPos = getTileScreenPosition(tileX, tileY);
	var offsetX = Math.floor(tileScreenPos[0]);
	var offsetY = Math.floor(tileScreenPos[1]);

	var tile = Tile.get(tileX, tileY);
	if(redraw) {
		tile.redraw = true;
	}
	if(!Tile.visible(tileX, tileY)) return;

	var writability = tile.properties.writability;
	var cursorVisibility = cursorRenderingEnabled && cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY;

	var gridColor = "#000000";
	if(transparentBackground) {
		var backColor = renderTileBackground(owotCtx, offsetX, offsetY, tile, tileX, tileY, cursorVisibility);
		if(gridEnabled) {
			gridColor = int_to_hexcode(0xFFFFFF - resolveColorValue(backColor));
		}
	} else {
		var backgroundUpdated = false;
		var hasHighlightFlash = highlightFlash[tileY + "," + tileX];
		if(hasHighlightFlash) {
			backgroundUpdated = true;
			tile.tp_highlight = true;
		} else {
			if(tile.tp_highlight) {
				backgroundUpdated = true;
				delete tile.tp_highlight;
			}
		}
		if(cursorVisibility) {
			backgroundUpdated = true;
			tile.tp_cursor = true;
		} else if(tile.tp_cursor) {
			backgroundUpdated = true;
			delete tile.tp_cursor;
		}
		if(backgroundUpdated) {
			tile.redraw = true;
		}
	}

	// render text data from cache
	var tilePool = loadTileFromPool(tileX, tileY, true);
	if(tilePool && !tile.redraw) {
		var pCanv = tilePool.pool.canv;
		var pX = tilePool.poolX;
		var pY = tilePool.poolY;
		owotCtx.drawImage(pCanv, pX, pY, tileWidth, tileHeight, offsetX, offsetY, tileWidth, tileHeight);
		if(w.events.tilerendered) w.emit("tileRendered", {
			tileX: tileX, tileY: tileY,
			startX: offsetX, startY: offsetY,
			endX: offsetX + tileWidth - 1, endY: offsetY + tileHeight - 1
		});
		if(unobstructCursor && cursorRenderingEnabled && cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
			drawObstructedCursor(owotCtx, tile.content, cursorCoords[2], cursorCoords[3], offsetX, offsetY);
		}
		return;
	}
	if(tile.redraw) {
		delete tile.redraw;
	}

	tilePool = loadTileFromPool(tileX, tileY);
	var poolCtx = tilePool.pool.ctx;
	var poolCanv = tilePool.pool.canv;
	var poolX = tilePool.poolX;
	var poolY = tilePool.poolY;

	if(transparentBackground) {
		textRenderCtx.clearRect(0, 0, tileWidth, tileHeight);
	} else {
		renderTileBackground(textRenderCtx, 0, 0, tile, tileX, tileY, cursorVisibility);
	}

	if(backgroundEnabled) {
		renderTileBackgroundImage(textRenderCtx, tileX, tileY);
	}

	// temp compat
	if(typeof tile.content == "string") {
		tile.content = w.split(tile.content);
	}

	var content = tile.content;
	var colors = tile.properties.color;
	// color data doesn't exist, use empty array as placeholder
	if(!colors) colors = new Array(tileArea).fill(0);

	var props = tile.properties.cell_props;
	if(!props) props = {};

	if(priorityOverwriteChar && tile.properties.char) {
		for(var lev = 0; lev < 3; lev++) {
			for(var c = 0; c < tileArea; c++) {
				var code = tile.properties.char[c]; // writability
				if(code == null) code = tile.properties.writability;
				if(code == null) code = state.worldModel.writability;
				if(code != lev) continue;
				var cX = c % tileC;
				var cY = Math.floor(c / tileC);
				textRenderCtx.clearRect(cX * cellW, cY * cellH, cellW, cellH);
				renderChar(textRenderCtx, cX, cY, str, content, colors, code, props);
			}
		}
	} else {
		for(var y = 0; y < tileR; y++) {
			for(var x = 0; x < tileC; x++) {
				var protValue = writability;
				if(tile.properties.char) {
					protValue = tile.properties.char[y * tileC + x];
				}
				if(protValue == null) protValue = tile.properties.writability;
				if(protValue == null) protValue = state.worldModel.writability;
				renderChar(textRenderCtx, x, y, str, content, colors, protValue, props);
			}
		}
	}

	if(gridEnabled) {
		drawGrid(textRenderCtx, gridColor);
	}

	// add image to tile pool
	poolCtx.clearRect(poolX, poolY, tileWidth, tileHeight);
	poolCtx.drawImage(textRenderCanvas, poolX, poolY);

	// add image to main canvas
	owotCtx.drawImage(textRenderCanvas, offsetX, offsetY);

	if(unobstructCursor && cursorRenderingEnabled && cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
		drawObstructedCursor(owotCtx, tile.content, cursorCoords[2], cursorCoords[3], offsetX, offsetY);
	}

	if(w.events.tilerendered) w.emit("tileRendered", {
		tileX: tileX, tileY: tileY,
		startX: offsetX, startY: offsetY,
		endX: offsetX + tileWidth - 1, endY: offsetY + tileHeight - 1
	});
}

function renderTiles(redraw) {
	w.emit("beforeTilesRendered");
	updateCoordDisplay();
	if(unloadedPatternPanning) {
		elm.owot.style.backgroundPosition = positionX + "px " + positionY + "px";
	}
	var optShifted = false;
	var canOptimizeShift = shiftOptimization && zoom <= 0.5 && shiftOptState.zoom == zoom;
	if(!canOptimizeShift) {
		owotCtx.clearRect(0, 0, owotWidth, owotHeight);
	} else {
		owotCtx.drawImage(owot, Math.floor(positionX) - shiftOptState.prevX, Math.floor(positionY) - shiftOptState.prevY);
		optShifted = true;
	}
	if(redraw) w.setRedraw();
	// render all visible tiles
	var visibleRange = getVisibleTileRange();
	var startX = visibleRange[0][0];
	var startY = visibleRange[0][1];
	var endX = visibleRange[1][0];
	var endY = visibleRange[1][1];
	for(var y = startY; y <= endY; y++) {
		for(var x = startX; x <= endX; x++) {
			var tile = Tile.get(x, y);
			var shouldRender = false;
			if(tile) {
				shouldRender = tile.redraw || tile.rerender;
			}
			if(optShifted && !shouldRender) {
				if(!(shiftOptState.x1 < x && x < shiftOptState.x2 && shiftOptState.y1 < y && y < shiftOptState.y2)) {
					renderTile(x, y);
				}
			} else {
				renderTile(x, y);
			}
			if(optShifted && !Tile.loaded(x, y)) {
				clearTile(x, y);
			}
		}
	}
	if(shiftOptimization) {
		shiftOptState.prevX = Math.floor(positionX);
		shiftOptState.prevY = Math.floor(positionY);
		shiftOptState.x1 = startX;
		shiftOptState.y1 = startY;
		shiftOptState.x2 = endX;
		shiftOptState.y2 = endY;
		shiftOptState.zoom = zoom;
	}
	w.emit("tilesRendered");
}

// re-render only tiles that have changed to the screen
function renderTilesSelective() {
	var visibleRange = getVisibleTileRange();
	var startX = visibleRange[0][0];
	var startY = visibleRange[0][1];
	var endX = visibleRange[1][0];
	var endY = visibleRange[1][1];
	for(var y = startY; y <= endY; y++) {
		for(var x = startX; x <= endX; x++) {
			var tile = Tile.get(x, y);
			if(!tile) continue;
			if(tile.rerender) {
				delete tile.rerender;
				renderTile(x, y);
				continue;
			}
			if(!tile.redraw) continue;
			renderTile(x, y);
		}
	}
}

function renderGuestCursors(renderCtx, offsetX, offsetY, tile, tileX, tileY) {
	var tilePos = tileY + "," + tileX;
	var list = guestCursorsByTile[tilePos];
	for(var channel in list) {
		var cursor = list[channel];
		var charX = cursor.charX;
		var charY = cursor.charY;
		renderCtx.fillStyle = styles.guestCursor;
		renderCtx.fillRect(offsetX + charX * cellW, offsetY + charY * cellH, cellW, cellH);
	}
}

function clearAllGuestCursors() {
	for(var i in guestCursorsByTile) {
		var pos = i.split(",");
		var tileX = parseInt(pos[1]);
		var tileY = parseInt(pos[0]);
		for(var x in guestCursorsByTile[i]) {
			delete guestCursors[x];
			delete guestCursorsByTile[i][x];
		}
		w.setTileRedraw(tileX, tileY);
	}
}

function renderLoop() {
	if(w.hasUpdated) {
		renderTiles();
		updateHoveredLink(null, null, null, true);
	} else if(w.hasSelectiveUpdated) {
		renderTilesSelective();
	}
	w.emit("frame"); // emitted before update flags are reset
	w.hasUpdated = false;
	w.hasSelectiveUpdated = false;
	if(!writeBuffer.length) sendCursorPosition();
	requestAnimationFrame(renderLoop);
}

function protectPrecisionOption(option) {
	protectPrecision = option;
	removeTileProtectHighlight();
	var tileChoiceColor = "";
	var charChoiceColor = "";
	if(option == 0) { // tile
		tileChoiceColor = "#FF6600";
	} else if(option == 1) { // char
		charChoiceColor = "#FF6600";
	}
	elm.tile_choice.style.backgroundColor = tileChoiceColor;
	elm.char_choice.style.backgroundColor = charChoiceColor;
}
protectPrecisionOption(protectPrecision);

var menu;
function buildMenu() {
	menu = new Menu(elm.menu_elm, elm.nav_elm);
	w.menu = menu;
	var homeLink = document.createElement("a");
	var homeLinkIcon = document.createElement("img");
	var subgridEntry;
	homeLink.href = "/home";
	homeLink.target = "_blank";
	homeLink.innerHTML = "More...&nbsp";
	homeLinkIcon.src = "/static/external_link.png";
	homeLink.appendChild(homeLinkIcon);
	menu.addEntry(homeLink);
	menu.addCheckboxOption("Show coordinates", function() {
		return elm.coords.style.display = "";
	}, function() {
		return elm.coords.style.display = "none";
	});
	if(Permissions.can_color_text(state.userModel, state.worldModel)) {
		menu.addOption("Change color", w.color);
	}
	if (Permissions.can_go_to_coord(state.userModel, state.worldModel)) {
		menu.addOption("Go to coordinates", w.goToCoord);
	}
	if (Permissions.can_coordlink(state.userModel, state.worldModel)) {
		menu.addOption("Create link to coordinates", w.coordLink);
	}
	if (Permissions.can_urllink(state.userModel, state.worldModel)) {
		menu.addOption("Create link to URL", w.urlLink);
	}
	if (Permissions.can_admin(state.userModel, state.worldModel)) {
		menu.addOption("Make an area owner-only", function() {
			return w.doProtect("owner-only");
		});
	}
	if (Permissions.can_protect_tiles(state.userModel, state.worldModel)) {
		menu.addOption("Make an area member-only", function() {
			return w.doProtect("member-only");
		});
		menu.addOption("Make an area public", function() {
			return w.doProtect("public");
		});
		menu.addOption("Default area protection", w.doUnprotect);
	}
	menu.addCheckboxOption("Toggle grid", function() {
		gridEnabled = true;
		w.render(true);
		menu.showEntry(subgridEntry);
	}, function() {
		gridEnabled = false;
		w.render(true);
		menu.hideEntry(subgridEntry);
	});
	subgridEntry = menu.addCheckboxOption("Subgrid", function() {
		subgridEnabled = true;
		w.render(true);
	}, function() {
		subgridEnabled = false;
		w.render(true);
	});
	menu.hideEntry(subgridEntry);
	menu.addCheckboxOption("Links enabled", function() {
		linksEnabled = true;
	}, function() {
		linksEnabled = false;
	}, true);
	menu.addCheckboxOption("Colors enabled", function() {
		w.enableColors();
	}, function() {
		w.disableColors();
	}, true);
	if(state.background) {
		menu.addCheckboxOption("Background", function() {
			backgroundEnabled = true;
			w.render(true);
		}, function() {
			backgroundEnabled = false;
			w.render(true);
		}, true);
	}
	var zoomBar = document.createElement("input");
	zoomBar.onchange = function() {
		var val = this.value;
		val /= 100;
		if(val < 0 || val > 1) val = 0.5;
		val = toLogZoom(val);
		changeZoom(val * 100);
	}
	zoomBar.ondblclick = function() {
		changeZoom(100);
	}
	zoomBar.title = "Zoom";
	zoomBar.type = "range";
	zoomBar.value = 50;
	zoomBar.min = 1;
	zoomBar.max = 100;
	zoomBar.id = "zoombar";
	var zoombarId = menu.addEntry(zoomBar);
	menu.zoombarId = zoombarId;
}

var regionSelections = [];
function regionSelectionsActive() {
	for(var i = 0; i < regionSelections.length; i++) {
		if(regionSelections[i].isSelecting) return true;
	}
	return false;
}
function RegionSelection() {
	this.selection = null;
	this.regionSelected = false;
	this.regionCoordA = null;
	this.regionCoordB = null;
	this.isSelecting = false;
	this.charColor = "#9999e6";
	this.color = "rgba(0, 0, 255, 0.1)";
	this.tiled = false;
	this.lastSelectionHover = null; // [tileX, tileY, charX, charY]
	this.init = function() {
		var div = document.createElement("div");
		div.className = "region_selection";
		div.style.display = "none";
		div.style.backgroundColor = this.color;
		document.body.appendChild(div);
		this.selection = div;
	}
	this.setSelection = function(start, end) {
		var coordA = start.slice(0);
		var coordB = end.slice(0);
		orderRangeABCoords(coordA, coordB);
		var tileX1 = coordA[0];
		var tileY1 = coordA[1];
		var charX1 = coordA[2];
		var charY1 = coordA[3];
		var tileX2 = coordB[0];
		var tileY2 = coordB[1];
		var charX2 = coordB[2];
		var charY2 = coordB[3];
		if(this.tiled) {
			charX1 = 0;
			charY1 = 0;
			charX2 = tileC - 1;
			charY2 = tileR - 1;
		}
		var pxCoordA = tileAndCharsToWindowCoords(tileX1, tileY1, charX1, charY1);
		var pxCoordB = tileAndCharsToWindowCoords(tileX2, tileY2, charX2, charY2);
		var regWidth = pxCoordB[0] - pxCoordA[0] + Math.trunc(cellW / zoomRatio) - 2;
		var regHeight = pxCoordB[1] - pxCoordA[1] + Math.trunc(cellH / zoomRatio) - 2;
		var sel = this.selection;
		sel.style.width = regWidth + "px";
		sel.style.height = regHeight + "px";
		sel.style.top = pxCoordA[1] + "px";
		sel.style.left = pxCoordA[0] + "px";
	}
	this.show = function() {
		this.selection.style.display = "";
	}
	this.hide = function() {
		this.selection.style.display = "none";
	}
	this.deselect = function() {
		this.regionSelected = false;
		this.regionCoordA = null;
		this.regionCoordB = null;
		this.hide();
	}
	this.stopSelectionUI = function() {
		if(!this.lastSelectionHover) return;
		if(!this.isSelecting) return;
		this.isSelecting = false;
		elm.owot.style.cursor = defaultCursor;
		var tileX = this.lastSelectionHover[0];
		var tileY = this.lastSelectionHover[1];
		var charX = this.lastSelectionHover[2];
		var charY = this.lastSelectionHover[3];
		// remove highlight
		if(this.tiled) {
			if(Tile.get(tileX, tileY)) {
				Tile.get(tileX, tileY).backgroundColor = "";
			}
		} else {
			uncolorChar(tileX, tileY, charX, charY);
		}
		w.setTileRedraw(tileX, tileY);
		this.deselect();
	}
	var onselectionEvents = [];
	this.onselection = function(func) {
		onselectionEvents.push(func);
	}
	this.handleSelection = function() {
		for(var i = 0; i < onselectionEvents.length; i++) {
			var func = onselectionEvents[i];
			this.regionSelected = true;
			this.setSelection(this.regionCoordA, this.regionCoordB);
			var coordA = this.regionCoordA.slice(0);
			var coordB = this.regionCoordB.slice(0);
			orderRangeABCoords(coordA, coordB);
			var regWidth = (coordB[0] - coordA[0]) * tileC + coordB[2] - coordA[2] + 1;
			var regHeight = (coordB[1] - coordA[1]) * tileR + coordB[3] - coordA[3] + 1;
			func(coordA, coordB, regWidth, regHeight);
		}
	}
	this.startSelection = function() {
		this.isSelecting = true;
		elm.owot.style.cursor = "cell";
	}
	regionSelections.push(this);
	this.destroy = function() {
		for(var i = 0; i < regionSelections.length; i++) {
			if(regionSelections[i] == this) {
				regionSelections.splice(i, 1);
				i--;
			}
		}
	}
	return this;
}

w.on("tilesRendered", function() {
	for(var i = 0; i < regionSelections.length; i++) {
		var reg = regionSelections[i];
		if(reg.regionCoordA && reg.regionCoordB) reg.setSelection(reg.regionCoordA, reg.regionCoordB);
	}
});

w.on("cursorMove", function(pos) {
	setClientGuestCursorPosition(pos.tileX, pos.tileY, pos.charX, pos.charY);
});

w.on("cursorHide", function() {
	setClientGuestCursorPosition(0, 0, 0, 0, true);
});

function setClientGuestCursorPosition(tileX, tileY, charX, charY, hidden) {
	var pos = clientGuestCursorPos;
	var pTileX = pos.tileX;
	var pTileY = pos.tileY;
	var pCharX = pos.charX;
	var pCharY = pos.charY;
	var pHidden = pos.hidden;
	if(tileX == pTileX && tileY == pTileY && charX == pCharX && charY == pCharY && pHidden == hidden) return;
	clientGuestCursorPos = {
		tileX: tileX,
		tileY: tileY,
		charX: charX,
		charY: charY,
		hidden: hidden,
		updated: true
	};
}

function sendCursorPosition() {
	if(!showMyGuestCursor) return;
	if(!Permissions.can_show_cursor(state.userModel, state.worldModel)) return;
	if(!w.socket) return;
	if(w.socket.socket.url.startsWith("wss://www.yourworldoftext.com/")) return;
	var pos = clientGuestCursorPos;
	if(!pos.updated) return;
	pos.updated = false;
	network.cursor(pos.tileX, pos.tileY, pos.charX, pos.charY, pos.hidden);
}

var networkHTTP = {
	fetch: function(x1, y1, x2, y2, opts, callback) {
		if(typeof opts == "function") {
			callback = opts;
		} else if(!opts) {
			opts = {};
		}
		var temp;
		if(x1 > x2) {
			temp = x1;
			x1 = x2;
			x2 = temp;
		}
		if(y1 > y2) {
			temp = y1;
			y1 = y2;
			y2 = temp;
		}
		var data = {
			fetch: 1,
			min_tileX: x1,
			min_tileY: y1,
			max_tileX: x2,
			max_tileY: y2
		};
		if(opts.utf16) data.utf16 = true;
		if(opts.array) data.array = true;
		if(opts.content_only) data.content_only = true;
		if(opts.concat) data.concat = true;
		ajaxRequest({
			type: "GET",
			url: window.location.pathname,
			data: data,
			done: function(data) {
				if(callback) callback(JSON.parse(data));
			},
			error: function() {
				if(callback) callback(null);
			}
		});
	},
	write: function(edits, opts, callback) {
		if(typeof opts == "function") {
			callback = opts;
		} else if(!opts) {
			opts = {};
		}
		var data = {
			edits: JSON.stringify(edits)
		};
		if(opts.public_only) data.public_only = true;
		if(opts.preserve_links) data.preserve_links = true;
		ajaxRequest({
			type: "POST",
			url: window.location.pathname,
			data: data,
			done: function(data) {
				if(callback) callback(JSON.parse(data));
			},
			error: function() {
				if(callback) callback(null);
			}
		});
	},
	urllink: function(tileX, tileY, charX, charY, url, callback) {
		ajaxRequest({
			type: "POST",
			url: "/ajax/urllink/",
			data: {
				world: state.worldModel.name,
				tileX: tileX,
				tileY: tileY,
				charX: charX,
				charY: charY,
				url: url
			},
			done: function(data) {
				if(callback) callback(data);
			},
			error: function() {
				if(callback) callback(null);
			}
		});
	},
	coordlink: function(tileX, tileY, charX, charY, link_tileX, link_tileY, callback) {
		ajaxRequest({
			type: "POST",
			url: "/ajax/coordlink/",
			data: {
				world: state.worldModel.name,
				tileX: tileX,
				tileY: tileY,
				charX: charX,
				charY: charY,
				link_tileX: link_tileX,
				link_tileY: link_tileY
			},
			done: function(data) {
				if(callback) callback(data);
			},
			error: function() {
				if(callback) callback(null);
			}
		});
	},
	protect: function(tileX, tileY, type, callback) {
		// type: unprotect, public, member-only, owner-only
		var data = {
			world: state.worldModel.name,
			tileX: tileX,
			tileY: tileY
		};
		var url = "/ajax/protect/";
		if(type == "unprotect") {
			url = "/ajax/unprotect/";
		} else {
			data.type = type;
		}
		ajaxRequest({
			type: "POST",
			url: url,
			data: data,
			done: function(data) {
				if(callback) callback(data);
			},
			error: function() {
				if(callback) callback(null);
			}
		});
	},
	protectchar: function(tileX, tileY, charX, charY, type, callback) {
		// type: unprotect, public, member-only, owner-only
		var data = {
			world: state.worldModel.name,
			tileX: tileX,
			tileY: tileY,
			charX: charX,
			charY: charY
		};
		var url = "/ajax/protect/char/";
		if(type == "unprotect") {
			url = "/ajax/unprotect/char/";
		} else {
			data.type = type;
		}
		ajaxRequest({
			type: "POST",
			url: url,
			data: data,
			done: function(data) {
				if(callback) callback(data);
			},
			error: function() {
				if(callback) callback(null);
			}
		});
	}
};

var network = {
	latestID: 0,
	callbacks: {},
	http: networkHTTP,
	protect: function(position, type) {
		// position: {tileX, tileY, [charX, charY]}
		// type: <unprotect, public, member-only, owner-only>
		var isPrecise = "charX" in position && "charY" in position;
		var data = {
			tileX: position.tileX,
			tileY: position.tileY,
			type: type == "unprotect" ? void 0 : type
		};
		if(isPrecise) {
			data.charX = position.charX;
			data.charY = position.charY;
			if(!("tileX" in position || "tileY" in position)) {
				data.tileX = Math.floor(data.charX / tileC);
				data.tileY = Math.floor(data.charY / tileR);
				data.charX = data.charX - Math.floor(data.charX / tileC) * tileC;
				data.charY = data.charY - Math.floor(data.charY / tileR) * tileR;
			}
			data.precise = true;
		}
		var protReq = {
			kind: "protect",
			data: data,
			action: type == "unprotect" ? type : "protect"
		};
		w.socket.send(JSON.stringify(protReq));
	},
	link: function(position, type, args) {
		// position: {tileX, tileY, charX, charY}
		// type: <url, coord>
		// args: {url} or {x, y}
		var data = {
			tileY: position.tileY,
			tileX: position.tileX,
			charY: position.charY,
			charX: position.charX
		};
		if(!("tileX" in position || "tileY" in position)) {
			data.tileX = Math.floor(data.charX / tileC);
			data.tileY = Math.floor(data.charY / tileR);
			data.charX = data.charX - Math.floor(data.charX / tileC) * tileC;
			data.charY = data.charY - Math.floor(data.charY / tileR) * tileR;
		}
		if(type == "url") {
			data.url = args.url;
		} else if(type == "coord") {
			data.link_tileX = args.x;
			data.link_tileY = args.y;
		}
		w.socket.send(JSON.stringify({
			kind: "link",
			data: data,
			type: type
		}));
	},
	cmd: function(data, include_username) {
		w.socket.send(JSON.stringify({
			kind: "cmd",
			data: data, // maximum length of 2048
			include_username: include_username
		}));
	},
	cmd_opt: function() {
		w.socket.send(JSON.stringify({
			kind: "cmd_opt"
		}));
	},
	write: function(edits, opts, callback) {
		if(!opts) opts = {};
		var writeReq = {
			kind: "write",
			edits: edits,
			public_only: opts.public_only,
			preserve_links: opts.preserve_links
		};
		if(callback) {
			var id = network.latestID;
			writeReq.request = id;
			network.callbacks[id] = callback;
		}
		w.socket.send(JSON.stringify(writeReq));
	},
	chathistory: function() {
		w.socket.send(JSON.stringify({
			kind: "chathistory"
		}));
	},
	fetch: function(fetches, opts, callback) {
		// fetches: [{minX: <x1>, minY: <y1>, maxX: <x2>, maxY: <y2>}...]
		if(!opts) opts = {};
		if(typeof fetches == "object" && !Array.isArray(fetches)) fetches = [fetches];
		var fetchReq = {
			fetchRectangles: fetches,
			kind: "fetch",
			utf16: opts.utf16,
			array: opts.array,
			content_only: opts.content_only,
			concat: opts.concat
		};
		if(callback) {
			var id = network.latestID;
			fetchReq.request = id;
			network.callbacks[id] = callback;
		}
		w.socket.send(JSON.stringify(fetchReq));
	},
	chat: function(message, location, nickname, color) {
		w.socket.send(JSON.stringify({
			kind: "chat",
			nickname: nickname,
			message: message,
			location: location,
			color: color
		}));
	},
	ping: function(returnTime) {
		var str = "2::";
		if(returnTime) str += "@";
		w.socket.send(str);
	},
	clear_tile: function(x, y) {
		w.socket.send(JSON.stringify({
			kind: "clear_tile",
			tileX: x,
			tileY: y
		}));
	},
	cursor: function(tileX, tileY, charX, charY, hidden) {
		var data = {
			kind: "cursor"
		};
		if(hidden) {
			data.hidden = true;
		} else {
			data.position = {
				tileX: tileX,
				tileY: tileY,
				charX: charX,
				charY: charY
			}
		}
		w.socket.send(JSON.stringify(data));
	}
};

// [tileX, tileY, charX, charY]
var lastLinkHover = null;
// [type, tileX, tileY, (charX, charY)]
var lastTileHover = null;

Object.assign(w, {
	tiles: tiles,
	periodDeletedTiles: 0,
	hasUpdated: true,
	hasSelectiveUpdated: false,
	userCount: -1,
	clientId: -1,
	net: network,
	isLinking: false,
	isProtecting: false,
	url_input: "",
	coord_input_x: 0,
	coord_input_y: 0,
	link_input_type: 0, // 0 = link, 1 = coord,
	protect_type: null, // null = unprotect, 0 = public, 1 = member, 2 = owner
	protect_bg: "",
	nightMode: 0, // 0 = normal, 1 = night, 2 = night with normal background patterns
	input: elm.textInput,
	menu: null,
	_state: state,
	_ui: {
		announce: elm.announce,
		announce_text: elm.announce_text,
		announce_close: elm.announce_close,
		coordinateInputModal: new CoordinateInputModal(),
		urlInputModal: new URLInputModal(),
		colorInputModal: new ColorInputModal(),
		selectionModal: new SelectionModal()
	},
	styles: styles,
	backgroundInfo: {
		x: 0,
		y: 0,
		w: 0,
		h: 0,
		rmod: 0,
		alpha: 1
	},
	tile: {
		count: 0,
		set: Tile.set,
		delete: Tile.delete,
		get: Tile.get,
		cache: tiles,
		exists: Tile.exists,
		loaded: Tile.loaded,
		visible: Tile.visible
	},
	doAnnounce: function(text) {
		if(text) {
			w._ui.announce_text.innerHTML = text;
			w._ui.announce.style.display = "";
		} else {
			w._ui.announce.style.display = "none";
		}
	},
	regionSelect: new RegionSelection(),
	color: function() {
		w._ui.colorInputModal.open(function(color) {
			var this_color = 0;
			if(color) {
				this_color = parseInt(color, 16);
			}
			if(!this_color) {
				this_color = 0;
			}
			w.changeColor(this_color);
			localStorage.setItem("color", this_color);
		});
	},
	goToCoord: function() {
		w._ui.coordinateInputModal.open("Go to coordinates:", w.doGoToCoord.bind(w));
	},
	doGoToCoord: function(y, x) {
		var maxX = Number.MAX_SAFE_INTEGER / 160 / 4;
		var maxY = Number.MAX_SAFE_INTEGER / 144 / 4;
		if(x > maxX || x < -maxX || y > maxY || y < -maxY) {
			return;
		}
		positionX = Math.floor(-x * tileW * coordSizeX);
		positionY = Math.floor(y * tileH * coordSizeY);
		w.render();
	},
	doUrlLink: function(url) {
		linkAuto.active = true;
		linkAuto.mode = 0;
		linkAuto.url = url;

		if(w.isLinking || w.isProtecting) return;
		w.url_input = url;
		elm.owot.style.cursor = "pointer";
		w.isLinking = true;
		w.link_input_type = 0;
	},
	urlLink: function() {
		w._ui.urlInputModal.open(w.doUrlLink.bind(w));
	},
	doCoordLink: function(y, x) {
		linkAuto.active = true;
		linkAuto.mode = 1;
		linkAuto.coordTileY = y;
		linkAuto.coordTileX = x;

		if(w.isLinking || w.isProtecting) return;
		w.coord_input_x = x;
		w.coord_input_y = y;
		elm.owot.style.cursor = "pointer";
		w.isLinking = true;
		w.link_input_type = 1;
	},
	coordLink: function() {
		w._ui.coordinateInputModal.open("Enter the coordinates to create a link to. You can then click on a letter to create the link.", w.doCoordLink.bind(w));
	},
	doProtect: function(protectType, unprotect) {
		// show the protection precision menu
		elm.protect_precision.style.display = "";
		tileProtectAuto.active = true;
		if(unprotect) { // default area protection
			tileProtectAuto.mode = 3;
		} else {
			if(protectType == "owner-only") tileProtectAuto.mode = 0;
			if(protectType == "member-only") tileProtectAuto.mode = 1;
			if(protectType == "public") tileProtectAuto.mode = 2;
		}

		if(w.isLinking || w.isProtecting) return;
		elm.owot.style.cursor = "pointer";
		w.protect_bg = {
			"owner-only": "#ddd",
			"member-only": "#eee",
			"public": "#fff"
		}[protectType];
		w.isProtecting = true;
		if(unprotect) {
			w.protect_type = null;
		} else if(protectType == "owner-only") {
			w.protect_type = 2;
		} else if(protectType == "member-only") {
			w.protect_type = 1;
		} else if(protectType == "public") {
			w.protect_type = 0;
		}
	},
	doUnprotect: function() {
		w.doProtect("public", true);
	},
	typeChar: writeChar,
	getChar: getChar,
	socketChannel: null,
	moveCursor: moveCursor,
	fetchUnloadedTiles: getAndFetchTiles,
	acceptOwnEdits: false,
	receivingBroadcasts: false,
	getTileVisibility: function() {
		var minVisY = (-positionY - Math.trunc(owotHeight / 2)) / tileH;
		var minVisX = (-positionX - Math.trunc(owotWidth / 2)) / tileW;
		var numDown = owotHeight / tileH;
		var numAcross = owotWidth / tileW;
		var maxVisY = minVisY + numDown;
		var maxVisX = minVisX + numAcross;
		var centerY = minVisY + numDown / 2;
		var centerX = minVisX + numAcross / 2;
		return {
			minVisY: minVisY,
			minVisX: minVisX,
			numDown: numDown,
			numAcross: numAcross,
			maxVisY: maxVisY,
			maxVisX: maxVisX,
			centerY: centerY,
			centerX: centerX
		};
	},
	getCenterCoords: function() { // [y, x]
		return [-positionY / tileH, -positionX / tileW];
	},
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
		var jqueryURL = "/static/lib/jquery-1.7.min.js";
		w.loadScript(jqueryURL, callback);
	},
	redraw: function() {
		renderTiles(true);
	},
	reloadRenderer: function() {
		reloadRenderer();
	},
	setRedraw: function() {
		for(var t in tiles) {
			if(!tiles[t]) continue;
			tiles[t].redraw = true;
		}
	},
	setTileRedraw: function(tileX, tileY) {
		var tile = Tile.get(tileX, tileY);
		if(!tile) return;
		w.hasSelectiveUpdated = true;
		tile.redraw = true;
	},
	setTileRender: function(tileX, tileY) {
		// render tile again on main canvas on next render loop
		var tile = Tile.get(tileX, tileY);
		if(!tile) return;
		w.hasSelectiveUpdated = true;
		tile.rerender = true;
	},
	setTransparency: function(transparent) {
		if(transparent) {
			transparentBackground = true;
			setupTextRenderCtx();
		} else {
			transparentBackground = false;
			setupTextRenderCtx();
		}
		updateScaleConsts();
		w.redraw();
	},
	render: function(redraw) {
		if(redraw) w.setRedraw();
		w.hasUpdated = true;
	},
	changeFont: function(fontData) {
		// change the global font
		fontTemplate = fontData;
		font = fontTemplate.replace("$", normFontSize(16 * zoom));
		textRenderCtx.font = font;
		w.redraw();
	},
	fixFonts: function() {
		var fnt_main = new FontFace("suppl_cour", "url('/static/font/cour.ttf')");
		var fnt_cal = new FontFace("suppl_cal", "url('/static/font/calibri.ttf')");
		var fnt_sym = new FontFace("suppl_sym", "url('/static/font/seguisym.ttf')");
		Promise.all([fnt_main.load(), fnt_cal.load(), fnt_sym.load()]).then(function() {
			document.fonts.add(fnt_main);
			document.fonts.add(fnt_cal);
			document.fonts.add(fnt_sym);
			w.changeFont("$px suppl_cour, suppl_cal, suppl_sym");
		});
	},
	loadFont: function(name, path, cb) {
		var fnt = new FontFace(name, "url(\"" + encodeURI(path) + "\")");
		fnt.load().then(function() {
			document.fonts.add(fnt);
			if(cb) cb(fnt);
		});
	},
	changeSpecialCharFont: function(fontData) {
		specialCharFontTemplate = fontData;
		specialCharFont = specialCharFontTemplate.replace("$", normFontSize(16 * zoom));
		w.redraw();
	},
	enableCombining: function(nr) {
		combiningCharsEnabled = true;
		if(!nr) w.redraw();
	},
	disableCombining: function(nr) {
		combiningCharsEnabled = false;
		if(!nr) w.redraw();
	},
	enableSurrogates: function(nr) {
		surrogateCharsEnabled = true;
		if(!nr) w.redraw();
	},
	disableSurrogates: function(nr) {
		surrogateCharsEnabled = false;
		if(!nr) w.redraw();
	},
	enableColors: function(nr) {
		colorsEnabled = true;
		if(!nr) w.redraw();
	},
	disableColors: function(nr) {
		colorsEnabled = false;
		if(!nr) w.redraw();
	},
	basic: function() {
		w.disableSurrogates(1);
		w.disableCombining(1);
		w.disableColors(1);
		w.redraw();
	},
	restore: function() {
		w.enableSurrogates(1);
		w.enableCombining(1);
		w.enableColors(1);
		w.redraw();
	},
	night: function(ignoreUnloadedPattern) {
		styles.member = "#111";
		styles.owner = "#222";
		styles.public = "#000";
		styles.text = "#FFF";
		w.nightMode = 1;
		if(ignoreUnloadedPattern) {
			w.nightMode = 2;
		} else if(!elm.owot.classList.contains("nightmode")) {
			elm.owot.classList.add("nightmode");
		}
		w.redraw();
	},
	day: function(reloadStyle) {
		w.nightMode = 0;
		if(elm.owot.classList.contains("nightmode")) {
			elm.owot.classList.remove("nightmode");
		}
		if(reloadStyle) {
			getWorldProps(state.worldModel.name, "style", function(style, error) {
				if(!error) {
					styles.member = style.member;
					styles.owner = style.owner;
					styles.public = style.public;
					styles.text = style.text;
				}
				menu_color(styles.menu);
				w.redraw();
			});
		} else {
			var def = defaultStyles();
			styles.member = def.member;
			styles.owner = def.owner;
			styles.public = def.public;
			styles.text = def.text;
			w.redraw();
		}
	},
	rotate: function(speed) {
		if(!speed) speed = 2;
		var rotation = 0;
		var rot = setInterval(function() {
			elm.main_view.style.transform = "perspective(900px) rotateY(" + rotation + "deg)";
			rotation += speed;
			if(rotation >= 360) {
				elm.main_view.style.transform = "";
				clearInterval(rot);
			}
		}, 10);
	},
	hideChat: function() {
		chat_open.style.display = "none";
		elm.chat_window.style.display = "none";
	},
	showChat: function() {
		chat_open.style.display = "";
		if(chatOpen) elm.chat_window.style.display = "";
	},
	disableDragging: function() {
		draggingEnabled = false;
		stopDragging();
	},
	enableDragging: function() {
		draggingEnabled = true;
	},
	disableCursor: function() {
		cursorEnabled = false;
		removeCursor();
	},
	enableCursor: function() {
		cursorEnabled = true;
	},
	disableScrolling: function() {
		scrollingEnabled = false;
	},
	enableScrolling: function() {
		scrollingEnabled = true;
	},
	setMouseCursor: function(cursor) {
		defaultCursor = cursor;
	},
	resetMouseCursor: function() {
		defaultCursor = "text";
	},
	setDragCursor: function(cursor) {
		defaultDragCursor = cursor;
	},
	resetDragCursor: function() {
		defaultDragCursor = "move";
	},
	changeSocket: function(addr) {
		ws_path = addr;
		socket.close();
		createSocket();
		clearTiles(true);
		clearInterval(fetchInterval);
	},
	changeColor: function(color) {
		color = resolveColorValue(color);
		YourWorld.Color = color;
		localStorage.setItem("color", color);
		// update color textbox in "change color" menu
		var rgb = int_to_rgb(color);
		setRGBColorPicker(rgb[0], rgb[1], rgb[2]);
	},
	fetchUpdates: function(margin) {
		if(!margin) margin = 0;
		var top_left = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
		var bottom_right = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, owotHeight - 1 + margin);
		network.fetch({
			minX: top_left[0],
			minY: top_left[1],
			maxX: bottom_right[0],
			maxY: bottom_right[1]
		});
	},
	splitTile: function(str) {
		if(!classicTileProcessing) {
			return w.split(str);
		} else {
			return w.split(str, false, false, true);
		}
	},
	shiftZoombar: function() {
		w.menu.moveEntryLast(w.menu.zoombarId);
	},
	setFlushInterval: function(rate) {
		if(typeof rate != "number" || rate < 0 || isNaN(rate) || !isFinite(rate) || rate > 1000000) rate = 1000;
		writeFlushRate = rate;
		setWriteInterval();
	}
});

if (state.announce) {
	w._ui.announce_text.innerHTML = w._state.announce;
	w._ui.announce.style.display = "";
}

w._ui.announce_close.onclick = function() {
	w._ui.announce.style.display = "none";
}

elm.owot.oncontextmenu = function() {
	if(ignoreCanvasContext) {
		ignoreCanvasContext = false;
		elm.owot.style.pointerEvents = "none";
		setTimeout(function() {
			ignoreCanvasContext = true;
			elm.owot.style.pointerEvents = "";
		}, 1);
	}
}

window.onhashchange = function(e) {
	manageCoordHash();
}

window.onbeforeunload = function() {
	if(writeBuffer.length) flushWrites();
}

document.onselectstart = function(e) {
	var target = e.target;
	if(closest(target, getChatfield()) || target == elm.chatbar || closest(target, elm.confirm_js_code) || closest(target, elm.announce_text)) {
		return true;
	}
	return w._state.uiModal;
}

w._state.uiModal = false; // is the UI open? (coord, url, go to coord)

buildMenu();
w.regionSelect.onselection(handleRegionSelection);
w.regionSelect.init();

if(state.userModel.is_superuser) {
	w.loadScript("/static/yw/javascript/world_tools.js");
}

if(state.background) {
	w.backgroundInfo.x = ("x" in state.background) ? state.background.x : 0;
	w.backgroundInfo.y = ("y" in state.background) ? state.background.y : 0;
	w.backgroundInfo.w = ("w" in state.background) ? state.background.w : 0;
	w.backgroundInfo.h = ("h" in state.background) ? state.background.h : 0;
	w.backgroundInfo.rmod = ("rmod" in state.background) ? state.background.rmod : 0;
	w.backgroundInfo.alpha = ("alpha" in state.background) ? state.background.alpha : 1;
}

var simplemodal_onopen = function() {
	return w._state.uiModal = true;
}
var simplemodal_onclose = function() {
	return w._state.uiModal = false;
}

var tellEdit = [];
// tileX, tileY, charX, charY, editID
function searchTellEdit(tileX, tileY, charX, charY) {
	for(var i = 0; i < tellEdit.length; i++) {
		if (tellEdit[i][0] == tileX &&
			tellEdit[i][1] == tileY &&
			tellEdit[i][2] == charX &&
			tellEdit[i][3] == charY) {
			return true;
		}
	}
	return false;
}

function tile_offset_object(data, tileOffX, tileOffY) {
	var refs = {};
	var tilef;
	for(var tilef in data) {
		refs[tilef] = data[tilef];
		delete data[tilef];
	}
	for(var tkp in refs) {
		var new_key = getPos(tkp);
		new_key = (new_key[0] - tileOffY) + "," + (new_key[1] - tileOffX);
		data[new_key] = refs[tkp];
	}
}

var ws_functions = {
	fetch: function(data) {
		if("request" in data) {
			var id = data.request;
			var cb = network.callbacks[id];
			if(typeof cb == "function") {
				cb(data.tiles, null);
			}
		}
		if(tileFetchOffsetX || tileFetchOffsetY) {
			tile_offset_object(data.tiles, tileFetchOffsetX, tileFetchOffsetY);
		}
		w.emit("fetch", data);
		for(var tileKey in data.tiles) {
			var tile = data.tiles[tileKey];
			var pos = getPos(tileKey);
			if(tile) {
				tile.content = w.splitTile(tile.content);
				Tile.set(pos[1], pos[0], tile);
			} else {
				Tile.set(pos[1], pos[0], blankTile());
			}
			if(tiles[tileKey].properties.char) {
				tiles[tileKey].properties.char = decodeCharProt(tiles[tileKey].properties.char);
			}
			w.setTileRedraw(pos[1], pos[0]);
		}
		w.emit("afterFetch", data);
		updateHoveredLink(null, null, null, true);
		// too many tiles, remove tiles outside of the viewport
		var tileLim = Math.floor(getArea(fetchClientMargin) * 1.5 / zoom + 1000);
		if(w.tile.count > tileLim && unloadTilesAuto) {
			clearTiles();
		}
	},
	colors: function(data) {
		// update all world colors
		w.emit("colors", data);
		styles.public = data.colors.background;
		styles.cursor = data.colors.cursor;
		styles.guestCursor = data.colors.guest_cursor;
		styles.member = data.colors.member_area;
		styles.menu = data.colors.menu;
		styles.owner = data.colors.owner_area;
		styles.text = data.colors.text;
		styles.public_text = data.colors.public_text;
		styles.member_text = data.colors.member_text;
		styles.owner_text = data.colors.owner_text;
		checkTextColorOverride();
		w.render(true);
		menu_color(styles.menu);
	},
	tileUpdate: function(data) {
		w.emit("tileUpdate", data);
		var highlights = [];
		// settings are configured to offset server-fetched tiles
		if(tileFetchOffsetX || tileFetchOffsetY) {
			tile_offset_object(data.tiles, tileFetchOffsetX, tileFetchOffsetY);
		}
		for(tileKey in data.tiles) {
			var pos = getPos(tileKey);
			var tileX = pos[1];
			var tileY = pos[0];
			// if tile isn't loaded, load it blank
			if(!tiles[tileKey]) {
				Tile.set(tileX, tileY, blankTile());
			}
			if(!data.tiles[tileKey]) {
				data.tiles[tileKey] = blankTile();
			}
			if(!data.tiles[tileKey].properties.color) {
				data.tiles[tileKey].properties.color = new Array(tileArea).fill(0);
			}
			if(data.tiles[tileKey].properties.char) {
				data.tiles[tileKey].properties.char = decodeCharProt(data.tiles[tileKey].properties.char);
			}
			if(!tiles[tileKey].properties.color) {
				tiles[tileKey].properties.color = new Array(tileArea).fill(0);
			}
			var newContent;
			var newColors;
			// get content and colors from new tile data
			if(data.tiles[tileKey]) {
				newContent = w.splitTile(data.tiles[tileKey].content);
				if(data.tiles[tileKey].properties.color) {
					newColors = data.tiles[tileKey].properties.color;
				} else {
					newColors = new Array(tileArea).fill(0);
				}
			} else {
				newContent = new Array(tileArea).fill(" ");
			}
			var oldContent = tiles[tileKey].content;
			var oldColors = tiles[tileKey].properties.color.slice(0);
			var charX = 0;
			var charY = 0;
			// compare data
			for(var g = 0; g < tileArea; g++) {
				var oChar = oldContent[g];
				var nChar = newContent[g];
				var oCol = oldColors[g];
				var nCol = newColors[g];
				if(oChar != nChar || oCol != nCol) {
					// make sure it won't overwrite the clients changes before they get sent.
					// if edits are from client, don't overwrite, but leave the highlight flashes
					if(!searchTellEdit(tileX, tileY, charX, charY) && (data.channel != w.socketChannel || w.acceptOwnEdits)) {
						oldContent[g] = nChar;
						oldColors[g] = nCol;
					}
					// briefly highlight these edits (10 at a time)
					if(useHighlight && Tile.visible(tileX, tileY)) highlights.push([tileX, tileY, charX, charY]);
				}
				charX++;
				if(charX >= tileC) {
					charX = 0;
					charY++;
				}
			}
			tiles[tileKey].properties = data.tiles[tileKey].properties; // update tile
			tiles[tileKey].content = oldContent; // update only necessary character updates
			tiles[tileKey].properties.color = oldColors; // update only necessary color updates
			w.setTileRedraw(tileX, tileY);
		}
		if(highlights.length > 0 && useHighlight) highlight(highlights);
		var tileLim = Math.floor(getArea(fetchClientMargin) * 1.5 / zoom + 1000);
		if(w.tile.count > tileLim && unloadTilesAuto) {
			clearTiles();
		}
		w.emit("afterTileUpdate", data);
	},
	write: function(data) {
		if("request" in data) {
			var id = data.request;
			var cb = network.callbacks[id];
			if(typeof cb == "function") {
				cb(data, null);
			}
		}
		w.emit("writeResponse", data);
		// after user has written text, the client should expect list of all edit ids that passed
		for(var i = 0; i < data.accepted.length; i++) {
			for(var x = 0; x < tellEdit.length; x++) {
				if(tellEdit[x][4] == data.accepted[i]) {
					var tileX = tellEdit[x][0];
					var tileY = tellEdit[x][1];
					var charX = tellEdit[x][2];
					var charY = tellEdit[x][3];
					// check if there are links in queue
					for(var r = 0; r < linkQueue.length; r++) {
						var queueItem = linkQueue[r];
						if(queueItem[1] == tileX && queueItem[2] == tileY && queueItem[3] == charX && queueItem[4] == charY) {
							var linkType = queueItem[0];
							if(linkType == "url") {
								network.link({
									tileY: tileY,
									tileX: tileX,
									charY: charY,
									charX: charX
								}, "url", { url: queueItem[5] });
							} else if(linkType == "coord") {
								network.link({
									tileY: tileY,
									tileX: tileX,
									charY: charY,
									charX: charX
								}, "coord", { x: queueItem[5], y: queueItem[6] });
							}
							linkQueue.splice(r, 1);
							break;
						}
					}
					tellEdit.splice(x, 1);
					// because the element has been removed, the length of the array is shorter
					x--;
				}
			}
		}
	},
	channel: function(data) {
		w.socketChannel = data.sender;
		w.clientId = data.id;
		w.userCount = data.initial_user_count;
		updateUserCount();
		if(!canAccessWorld) { // client now has read access to this world
			canAccessWorld = true;
			w.doAnnounce("");
		}
	},
	announcement: function(data) {
		w.emit("announcement", data);
		w.doAnnounce(data.text);
	},
	ping: function(data) {
		w.emit("ping", data);
		if(data.time) {
			var clientReceived = getDate();
			// serverPingTime is from chat.js
			var pingMs = clientReceived - serverPingTime;
			addChat(null, 0, "user", "[ Client ]", "Ping: " + pingMs + " MS", "Client", false, false, false, null, clientReceived);
			return;
		}
	},
	tile_clear: function(data) {
		var pos = data.tileY + "," + data.tileX;
		if(tiles[pos]) {
			var writability = tiles[pos].properties.writability;
			Tile.set(data.tileX, data.tileY, blankTile());
			tiles[pos].properties.writability = writability;
			w.setTileRender(data.tileX, data.tileY);
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
	cmd: function(data) {
		w.emit("cmd", data);
	},
	cursor: function(data) {
		w.emit("guestCursor", data);
		var channel = data.channel;
		var hidden = data.hidden;
		var position = data.position;
		if(channel == w.socketChannel) return;
		if(hidden) {
			var csr = guestCursors[channel];
			if(!csr) return;
			var tileX = csr.tileX;
			var tileY = csr.tileY;
			delete guestCursors[channel];
			var tilePos = tileY + "," + tileX;
			if(guestCursorsByTile[tilePos]) {
				delete guestCursorsByTile[tilePos][channel];
				if(Object.keys(guestCursorsByTile[tilePos]).length == 0) {
					delete guestCursorsByTile[tilePos];
				}
			}
			w.setTileRedraw(tileX, tileY);
		} else if(position) {
			var csr = guestCursors[channel];
			if(!csr) {
				csr = {};
				guestCursors[channel] = csr;
			} else {
				var prevTilePos = csr.tileY + "," + csr.tileX;
				if(guestCursorsByTile[prevTilePos]) {
					delete guestCursorsByTile[prevTilePos][channel];
				}
				if(Object.keys(guestCursorsByTile[prevTilePos]).length == 0) {
					delete guestCursorsByTile[prevTilePos];
				}
				w.setTileRedraw(csr.tileX, csr.tileY);
			}
			csr.tileX = position.tileX;
			csr.tileY = position.tileY;
			csr.charX = position.charX;
			csr.charY = position.charY;
			tilePos = csr.tileY + "," + csr.tileX;
			if(!guestCursorsByTile[tilePos]) {
				guestCursorsByTile[tilePos] = {};
			}
			guestCursorsByTile[tilePos][channel] = csr;
			w.setTileRedraw(csr.tileX, csr.tileY);
		}
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
					w.doAnnounce("Access to this world is denied. Please make sure you are logged in.");
					canAccessWorld = false;
				}
				break;
			case "PARAM": // invalid parameters in message
				break;
		}
	}
};

function begin() {
	manageCoordHash();
	getWorldProps(state.worldModel.name, "style", function(style, error) {
		if(error) {
			console.warn("An error occurred while loading the world style");
			styles = defaultStyles();
		} else {
			styles = style;
		}
		checkTextColorOverride();
		menu_color(styles.menu);
		loadBackgroundData(function() {
			owotCtx.clearRect(0, 0, owotWidth, owotHeight);
			renderLoop();
			createSocket();
			elm.loading.style.display = "none";
		}, function() {
			w.redraw();
		});
	});
}

begin();
