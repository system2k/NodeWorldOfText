﻿var YourWorld = {
	Color: window.localStorage ? +localStorage.getItem("color") : 0,
	BgColor: -1,
	Nickname: state.userModel.username
};

var owot, owotCtx, textInput;
var linkElm, linkDiv;
var colorInput, colorInputBg;
var colorShortcuts, colorShortcutsBg;
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
	initTextDecoBar();
	initEraseRegionBar();
	defineElements({
		owot: owot,
		textInput: textInput
	});
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
var styles                 = defaultStyles();
var nextObjId              = 1; // Next edit ID
var owotWidth              = getWndWidth();
var owotHeight             = getWndHeight();
var js_alert_active        = false; // JS alert window is open
var worldFocused           = false;
var chatResizing           = false;
var tiles                  = {}; // All loaded tiles
var images                 = {}; // { name: [data RGBA, width, height] }
var keysPressed            = {};
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
var compositionBuffer      = ""; // composition buffer for Android-based keyboards
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
var write_busy             = false; // currently pasting
var pasteInterval          = 0;
var linkQueue              = [];
var eraseRegionMode        = 0;

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

var keyConfig = {
	reset: "ESC",
	copyColor: "ALT+C",
	copyBgColor: "ALT+B",
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
	centerTeleport: "HOME",
	undo: "CTRL+Z",
	redo: ["CTRL+Y", "CTRL+SHIFT+Z"],
	showTextDeco: ["CTRL+Q", "ALT+Q", "CTRL+SHIFT+F"],
	zoomIn: ["CTRL+EQUALS"],
	zoomOut: ["CTRL+MINUS"],
	zoomReset: ["CTRL+0"]
};

window.addEventListener("load", function() {
	w.emit("clientLoaded");
});

defineElements({ // elm[<name>]
	loading: byId("loading"),
	coord_Y: byId("coord_Y"),
	coord_X: byId("coord_X"),
	tile_Y: byId("tile_Y"),
	tile_X: byId("tile_X"),
	char_Y: byId("char_Y"),
	char_X: byId("char_X"),
	chatbar: byId("chatbar"),
	color_input_form_input: byId("color_input_form_input"),
	protect_precision: byId("protect_precision"),
	erase_region: byId("erase_region"),
	announce_container: byId("announce_container"),
	tile_choice: byId("tile_choice"),
	char_choice: byId("char_choice"),
	menu_elm: byId("menu"),
	nav_elm: byId("nav"),
	coords: byId("coords"),
	cursor_coords: byId("cursor_coords"),
	cursor_on: byId("cursor_on"),
	cursor_off: byId("cursor_off"),
	chat_window: byId("chat_window"),
	confirm_js: byId("confirm_js"),
	confirm_js_msg: byId("confirm_js_msg"),
	confirm_js_code: byId("confirm_js_code"),
	main_view: byId("main_view"),
	usr_online: byId("usr_online"),
	link_element: byId("link_element"),
	link_div: byId("link_div"),
	protect_selection: byId("protect_selection"),
	text_decorations: byId("text_decorations"),
	text_deco_b: byId("text_deco_b"),
	text_deco_i: byId("text_deco_i"),
	text_deco_u: byId("text_deco_u"),
	text_deco_s: byId("text_deco_s"),
	erase_region_once: byId("erase_region_once"),
	erase_region_mult: byId("erase_region_mult"),
	erase_region_ctrl: byId("erase_region_ctrl"),
	erase_region_snap: byId("erase_region_snap")
});

function setRGBColorPicker(r, g, b) {
	colorInput.jscolor.fromRGB(r, g, b);
}

function setRGBBgColorPicker(r, g, b) {
	colorInputBg.jscolor.fromRGB(r, g, b);
}

function setColorPickerRandom() {
	var r = Math.floor(Math.random() * 256);
	var g = Math.floor(Math.random() * 256);
	var b = Math.floor(Math.random() * 256);
	setRGBColorPicker(r, g, b);
}

function updateColorPicker() {
	var r = (YourWorld.Color >> 16) & 255;
	var g = (YourWorld.Color >> 8) & 255;
	var b = YourWorld.Color & 255;
	setRGBColorPicker(r, g, b);
}

function updateBgColorPicker() {
	var r = (YourWorld.BgColor >> 16) & 255;
	var g = (YourWorld.BgColor >> 8) & 255;
	var b = YourWorld.BgColor & 255;
	setRGBBgColorPicker(r, g, b);
}

function updateCoordDisplay() {
	var tileCoordX = -positionX / tileW;
	var tileCoordY = -positionY / tileH;
	var centerY = -Math.floor(tileCoordY / coordSizeY);
	var centerX = Math.floor(tileCoordX / coordSizeX);
	elm.coord_Y.innerText = centerY;
	elm.coord_X.innerText = centerX;

	if (showCursorCoordinates) {
		if (cursorCoords === null) {
			elm.cursor_on.style.display = "none";
			elm.cursor_off.style.display = "";
			return;
		}

		elm.cursor_on.style.display = "";
		elm.cursor_off.style.display = "none";
		[elm.tile_X.innerText,
	     elm.tile_Y.innerText,
		 elm.char_X.innerText,
		 elm.char_Y.innerText] = [...cursorCoords];
	}
}

w.on("cursorMove", updateCoordDisplay);
w.on("cursorHide", updateCoordDisplay);

elm.coords.onclick = function() {
	showCursorCoordinates = !showCursorCoordinates;
	if(showCursorCoordinates) {
		elm.cursor_coords.style.display = "";
		updateCoordDisplay();
	} else {
		elm.cursor_coords.style.display = "none";
		updateCoordDisplay();
	}
}

function createColorButton(color, isHighlight) {
	var celm = document.createElement("span");
	var colorInt = resolveColorValue(color);
	var colorValues = int_to_rgb(colorInt);
	celm.className = "color_btn";
	var hex = int_to_hexcode(colorInt);
	celm.style.backgroundColor = hex;
	celm.title = hex.toUpperCase();
	celm.onclick = function() {
		if(!isHighlight) {
			setRGBColorPicker(colorValues[0], colorValues[1], colorValues[2]);
		} else {
			enableBgColorPicker();
			setRGBBgColorPicker(colorValues[0], colorValues[1], colorValues[2]);
		}
		w.ui.colorModal.submitForm();
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
	var colors_highlight = [
		"#F49446",
		"#DCE943",
		"#07D555",
		"#529DC9",
		"#9D7DC6",
		"#EA5BB6"
	];
	for(var i = 0; i < colors.length; i++) {
		var color = colors[i];
		colorShortcuts.appendChild(createColorButton(color));
	}
	for(var i = 0; i < colors_highlight.length; i++) {
		var color = colors_highlight[i];
		colorShortcutsBg.appendChild(createColorButton(color, true));
	}
	var rand = document.createElement("span");
	rand.className = "color_btn";
	rand.style.backgroundColor = "#FFFFFF";
	rand.innerText = "?";
	rand.title = "Random color";
	rand.onclick = setColorPickerRandom;
	colorShortcuts.appendChild(rand);

	var bgNone = document.createElement("span");
	bgNone.id = "color_btn_no_cell";
	bgNone.className = "color_btn";
	bgNone.style.backgroundColor = "#FFFFFF";
	bgNone.title = "No background color";
	bgNone.onclick = function() {
		w.ui.colorModal.close(true); // close + cancel
		disableBgColorPicker();
		YourWorld.BgColor = -1;
	}
	colorShortcutsBg.appendChild(bgNone);
}

init_dom(); // TODO: put this elsewhere

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
		bgImageHasChanged = true;
	}
	backImgElm.onerror = function() {
		error = true;
		backImgElm.onload();
	}
}

function keydown_regionSelect(e) {
	if(!checkKeyPress(e, keyConfig.copyRegion) || regionSelectionsActive()) return;
	if(Modal.isOpen) return;
	if(!worldFocused) return;
	if(!Permissions.can_copy(state.userModel, state.worldModel)) return;
	e.preventDefault();
	w.regionSelect.startSelection();
}
document.addEventListener("keydown", keydown_regionSelect);

function handleRegionSelection(coordA, coordB, regWidth, regHeight) {
	var tileX = coordA[0];
	var tileY = coordA[1];
	var charX = coordA[2];
	var charY = coordA[3];
	var reg = [];
	var colors = [];
	var bgcolors = [];
	var links = [];
	var protections = [];
	var decorations = [];
	for(var y = 0; y < regHeight; y++) {
		// rows
		var r_reg = [];
		var r_colors = [];
		var r_bgcolors = [];
		var r_links = [];
		var r_protections = [];
		var r_decorations = [];
		// contains non-default (not null) value in row?
		var c_color = false;
		var c_bgcolor = false;
		var c_link = false;
		var c_protection = false;
		var c_decoration = false;
		for(var x = 0; x < regWidth; x++) {
			var charInfo = getCharInfo(tileX, tileY, charX, charY);
			var char = charInfo.char;
			char = char.replace(/\r|\n|\x1b/g, " ");
			r_reg.push(char);
			r_colors.push(charInfo.color);
			r_bgcolors.push(charInfo.bgColor);
			if(charInfo.color) c_color = true;
			if(charInfo.bgColor != -1) c_bgcolor = true;
			var tile = Tile.get(tileX, tileY);
			var containsLink = false;
			if(tile && tile.properties && tile.properties.cell_props) {
				if(tile.properties.cell_props[charY] && tile.properties.cell_props[charY][charX]) {
					var link = tile.properties.cell_props[charY][charX];
					if(link.link) {
						link = link.link;
						containsLink = true;
						c_link = true;
						if(link.type == "url") {
							r_links.push("$u" + "\"" + escapeQuote(link.url) + "\"");
						} else if(link.type == "coord") {
							r_links.push("$c" + "[" + link.link_tileX + "," + link.link_tileY + "]");
						}
					}
				}
			}
			r_protections.push(charInfo.protection);
			if(charInfo.protection !== null) c_protection = true;
			if(!containsLink) {
				r_links.push(null);
			}
			r_decorations.push(charInfo.decoration);
			if(charInfo.decoration !== null) c_decoration = true;
			charX++;
			if(charX >= tileC) {
				charX = 0;
				tileX++;
			}
		}
		if(!c_color) r_colors = null;
		if(!c_link) r_links = null;
		if(!c_protection) r_protections = null;
		if(!c_decoration) r_decorations = null;
		if(!c_bgcolor) r_bgcolors = null;
		reg.push(r_reg);
		colors.push(r_colors);
		bgcolors.push(r_bgcolors);
		links.push(r_links);
		protections.push(r_protections);
		decorations.push(r_decorations);
		tileX = coordA[0];
		charX = coordA[2];
		charY++;
		if(charY >= tileR) {
			charY = 0;
			tileY++;
		}
	}
	w.ui.selectionModal.open(reg, colors, bgcolors, links, protections, decorations, [coordA, coordB]);
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

function buildFontTemplate(set) {
	var str = "$px ";
	for(var i = 0; i < set.length; i++) {
		var name = set[i];
		if(i != 0) {
			str += ", ";
		}
		if(name.includes(" ")) {
			str += "'" + name + "'";
		} else {
			str += name;
		}
	}
	return str;
}

function rebuildFontTemplates() {
	fontTemplate = buildFontTemplate(fontOrder);
	specialFontTemplate = buildFontTemplate(specialFontOrder);
}

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
	specialCharFont = specialFontTemplate.replace("$", fontSize);

	textRenderCanvas.width = tileWidth + 5;
	textRenderCanvas.height = tileHeight + 5;
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
		textRenderCtx = textRenderCanvas.getContext("2d", {
			willReadFrequently: true
		});
	} else {
		textRenderCtx = textRenderCanvas.getContext("2d", {
			alpha: false,
			willReadFrequently: true
		});
	}
}

setupTextRenderCtx();
updateScaleConsts();

function reloadRenderer() {
	if(tileCanvasPool.length) {
		removeAllTilesFromPools();
		deleteAllPools();
		w.redraw();
	}
}

// set absolute zoom - must not be called directly (use changeZoom)
function updateRendererZoom(percentage) {
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
	textRenderCanvas.width = tileWidth + 5;
	textRenderCanvas.height = tileHeight + 5;
	textRenderCtx.font = font;

	// change size of invisible link
	linkDiv.style.width = (cellW / zoomRatio) + "px";
	linkDiv.style.height = (cellH / zoomRatio) + "px";

	// rerender everything
	w.redraw();
}

function zoomGarbageCollect() {
	if(tileCanvasPool.length > 100 || countTotalPoolPixels() > 10000000) {
		cleanupDirtyTiles();
	}
	deleteEmptyPools();
}

// set user zoom
function changeZoom(percentage, isPartial) {
	if(!isPartial) {
		positionX /= zoom;
		positionY /= zoom;
	}
	userZoom = percentage / 100;
	if(userZoom < 0.2) userZoom = 0.2;
	if(userZoom > 10) userZoom = 10;
	updateRendererZoom(userZoom * deviceRatio() * 100);
	if(!isPartial) {
		positionX *= zoom;
		positionY *= zoom;
		positionX = Math.trunc(positionX); // remove decimals
		positionY = Math.trunc(positionY);
		w.render();
		zoomGarbageCollect();
	}
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
	updateRendererZoom(absZoom * 100);
	positionX *= zoom;
	positionY *= zoom;
	positionX = Math.trunc(positionX);
	positionY = Math.trunc(positionY);
	return true;
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
	if(Modal.isOpen) return;
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
				uncolorChar(ctileX, ctileY, ccharX, ccharY, "qprot*");
				colorChar(ctileX, ctileY, ccharX, ccharY, "qprot" + mode);
			}
			updTiles[ctileY + "," + ctileX] = 1;
		}
		for(var i in updTiles) {
			var pos = i.split(",");
			var tileX = parseInt(pos[1]);
			var tileY = parseInt(pos[0]);
			w.setTileRedraw(tileX, tileY, true);
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
				uncolorChar(tileX, tileY, charX, charY, "qprot*");
			}
			delete tileProtectAuto.selected[pos];
			w.setTileRender(tileX, tileY);
		}
	}
}
document.addEventListener("mousemove", mousemove_tileProtectAuto);

function keydown_tileProtectAuto(e) {
	if(Modal.isOpen) return;
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
				uncolorChar(tileX, tileY, charX, charY, "qprot*");
				w.setTileRedraw(tileX, tileY, true);
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
	if(Modal.isOpen) return;
	if(!linkAuto.active) return;
	var tile = Tile.get(currentPosition[0], currentPosition[1]);
	if(!tile) return;
	
	var tileX = currentPosition[0];
	var tileY = currentPosition[1];
	var charX = currentPosition[2];
	var charY = currentPosition[3];
	var lastPos = linkAuto.lastPos;

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

			uncolorChar(ctileX, ctileY, ccharX, ccharY, "qlink*");
			colorChar(ctileX, ctileY, ccharX, ccharY, "qlink" + linkAuto.mode);
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
			w.setTileRedraw(tileX, tileY, true);
		}
	}
	if(linkAuto.shiftDown) {
		var elm = linkAuto.selected[tileY + "," + tileX + "," + charY + "," + charX];
		if(elm !== void 0) {
			uncolorChar(tileX, tileY, charX, charY, "qlink*");
			w.setTileRedraw(tileX, tileY, true);
			delete linkAuto.selected[tileY + "," + tileX + "," + charY + "," + charX];
		}
	}
}
document.addEventListener("mousemove", mousemove_linkAuto);

function keydown_linkAuto(e) {
	if(Modal.isOpen) return;
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
			uncolorChar(tileX, tileY, charX, charY, "qlink*");
			w.setTileRedraw(tileX, tileY, true);

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

var admclr = {
	activated: false,
	lastPos: null,
	ctrlDown: false,
	selectionColor: "#FF5959",
	activeColor: "#FF0000",
	color: "",
	renderTile: function(preserveLastPos) {
		var tile = Tile.get(currentPosition[0], currentPosition[1]);
		if(tile) {
			// change color to red
			tile.backgroundColor = admclr.color;
			if(!preserveLastPos)
				admclr.lastPos = [currentPosition[0], currentPosition[1]];
			// re-render the tile
			w.setTileRender(currentPosition[0], currentPosition[1]);
		}
	},
	handleClear: function(x, y) {
		network.clear_tile({
			tileX: x,
			tileY: y
		});
	},
	activate: function() {
		admclr.activated = true;
		admclr.color = admclr.selectionColor;
	},
	deactivate: function() {
		admclr.activated = false;
		tiles[currentPosition[1] + "," + currentPosition[0]].backgroundColor = "";
		w.setTileRedraw(currentPosition[0], currentPosition[1]);
	}
};

function keydown_admclr(e) {
	if(Modal.isOpen) return;
	if(!admclr.activated) return;
	if(admclr.ctrlDown) return;
	if(e.ctrlKey) {
		admclr.ctrlDown = true;
		admclr.color = admclr.activeColor;
		admclr.renderTile(true);
		admclr.handleClear(currentPosition[0], currentPosition[1]);
	}
}
document.body.addEventListener("keydown", keydown_admclr);

function mousemove_admclr(e) {
	if(Modal.isOpen) return;
	if(!admclr.activated) return;
	if(admclr.lastPos) {
		var tile = Tile.get(admclr.lastPos[0], admclr.lastPos[1]);
		// do not re-render if the cursor moved but is still inside the same tile
		if(admclr.lastPos[0] == currentPosition[0] && admclr.lastPos[1] == currentPosition[1]) {
			return;
		}
		if(tile) tile.backgroundColor = "";
		// re-render the tile
		w.setTileRender(admclr.lastPos[0], admclr.lastPos[1]);
	}
	// if tile exists
	admclr.renderTile();
	if(admclr.ctrlDown) {
		admclr.handleClear(currentPosition[0], currentPosition[1]);
	}
}
document.body.addEventListener("mousemove", mousemove_admclr);

function keyup_admclr(e) {
	if(!admclr.activated) return;
	admclr.ctrlDown = false;
	admclr.color = admclr.selectionColor;
	var tile = Tile.get(currentPosition[0], currentPosition[1]);
	// remove color of tile
	if(admclr.lastPos) {
		var prevTile = Tile.get(admclr.lastPos[0], admclr.lastPos[1]);
		if(prevTile) prevTile.backgroundColor = "";
		// re-render the tile
		w.setTileRender(admclr.lastPos[0], admclr.lastPos[1]);
	}
	if(tile) tile.backgroundColor = admclr.selectionColor;
	w.setTileRender(currentPosition[0], currentPosition[1]);
}
document.body.addEventListener("keyup", keyup_admclr);

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
	if(checkKeyPress(e, keyConfig.centerTeleport) && e.target == elm.textInput) { // home
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
	var char = content[charY * tileC + charX];
	char = clearCharTextDecorations(char);
	char = resolveCharEmojiCombinations(char);
	return char;
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

function getCharBgColor(tileX, tileY, charX, charY) {
	if(tileX == void 0 && tileY == void 0 && charX == void 0 && charY == void 0) {
		if(!cursorCoords) return -1;
		tileX = cursorCoords[0];
		tileY = cursorCoords[1];
		charX = cursorCoords[2];
		charY = cursorCoords[3];
	}
	var tile = Tile.get(tileX, tileY);
	if(!tile) return -1;
	if(!tile.properties.bgcolor) return -1;
	return tile.properties.bgcolor[charY * tileC + charX];
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

function getCharDecoration(tileX, tileY, charX, charY) {
	if(tileX == void 0 && tileY == void 0 && charX == void 0 && charY == void 0) {
		if(!cursorCoords) return -1;
		tileX = cursorCoords[0];
		tileY = cursorCoords[1];
		charX = cursorCoords[2];
		charY = cursorCoords[3];
	}
	var tile = Tile.get(tileX, tileY);
	if(!tile) return null;
	var content = tile.content;
	var char = content[charY * tileC + charX];
	return getCharTextDecorations(char);
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
		bgColor: getCharBgColor(tileX, tileY, charX, charY),
		protection: getCharProtection(tileX, tileY, charX, charY),
		decoration: getCharDecoration(tileX, tileY, charX, charY)
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
	if(Modal.isOpen) return;
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
	if(Modal.isOpen) return;
	if(!worldFocused) return;
	var keyCopyColor = checkKeyPress(e, keyConfig.copyColor);
	var keyCopyBgColor = checkKeyPress(e, keyConfig.copyBgColor);
	if(!keyCopyColor && !keyCopyBgColor) return;
	e.preventDefault();
	stopPasting();
	// alt + c to use color of text cell (where mouse cursor is) as main color
	// alt + b to overwrite your background color with the one the mouse cursor is on
	var pos = currentPosition;
	if(!pos) return;
	var tileX = pos[0];
	var tileY = pos[1];
	var charX = pos[2];
	var charY = pos[3];
	var color;
	if(keyCopyColor) {
		color = getCharColor(tileX, tileY, charX, charY);
		w.changeColor(color);
	} else if(keyCopyBgColor) {
		color = getCharBgColor(tileX, tileY, charX, charY);
		w.changeBgColor(color);
	}
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
	expandLocalBoundary(tileX, tileY);
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
	if((tilePosX < 0 || tilePosY < 0) && (tilePosX + tileW - zoom < 0 || tilePosY + tileH - zoom < 0)) {
		return false;
	}
	// too far right/bottom
	if(tilePosX >= owotWidth || tilePosY >= owotHeight) {
		return false;
	}
	return true;
}

function isTileStale(tileX, tileY) {
	var tile = Tile.get(tileX, tileY);
	return tile ? !!tile.stale : false;
}

var poolCleanupInterval = setInterval(function() {
	if(w.periodDeletedTiles < 50) return;
	w.periodDeletedTiles = 0;
	shiftAllTilesInPools();
}, 1000 * 10);

function checkTextColorOverride() {
	var public = 4;
	var member = 2;
	var owner = 1;
	// if custom text color is set to a zone, use that color instead of default
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
	uncolorChar(tileX, tileY, charX, charY, "link");
	w.setTileRedraw(tileX, tileY, true);
}

function startEraseUI() {
	elm.erase_region.style.display = "";
	if((eraseRegionMode == 0 || eraseRegionMode == 1) && !w.eraseSelect.isSelecting) {
		w.eraseSelect.startSelection();
	} else if(eraseRegionMode == 2 && !admclr.activated) {
		admclr.activate();
	}
}

function stopEraseUI() {
	elm.erase_region.style.display = "none";
	if(w.eraseSelect.isSelecting) {
		w.eraseSelect.stopSelectionUI();
	}
	if(admclr.activated) {
		admclr.deactivate();
	}
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
			uncolorChar(tileX, tileY, charX, charY, "prot");
		}
	}
	w.setTileRedraw(tileX, tileY, true);
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

function resetUI() {
	stopLinkUI();
	stopTileUI();
	stopEraseUI();
	for(var i = 0; i < regionSelections.length; i++) {
		regionSelections[i].stopSelectionUI();
	}
	removeCursor();
	tileProtectAuto.active = false;
	tileProtectAuto.lastPos = null;
	linkAuto.active = false;
}

function triggerUIClick() {
	stopPasting();
	if(w.isLinking) {
		doLink();
	}
	if(!w.protectSelect.isSelecting && w.isProtecting) {
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
	w.menu.hideNow();
	return foundActiveSelection;
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

	var coords = getTileCoordsFromMouseCoords(pageX, pageY);
	currentPosition = coords;

	if(draggingEnabled) {
		dragStartX = pageX;
		dragStartY = pageY;
		dragPosX = positionX;
		dragPosY = positionY;
		isDragging = true;
	}
	var isActive = triggerUIClick();
	var pos = getTileCoordsFromMouseCoords(pageX, pageY);
	w.emit("mouseDown", {
		tileX: pos[0],
		tileY: pos[1],
		charX: pos[2],
		charY: pos[3],
		pageX: pageX,
		pageY: pageY
	});
	if(!isActive) {
		elm.owot.style.cursor = defaultDragCursor;
	}
}
document.addEventListener("mousedown", event_mousedown);

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

	// remove cursor (visually) from previous tile
	if(cursorCoords) {
		var hasBgColor = getCharBgColor() != -1;
		cursorCoords = null;
		w.setTileRender(tileX, tileY);
		if(hasBgColor) {
			w.setTileRedraw(tileX, tileY, true);
		}
	} else {
		w.emit("cursorShow", {
			tileX: coords[0],
			tileY: coords[1],
			charX: coords[2],
			charY: coords[3]
		});
	}

	// render cursor in new tile
	cursorCoords = coords.slice(0);
	cursorCoordsCurrent = coords.slice(0); // redundant
	w.setTileRender(coords[0], coords[1]);
	// force redraw if the cursor is touching a background-colored cell
	if(getCharBgColor() != -1) {
		w.setTileRedraw(coords[0], coords[1], true);
	}

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
	var hasBgColor = getCharBgColor() != -1;
	cursorCoords = null;
	w.setTileRender(remTileX, remTileY);
	if(hasBgColor) {
		w.setTileRedraw(remTileX, remTileY, true);
	}
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
			foundActiveSelection = true;
		}
	}
	if(foundActiveSelection) return;

	if(closest(e.target, elm.main_view) && canShowMobileKeyboard) {
		elm.textInput.focus();
		elm.textInput.value = "";
		compositionBuffer = "";
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

function event_mouseleave(e) {
	event_mousemove(e);
	w.emit("mouseLeave", e);
}
document.addEventListener("mouseleave", event_mouseleave);
function event_mouseenter(e) {
	event_mousemove(e);
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
	network.write(writeBuffer.splice(0, 512));
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

function moveCursor(direction, preserveVertPos, amount) {
	if(!cursorCoords) return;
	if(window.dcm || (window.prE && window.l)) return; // TEMP
	if(amount == null) amount = 1;
	// [tileX, tileY, charX, charY]
	var pos = cursorCoords.slice(0);
	if(direction == "up") {
		pos[3] -= amount;
	} else if(direction == "down") {
		pos[3] += amount;
	} else if(direction == "left") {
		pos[2] -= amount;
	} else if(direction == "right") {
		pos[2] += amount;
	}
	if(pos[2] < 0) {
		pos[0] += Math.floor(pos[2] / tileC);
		pos[2] = pos[2] - Math.floor(pos[2] / tileC) * tileC;
	} else if(pos[2] >= tileC) {
		pos[0] += Math.floor(pos[2] / tileC);
		pos[2] %= tileC;
	}
	if(pos[3] < 0) {
		pos[1] += Math.floor(pos[3] / tileR);
		pos[3] = pos[3] - Math.floor(pos[3] / tileR) * tileR;
	} else if(pos[3] >= tileR) {
		pos[1] += Math.floor(pos[3] / tileR);
		pos[3] %= tileR;
	}
	if(!preserveVertPos) {
		verticalEnterPos[0] = pos[0];
		verticalEnterPos[1] = pos[2];
	}
	return renderCursor(pos);
}

function markCharacterAsUndoable(tileX, tileY, charX, charY) {
	var info = getCharInfo(tileX, tileY, charX, charY);
	var link = getLink(tileX, tileY, charX, charY);
	undoBuffer.push([tileX, tileY, charX, charY, info.char, info.color, link, info.bgColor, info.decoration, 0]);
}

function isCharLatestInUndoBuffer(tileX, tileY, charX, charY) {
	if(!undoBuffer.top()) return false;
	var latest = undoBuffer.top();
	return (latest[0] == tileX & latest[1] == tileY && latest[2] == charX && latest[3] == charY);
}

function doBackspace() {
	if(state.worldModel.char_rate[0] > 0 || state.userModel.is_member) {
		moveCursor("left", true);
		writeChar("\x08", true, null, false, 1);
	}
}

// place a character
// TODO: after refactoring this function, we will keep this header for legacy purposes
function writeCharTo(char, charColor, tileX, tileY, charX, charY, undoFlags, undoOffset, charBgColor, dB, dI, dU, dS) {
	if(!Tile.get(tileX, tileY)) {
		Tile.set(tileX, tileY, blankTile());
	}
	var tile = Tile.get(tileX, tileY);
	var isErase = char == "\x08";
	if(isErase) {
		char = " ";
		charColor = 0x000000;
		charBgColor = -1;
	}
	if(charBgColor == null) {
		charBgColor = -1;
	}
	
	var cell_props = tile.properties.cell_props;
	if(!cell_props) cell_props = {};
	var color = tile.properties.color;
	var bgcolor = tile.properties.bgcolor;
	if(!color) color = new Array(tileArea).fill(0);

	var hasChanged = false;
	var prevColor = 0;
	var prevBgColor = -1;
	var prevChar = "";
	var prevLink = getLink(tileX, tileY, charX, charY);

	// delete link locally
	if(cell_props[charY]) {
		if(cell_props[charY][charX]) {
			delete cell_props[charY][charX];
			hasChanged = true;
		}
	}
	// change color locally
	if(!Permissions.can_color_text(state.userModel, state.worldModel)) {
		charColor = 0x000000;
	}
	if(!Permissions.can_color_cell(state.userModel, state.worldModel)) {
		charBgColor = -1;
	}

	// set text color
	prevColor = color[charY * tileC + charX];
	color[charY * tileC + charX] = charColor;
	if(prevColor != charColor) hasChanged = true;
	tile.properties.color = color; // if the color array doesn't already exist in the tile

	// set cell color
	if(!bgcolor && charBgColor != -1) {
		bgcolor = new Array(tileArea).fill(-1);
		tile.properties.bgcolor = bgcolor;
	}
	if(bgcolor) {
		prevBgColor = bgcolor[charY * tileC + charX];
		bgcolor[charY * tileC + charX] = charBgColor;
		if(prevBgColor != charBgColor) hasChanged = true;
	}

	// update cell properties (link positions)
	tile.properties.cell_props = cell_props;

	var cBold, cItalic, cUnder, cStrike, currDeco;
	if(!isErase) {
		currDeco = getCharTextDecorations(char);
		char = clearCharTextDecorations(char);
		char = detectCharEmojiCombinations(char) || char;
		cBold = textDecorationModes.bold;
		cItalic = textDecorationModes.italic;
		cUnder = textDecorationModes.under;
		cStrike = textDecorationModes.strike;
		if(currDeco) {
			cBold = cBold || currDeco.bold;
			cItalic = cItalic || currDeco.italic;
			cUnder = cUnder || currDeco.under;
			cStrike = cStrike || currDeco.strike;
		}
		// don't let spaces be bold/italic
		if(char == " ") {
			cBold = false;
			cItalic = false;
		}
		// parameter overrides
		if(dB != null) cBold = dB ? true : false;
		if(dI != null) cItalic = dI ? true : false;
		if(dU != null) cUnder = dU ? true : false;
		if(dS != null) cStrike = dS ? true : false;
		char = setCharTextDecorations(char, cBold, cItalic, cUnder, cStrike);
	}

	// set char locally
	var con = tile.content;
	prevChar = con[charY * tileC + charX];
	con[charY * tileC + charX] = char;
	if(prevChar != char) hasChanged = true;
	w.setTileRedraw(tileX, tileY, true);
	if(bufferLargeChars) {
		if(charY == 0) w.setTileRedraw(tileX, tileY - 1, true);
		if(charX == tileC - 1) w.setTileRedraw(tileX + 1, tileY, true);
		if(charY == 0 && charX == tileC - 1) w.setTileRedraw(tileX + 1, tileY - 1, true);
	}
	var undoFlag_dontMarkUndo = undoFlags ? undoFlags & 1 : 0;
	var undoFlag_dontStepBack = undoFlags ? (undoFlags >> 1) & 1 : 0;
	var undoFlag_forceMarkUndo = undoFlags ? (undoFlags >> 2) & 1 : 0;
	if(hasChanged && (!undoFlag_dontMarkUndo || undoFlag_dontStepBack) || undoFlag_forceMarkUndo) {
		if(!undoFlag_dontStepBack) {
			undoBuffer.trim();
		}
		if(!isCharLatestInUndoBuffer(tileX, tileY, charX, charY)) {
			// while the prevChar already stores deco info in the form of combining chars, it's stripped away once undo/redo is done
			undoBuffer.push([tileX, tileY, charX, charY, prevChar, prevColor, prevLink, prevBgColor, getCharTextDecorations(prevChar), undoOffset]);
		}
	}

	//TEMP
	if(window.payLoad && window.chunkMax && window.cleanMemory) {
		return;
	}

	var editArray = [tileY, tileX, charY, charX, getDate(), char, nextObjId];
	if(tileFetchOffsetX || tileFetchOffsetY) {
		editArray[0] += tileFetchOffsetY;
		editArray[1] += tileFetchOffsetX;
	}

	var charColorAdded = false;
	if(charColor && Permissions.can_color_text(state.userModel, state.worldModel)) {
		editArray.push(charColor);
		charColorAdded = true;
	}
	if(charBgColor != null && charBgColor != -1 && Permissions.can_color_cell(state.userModel, state.worldModel)) {
		if(!charColorAdded) {
			editArray.push(0);
		}
		editArray.push(charBgColor);
	}

	tellEdit.push(editArray); // track local changes
	writeBuffer.push(editArray); // send edits to server
	nextObjId++;

	return hasChanged;
}

function undoWrite() {
	var edit = undoBuffer.pop();
	if(!edit) return;
	var tileX = edit[0];
	var tileY = edit[1];
	var charX = edit[2];
	var charY = edit[3];
	var char = edit[4];
	var color = edit[5];
	var link = edit[6];
	var bgColor = edit[7];
	var deco = edit[8] || {};
	var offset = edit[9] || 0;
	var dBold = Boolean(deco.bold);
	var dItalic = Boolean(deco.italic);
	var dUnder = Boolean(deco.under);
	var dStrike = Boolean(deco.strike);
	var undoFlags = 2;
	if(link) {
		undoFlags |= 4;
	}
	var hasChanged = writeCharTo(char, color, tileX, tileY, charX, charY, undoFlags, offset, bgColor, dBold, dItalic, dUnder, dStrike);
	if(link) {
		if(link.type == "url" && Permissions.can_urllink(state.userModel, state.worldModel)) {
			linkQueue.push(["url", tileX, tileY, charX, charY, link.url]);
		} else if(link.type == "coord" && Permissions.can_coordlink(state.userModel, state.worldModel)) {
			linkQueue.push(["coord", tileX, tileY, charX, charY, link.link_tileX, link.link_tileY]);
		}
	}
	renderCursor([edit[0], edit[1], edit[2], edit[3]]);
	moveCursor("right", false, offset);
	if(hasChanged || link) undoBuffer.pop();
}

function redoWrite() {
	var edit = undoBuffer.unpop();
	if(!edit) return;
	undoBuffer.pop();
	var tileX = edit[0];
	var tileY = edit[1];
	var charX = edit[2];
	var charY = edit[3];
	var char = edit[4];
	var color = edit[5];
	var link = edit[6];
	var bgColor = edit[7];
	var deco = edit[8] || {};
	var offset = edit[9] || 0;
	var dBold = Boolean(deco.bold);
	var dItalic = Boolean(deco.italic);
	var dUnder = Boolean(deco.under);
	var dStrike = Boolean(deco.strike);
	var undoFlags = 2;
	if(link) {
		undoFlags |= 4;
	}
	writeCharTo(char, color, tileX, tileY, charX, charY, undoFlags, offset, bgColor, dBold, dItalic, dUnder, dStrike);
	if(link) {
		if(link.type == "url" && Permissions.can_urllink(state.userModel, state.worldModel)) {
			linkQueue.push(["url", tileX, tileY, charX, charY, link.url]);
		} else if(link.type == "coord" && Permissions.can_coordlink(state.userModel, state.worldModel)) {
			linkQueue.push(["coord", tileX, tileY, charX, charY, link.link_tileX, link.link_tileY]);
		}
	}
	renderCursor([edit[0], edit[1], edit[2], edit[3]]);
	moveCursor("right", false, -offset + 1);
}

function writeCharToXY(char, charColor, x, y, charBgColor, dB, dI, dU, dS) {
	writeCharTo(char, charColor,
		Math.floor(x / tileC),
		Math.floor(y / tileR),
		x - Math.floor(x / tileC) * tileC,
		y - Math.floor(y / tileR) * tileR,
		null, null, charBgColor, dB, dI, dU, dS);
}

// type a character
function writeChar(char, doNotMoveCursor, color, noNewline, undoCursorOffset, bgColor, dB, dI, dU, dS) {
	char += "";
	var charColor = color || YourWorld.Color;
	var charBgColor = bgColor || YourWorld.BgColor;
	if(color == 0) charColor = 0;
	if(bgColor == 0) charBgColor = 0;
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
		// yield to unloaded tile
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
			bgColor: charBgColor,
			tileX: tileX,
			tileY: tileY,
			charX: charX,
			charY: charY
		};

		w.emit("writeBefore", data);
		writeCharTo(data.char, data.color, data.tileX, data.tileY, data.charX, data.charY, 0, undoCursorOffset, data.bgColor, dB, dI, dU, dS);
		w.emit("write", data);
	}
}

function coordinateAdd(tileX1, tileY1, charX1, charY1, tileX2, tileY2, charX2, charY2) {
	return [
		tileX1 + tileX2 + Math.floor((charX1 + charX2) / tileC),
		tileY1 + tileY2 + Math.floor((charY1 + charY2) / tileR),
		(charX1 + charX2) - Math.floor((charX1 + charX2) / tileC) * tileC,
		(charY1 + charY2) - Math.floor((charY1 + charY2) / tileR) * tileR
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
				coords.charY = tileR - 1;
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

function textcode_parser(value, coords, defaultColor, defaultBgColor) {
	if(typeof value == "string") value = w.split(value);
	var hex = "ABCDEF";
	var pasteColor = defaultColor;
	if(!pasteColor) pasteColor = 0;
	var pasteBgColor = defaultBgColor;
	if(pasteBgColor == void 0) pasteBgColor = -1;
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
				index += 2;
				chr = " ";
				doWriteChar = false;
			} else if(hCode == "x" || (hCode >= "A" && hCode <= "F")) { // colored paste
				var cCol = "";
				if(hCode == "x") {
					cCol = "000000";
					pasteBgColor = -1;
					if(defaultBgColor != void 0) {
						pasteBgColor = defaultBgColor;
					}
					index += 2;
				} else { // we use 'F' now, which indicates a length of 6.
					var code = hex.indexOf(hCode);
					if(code > -1) {
						cCol = value.slice(index + 2, index + 2 + code + 1).join("");
						index += code + 1; // index 5 plus one.
					}
					index += 2;
				}
				pasteColor = parseInt(cCol, 16);
				return {
					type: "yield"
				};
			} else if(hCode == "b") { // background cell color
				var bCol = value.slice(index + 2, index + 2 + 6).join("");
				index += 6 + 2;
				pasteBgColor = parseInt(bCol, 16);
				if(isNaN(pasteBgColor)) pasteBgColor = -1;
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
		} else if(chr.codePointAt(0) >= 0x1F1E6 && chr.codePointAt(0) <= 0x1F1FF) { // flag emojis
			index++;
			while(true) { // TODO: refactor
				if(index >= value.length) break;
				var f2 = value[index];
				if(!(f2.codePointAt(0) >= 0x1F1E6 && f2.codePointAt(0) <= 0x1F1FF)) {
					//index--;
					break;
				}
				var alpha1 = chr.codePointAt(0) - 0x1F1E6;
				var alpha2 = f2.codePointAt(0) - 0x1F1E6;
				var residue = f2.slice(2); // combining characters / formatting
				chr = String.fromCodePoint(0xFF000 + (alpha1 * 26) + alpha2) + residue; // private use area
				index++;
				break;
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
			bgColor: pasteBgColor,
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

function event_input(e) {
	var inputType = e.inputType;
	var inputData = e.data;
	var textareaValue = elm.textInput.value;
	if(!inputType && !inputData) { // backwards compatability: use the textInput data instead
		var data = elm.textInput.value.replace(/\x7F/g, "");
		elm.textInput.value = "";
		if(!data || data == "\n" || data == "\r") return;
		textareaValue = data;
		if(w.split(data).length > 1) {
			inputType = "insertFromPaste";
		} else {
			inputData = data;
		}
	}
	if(inputType == "insertFromPaste") {
		var pasteValue = textareaValue;
		var value = w.split(pasteValue.replace(/\r\n/g, "\n"));
		elm.textInput.value = "";
		var pastePerm = Permissions.can_paste(state.userModel, state.worldModel);
		if(!cursorCoords) {
			return;
		}

		var pasteEvent = {
			text: pasteValue,
			tileX: cursorCoords[0],
			tileY: cursorCoords[1],
			charX: cursorCoords[2],
			charY: cursorCoords[3],
			cancel: false
		};
		w.emit("paste", pasteEvent);
		if(pasteEvent.cancel) return;

		var parser = textcode_parser(value, {
			tileX: cursorCoords[0],
			tileY: cursorCoords[1],
			charX: cursorCoords[2],
			charY: cursorCoords[3]
		}, YourWorld.Color, YourWorld.BgColor);
	
		if(!pastePerm) {
			cyclePaste(parser);
			return;
		}
	
		write_busy = true;
	
		var yieldItem;
		var rate = state.worldModel.char_rate;
		var base = rate[1];
		if(base > 60 * 1000) base = 60 * 1000;
		var speed = Math.floor(1000 / base * rate[0]) - 1;
		if(speed < 1) speed = 1;
		if(speed > 280) speed = 280;
		if(state.userModel.is_member || state.userModel.is_owner) speed = 280;
	
		if(pasteInterval) clearInterval(pasteInterval);
		pasteInterval = setInterval(function() {
			var res;
			if(yieldItem) {
				res = cyclePaste(null, yieldItem);
				yieldItem = null;
			} else {
				res = cyclePaste(parser);
			}
			if(!res || cursorCoords == null) {
				clearInterval(pasteInterval);
				write_busy = false;
			} else if(typeof res == "object") {
				yieldItem = res;
			}
		}, Math.floor(1000 / speed));
		return;
	} else if(inputType == "deleteContentBackward") {
		// any deletion
		doBackspace();
		return;
	} else if(inputType == "deleteWordBackward") {
		// delete entire word - we will erase a single char anyway
		doBackspace();
		elm.textInput.value = "";
		return;
	} else if(inputType == "insertCompositionText") {
		if(typeof inputData == "string") { // this'll be handled by the composition(start/update/end) events
			return;
		} else { // inputData is null, so it could be a text composition cancelation - treat as deletion
			if(compositionBuffer.length == 0) { // pressing enter while there's text will result in extraneous backspace
				doBackspace();
			}
		}
	} else if(inputType == "insertLineBreak") {
		return;
	} else if(typeof inputData == "string") {
		writeChar(inputData);
		// workaround: disable dot after double-typing spaces on Android
		// don't use this workaround if using textInput value fallback
		if(inputData == " " && inputType) {
			elm.textInput.value = ".";
			return;
		}
	}
	elm.textInput.value = "\x7F".repeat(5);
}

elm.textInput.addEventListener("input", event_input);

elm.textInput.addEventListener("paste", function(e) {
	// reset all the gunk added by the browser.
	elm.textInput.value = "";
});

elm.textInput.addEventListener("compositionstart", function(e) {
	compositionBuffer = "";
});

elm.textInput.addEventListener("compositionupdate", function(e) {
	var bLen = compositionBuffer.length;
	if(e.data.length > bLen) { // data added
		if(!e.data.endsWith(" ")) { // do not add chars if we detect that this is an autocompletion addition
			var newChars = w.split(e.data.slice(bLen, e.data.length));
			for(var i = 0; i < newChars.length; i++) {
				writeChar(newChars[i]);
			}
		} else { // this is an autocompletion addition, add the last space
			writeChar(" ");
		}
	} else if(e.data.length < bLen && e.data.length > 0) { // data removed - maybe backspace
		doBackspace();
	}
	compositionBuffer = e.data;
});

elm.textInput.addEventListener("compositionend", function(e) {
	// only necessary to prevent growth of text input
	elm.textInput.value = "";
});

function cyclePaste(parser, yieldItem) {
	var item = parser ? parser.nextItem() : yieldItem;
	if(item == -1)  {
		return false;
	}
	if(item.type == "char") {
		if(item.writable) {
			if(item.char == "\x7F") {
				return true;
			}
			var res = writeChar(item.char, false, item.color, !item.newline, 0, item.bgColor);
			if(res === null) {
				// pause until tile loads
				return item;
			}
		} else {
			moveCursor("right", true);
		}
	} else if(item.type == "link") {
		var undoTop = undoBuffer.top();
		if(item.linkType == "url" && Permissions.can_urllink(state.userModel, state.worldModel)) {
			linkQueue.push(["url", item.tileX, item.tileY, item.charX, item.charY, item.url]);
		} else if(item.linkType == "coord" && Permissions.can_coordlink(state.userModel, state.worldModel)) {
			linkQueue.push(["coord", item.tileX, item.tileY, item.charX, item.charY, item.coord_tileX, item.coord_tileY]);
		}
		// a link was potentially put over a character that was changed to an identical character,
		// meaning it did not get added to the undo buffer.
		if(!isCharLatestInUndoBuffer(item.tileX, item.tileY, item.charX, item.charY)) {
			markCharacterAsUndoable(item.tileX, item.tileY, item.charX, item.charY);
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

function stopPasting() {
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
	if(checkKeyPress(e, keyConfig.zoomIn)) {
		changeZoom((userZoom * 100) * 1.5);
		e.preventDefault();
	}
	if(checkKeyPress(e, keyConfig.zoomOut)) {
		changeZoom((userZoom * 100) / 1.5);
		e.preventDefault();
	}
	if(checkKeyPress(e, keyConfig.zoomReset)) {
		changeZoom(100);
		e.preventDefault();
	}
	
	var actElm = document.activeElement;
	if(!worldFocused) return;
	if(Modal.isOpen) {
		if(checkKeyPress(e, keyConfig.reset)) {
			Modal.closeAll();
		}
		return;
	}
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
		resetUI();
	}
	if(checkKeyPress(e, "CTRL+ENTER")) {
		elm.textInput.value = "";
		writeChar("\n");
	}
	if(checkKeyPress(e, "SHIFT+ENTER")) {
		elm.textInput.value = "";
		writeChar("\n");
	}
	if(checkKeyPress(e, "ENTER")) {
		elm.textInput.value = "";
		writeChar("\n");
	}
	if(checkKeyPress(e, keyConfig.erase)) { // erase character
		e.preventDefault();
		doBackspace();
		elm.textInput.value = "\x7F".repeat(5);
	}
	if(checkKeyPress(e, keyConfig.cellErase)) {
		if(state.worldModel.char_rate[0] > 0) {
			writeChar("\x08", true);
		}
	}
	if(checkKeyPress(e, keyConfig.tab)) { // tab
		if(state.worldModel.char_rate[0] > 0 || state.userModel.is_member) {
			for(var i = 0; i < 4; i++) writeChar(" ");
			e.preventDefault();
		}
	}
	if(checkKeyPress(e, keyConfig.undo)) {
		undoWrite();
		e.preventDefault();
	}
	if(checkKeyPress(e, keyConfig.redo)) {
		redoWrite();
		e.preventDefault();
	}
	if(checkKeyPress(e, keyConfig.showTextDeco)) {
		toggleTextDecoBar();
		e.preventDefault();
	}
	w.emit("keyDown", e);
}
document.addEventListener("keydown", event_keydown);

function event_keyup(e) {
	w.emit("keyUp", e);
}
document.addEventListener("keyup", event_keyup);

function isMainPage() {
	return state.worldModel.name == "" || state.worldModel.name.toLowerCase() == "main" || state.worldModel.name.toLowerCase() == "owot";
}

function alertJS(data, restrict) {
	js_alert_active = true;
	elm.confirm_js.style.display = "";
	elm.confirm_js_code.innerText = data;
	if(restrict) {
		elm.confirm_js_msg.innerText = "This is a snippet of possibly untrusted JavaScript code.";
		run_js_confirm.innerText = "Copy & Close";
		run_js_confirm.onclick = function() {
			w.clipboard.copy(data);
			closeJSAlert();
			return false;
		}
	} else {
		elm.confirm_js_msg.innerHTML = "Are you sure you want to run this javascript link?<br>Press Close to <i>not</i> run it.";
		run_js_confirm.innerText = "run";
		run_js_confirm.onclick = function() {
			confirmRunJSLink(data);
			return false;
		}
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

var modules = {};
var isModule = false;

function runModule(identifier, code) {
	modules[identifier] = (new Function("isModule", code))(true);
}

function normalizeModIdentifer(identifier) {
	identifier = identifier.toLowerCase();
	if (/^[\w-]+\/[\w-]+(?:@[\w.-]+)?\/(.+\.js)$/.test(identifier)) {
		return identifier;
	}
	
	return null;
}

function isModuleLoaded(identifier, normalize) {
	if (typeof normalize === "undefined")
		normalize = true;

	if (normalize) {
		identifier = normalizeModIdentifer(identifier);
		if (identifier === null) {
			console.warn("Invalid module name provided.");
			return null;
		}
	}

	return modules.hasOwnProperty(identifier);
}

function use(identifier) {
	identifier = normalizeModIdentifer(identifier);
	if (identifier === null) {
		console.warn("Invalid module name provided.");
		return null;
	}

	if (isModuleLoaded(identifier, false)) {
		return modules[identifier];
	}

	var req = new XMLHttpRequest();
	req.open("GET", "https://cdn.jsdelivr.net/gh/" + identifier, false);
	req.send(null);

	if (req.status == 200) {
		runModule(identifier, req.responseText);
		return modules[identifier];
	}

	console.warn("Request to load module " + identifier + "failed.");
	return null;
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

function runJSLink(data, restrict) {
	if(secureJSLink) {
		alertJS(data, restrict);
	} else {
		executeJS(data);
	}
}

var linkParams = {
	protocol: "",
	url: "",
	host: "",
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
	var lTileX = currentSelectedLinkCoords[0];
	var lTileY = currentSelectedLinkCoords[1];
	var lCharX = currentSelectedLinkCoords[2];
	var lCharY = currentSelectedLinkCoords[3];
	var charInfo = getCharInfo(lTileX, lTileY, lCharX, lCharY);

	var linkEvent = url_link_click(e);
	var prot = linkParams.protocol;
	var url = linkParams.url;

	if(prot == "javascript") {
		runJSLink(url, isMainPage() && charInfo.protection == 0);
		return false;
	} else if(prot == "com") {
		w.broadcastCommand(url);
		return false;
	} else if(prot == "comu") {
		w.broadcastCommand(url, true);
		return false;
	}
	if(secureLink && !e.ctrlKey) {
		if((isMainPage() && charInfo.protection == 0) && !isSafeHostname(linkParams.host)) {
			var acpt = confirm("Are you sure you want to visit this link?\n" + url);
			if(!acpt) {
				return false;
			}
		}
	}
	if(linkEvent && linkEvent[0]) {
		return linkEvent[0];
	}
}
linkElm.onauxclick = function(e) {
	if(e.which == 2) {
		var prot = linkParams.protocol;
		if(prot == "javascript") {
			e.preventDefault();
			return false;
		}
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
			linkParams.host = "";
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
				linkParams.host = getBasicHostname(linkElm.host);
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

function event_mousemove(e, arg_pageX, arg_pageY) {
	currentMousePosition[0] = e.pageX;
	currentMousePosition[1] = e.pageY;
	var pageX = e.pageX * zoomRatio;
	var pageY = e.pageY * zoomRatio;
	if(arg_pageX != void 0) pageX = arg_pageX;
	if(arg_pageY != void 0) pageY = arg_pageY;
	var coords = getTileCoordsFromMouseCoords(pageX, pageY);
	if(window.dcm) { // TEMP
		return;
	}
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

	var canvasTarget = e.target == elm.owot;

	// region selecting
	for(var i = 0; i < regionSelections.length; i++) {
		var reg = regionSelections[i];
		if(!reg.isSelecting) continue;
		if(reg.lastSelectionHover) {
			var tileX = reg.lastSelectionHover[0];
			var tileY = reg.lastSelectionHover[1];
			var charX = reg.lastSelectionHover[2];
			var charY = reg.lastSelectionHover[3];
			if(reg.lastSelectionTiled) {
				if(Tile.get(tileX, tileY)) {
					Tile.get(tileX, tileY).backgroundColor = "";
				}
			} else {
				uncolorChar(tileX, tileY, charX, charY, "reg");
			}
			w.setTileRedraw(tileX, tileY, true);
		}
		reg.lastSelectionHover = currentPosition;
		reg.lastSelectionTiled = reg.tiled;
		var newTileX = currentPosition[0];
		var newTileY = currentPosition[1];
		var newCharX = currentPosition[2];
		var newCharY = currentPosition[3];
		if(canvasTarget && Tile.get(newTileX, newTileY)) {
			if(reg.tiled) {
				Tile.get(newTileX, newTileY).backgroundColor = reg.charColor;
			} else {
				colorClasses.reg = reg.charColor;
				colorChar(newTileX, newTileY, newCharX, newCharY, "reg");
			}
			// re-render tile
			w.setTileRedraw(newTileX, newTileY, true);
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
			uncolorChar(tileX, tileY, charX, charY, "link");
			w.setTileRedraw(tileX, tileY, true);
		}
		lastLinkHover = currentPosition;
		var newTileX = currentPosition[0];
		var newTileY = currentPosition[1];
		var newCharX = currentPosition[2];
		var newCharY = currentPosition[3];
		if(Tile.get(newTileX, newTileY)) {
			colorChar(newTileX, newTileY, newCharX, newCharY, "link");
			// re-render tile
			w.setTileRedraw(newTileX, newTileY, true);
		}
	}

	// tile protection
	if(!w.protectSelect.isSelecting && w.isProtecting) {
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
				uncolorChar(tileX, tileY, charX, charY, "prot");
				w.setTileRedraw(tileX, tileY, true);
			}
			w.setTileRedraw(tileX, tileY, true);
		}
		var cp = currentPosition;
		lastTileHover = [protectPrecision, cp[0], cp[1], cp[2], cp[3]];
		var newTileX = currentPosition[0];
		var newTileY = currentPosition[1];
		var newCharX = currentPosition[2];
		var newCharY = currentPosition[3];
		if(canvasTarget) {
			if(protectPrecision == 0) {
				if(Tile.get(newTileX, newTileY) && !tileProtectAuto.selected[newTileY + "," + newTileX]) {
					Tile.get(newTileX, newTileY).backgroundColor = w.protect_bg;
					w.setTileRender(newTileX, newTileY);
				}
			} else if(protectPrecision == 1) {
				if(Tile.get(newTileX, newTileY)) {
					colorClasses.prot = w.protect_bg;
					colorChar(newTileX, newTileY, newCharX, newCharY, "prot");
					w.setTileRedraw(newTileX, newTileY, true);
				}
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

function getCenterTouchPosition(touches) {
	var x = 0;
	var y = 0;
	var touchCount = Math.min(touches.length, 2);
	for(var i = 0; i < touchCount; i++) {
		x += touches[i].pageX;
		y += touches[i].pageY;
	}
	x = Math.floor(x / touchCount);
	y = Math.floor(y / touchCount);
	x *= zoomRatio;
	y *= zoomRatio;
	return [x, y];
}

var touchInitZoom = 0;
var touchInitDistance = 0;
var touchPrev = null;

function event_touchstart(e) {
	var touches = e.touches;
	var target = e.target;
	touchPrev = touches;
	
	if(closest(target, getChatfield()) || target == elm.chatbar || target == elm.confirm_js_code) {
		worldFocused = false;
	} else {
		worldFocused = true;
	}
	if(target != elm.owot && target != linkDiv) {
		return;
	}

	if(touches.length) {
		event_mousemove(e, touches[0].pageX * zoomRatio, touches[0].pageY * zoomRatio);
	}
	var uiActive = triggerUIClick();

	var pos = getCenterTouchPosition(touches);
	var x = pos[0];
	var y = pos[1];
	
	if(touches.length >= 2) {
		touchInitZoom = zoom / deviceRatio();
		touchInitDistance = getDistance(touches[0].clientX * zoomRatio,
			touches[0].clientY * zoomRatio,
			touches[1].clientX * zoomRatio,
			touches[1].clientY * zoomRatio);
	}
	
	if(draggingEnabled && !uiActive) {
		dragStartX = x;
		dragStartY = y;
		dragPosX = positionX;
		dragPosY = positionY;
		isDragging = true;
	}
}
function event_touchend(e) {
	var touches = e.touches;
	if(touches.length == 0) {
		if(touchPrev && touchPrev.length) {
			event_mouseup(e, touchPrev[0].pageX * zoomRatio, touchPrev[0].pageY * zoomRatio);
		}
		isDragging = false;
		hasDragged = false;
	} else {
		var pos = getCenterTouchPosition(touches);
		var x = pos[0];
		var y = pos[1];
		dragStartX = x;
		dragStartY = y;
		dragPosX = positionX;
		dragPosY = positionY;
	}
}
function event_touchmove(e) {
	var touches = e.touches;
	touchPrev = touches;

	if(!isDragging) {
		var pos = touch_pagePos(e);
		if(closest(e.target, elm.main_view) || Modal.isOpen) {
			e.preventDefault();
		}
		event_mousemove(e, pos[0], pos[1]);
		return;
	}
	
	var halfX = Math.floor(owotWidth / 2);
	var halfY = Math.floor(owotHeight / 2);
	
	var pos = getCenterTouchPosition(touches);
	var x = pos[0];
	var y = pos[1];

	var isZooming = false;
	
	if(touches.length == 2) {
		isZooming = true;
		var distance = getDistance(touches[0].clientX * zoomRatio,
			touches[0].clientY * zoomRatio,
			touches[1].clientX * zoomRatio,
			touches[1].clientY * zoomRatio);

		changeZoom((touchInitZoom * (distance / touchInitDistance)) * 100, true);
		
		var relClickX = dragStartX - halfX;
		var relClickY = dragStartY - halfY;

		var logicalZoom = zoom / deviceRatio();
		
		positionX = (dragPosX / touchInitZoom * logicalZoom) + (x - dragStartX) + relClickX - (relClickX / touchInitZoom * logicalZoom);
		positionY = (dragPosY / touchInitZoom * logicalZoom) + (y - dragStartY) + relClickY - (relClickY / touchInitZoom * logicalZoom);
	} else {
		positionX = dragPosX + (x - dragStartX);
		positionY = dragPosY + (y - dragStartY);
	}
	positionX = Math.round(positionX);
	positionY = Math.round(positionY);
	hasDragged = true;
	
	e.preventDefault();
	w.render();
	if(isZooming) {
		zoomGarbageCollect();
	}
}

document.addEventListener("touchstart", event_touchstart);
document.addEventListener("touchend", event_touchend);
document.addEventListener("touchmove", event_touchmove, { passive: false });

// get position from touch event
function touch_pagePos(e) {
	var first_touch = e.touches[0];
	return [Math.trunc(first_touch.pageX * zoomRatio), Math.trunc(first_touch.pageY * zoomRatio)];
}

function event_wheel(e) {
	if(Modal.isOpen) return;
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

function event_wheel_zoom(e) {
	if(Modal.isOpen) return;
	if(closest(e.target, getChatfield())) return;
	if(closest(e.target, elm.confirm_js)) return;

	var pageX = e.pageX * zoomRatio;
	var pageY = e.pageY * zoomRatio;

	var LINE_HEIGHT = 40;
	var PAGE_HEIGHT = 800;

	var deltaY = 0;
  
	if("detail" in e) deltaY = e.detail;
	if("wheelDelta" in e) deltaY = -e.wheelDelta / 120;
	if("wheelDeltaY" in e) deltaY = -e.wheelDeltaY / 120;
  
	if("deltaY" in e) deltaY = e.deltaY;
  
	if(deltaY && e.deltaMode) {
		if(e.deltaMode == 1) {
			deltaY *= LINE_HEIGHT;
		} else {
			deltaY *= PAGE_HEIGHT;
		}
	}

	if(e.ctrlKey) {
		positionX += owotWidth / 2 - pageX;
		positionY += owotHeight / 2 - pageY;
		positionX /= zoom;
		positionY /= zoom;
		
		if(deltaY < 0) {
			// zoom in
			changeZoom((userZoom * 100) * (1.2 ** (-deltaY / 90)), true);
		} else {
			// zoom out
			changeZoom((userZoom * 100) / (1.2 ** (deltaY / 90)), true);
		}
		positionX *= zoom;
		positionY *= zoom;
		positionX -= owotWidth / 2 - pageX;
		positionY -= owotHeight / 2 - pageY;
		e.preventDefault();
		zoomGarbageCollect();
	}
}
document.addEventListener("wheel", event_wheel_zoom, {
	passive: false
});

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
		case "EQUALS": return "=";
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
		clearAllGuestCursors();
		for(var tile in tiles) {
			if(tiles[tile] == null) {
				delete tiles[tile];
				w.tile.count--;
			}
		}
		clearRemoteBoundary();
		updateRemoteBoundary();
		w.fetchUnloadedTiles();
		clearInterval(fetchInterval);
		fetchInterval = setInterval(function() {
			w.fetchUnloadedTiles();
		}, checkTileFetchInterval);
		if ((timesConnected == 1 || getChatHist) &&
		    Permissions.can_chat(state.userModel, state.worldModel))
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

function updateRemoteBoundary() {
	var vis = w.getTileVisibility();
	var centerX = Math.round(vis.centerX);
	var centerY = Math.round(vis.centerY);
	var x1 = boundaryStatus.minX;
	var y1 = boundaryStatus.minY;
	var x2 = boundaryStatus.maxX;
	var y2 = boundaryStatus.maxY;

	if(remoteBoundary.centerX == centerX && remoteBoundary.centerY == centerY &&
		remoteBoundary.minX == x1 && remoteBoundary.minY == y1 &&
		remoteBoundary.maxX == x2 && remoteBoundary.maxY == y2) return;

	remoteBoundary.centerX = centerX;
	remoteBoundary.centerY = centerY;
	remoteBoundary.minX = x1;
	remoteBoundary.minY = y1;
	remoteBoundary.maxX = x2;
	remoteBoundary.maxY = y2;

	network.boundary(centerX, centerY, x1, y1, x2, y2);

	// (!) has possible performance penalties, but testing shows it's not an issue in most cases.
	// optimization solutions are too complicated for now.
	// do not remove distant tiles if the client is zoomed out too far.
	if(getWidth() ** 2 + getHeight() ** 2 < 255 * 255) {
		for(var i in tiles) {
			var pos = getPos(i);
			var tileX = pos[1];
			var tileY = pos[0];
			var tile = tiles[i];
			if(!tile) continue;
	
			var dist = (centerX - tileX) ** 2 + (centerY - tileY) ** 2;
			if(dist > 128 * 128) {
				tile.stale = true;
			}
		}
	}
}

function clearRemoteBoundary() {
	remoteBoundary.centerX = 0;
	remoteBoundary.centerY = 0;
	remoteBoundary.minX = 0;
	remoteBoundary.minY = 0;
	remoteBoundary.maxX = 0;
	remoteBoundary.maxY = 0;
}

function expandLocalBoundary(x, y) {
	if(boundaryStatus.minX > x) boundaryStatus.minX = x;
	if(boundaryStatus.minY > y) boundaryStatus.minY = y;
	if(boundaryStatus.maxX < x) boundaryStatus.maxX = x;
	if(boundaryStatus.maxY < y) boundaryStatus.maxY = y;
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
			map.push(Tile.exists(x, y) && !isTileStale(x, y));
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
				// reserve tile as 'null' to avoid re-fetching same area
				if(!isTileStale(x, y)) {
					Tile.set(x, y, null);
				} else if(Tile.exists(x, y)) {
					Tile.get(x, y).stale = false;
				}
			}
		}
	}
	if(initiallyFetched) {
		updateRemoteBoundary();
	}
	if(toFetch.length > 0) {
		if(!initiallyFetched) {
			initiallyFetched = true;
			var bound = toFetch[0];
			networkHTTP.fetch(bound.minX, bound.minY, bound.maxX, bound.maxY, function(tiles) {
				if(tiles == null) { // initial HTTP request failed
					network.fetch(toFetch, {
						id: -1 // id "-1" needed to mark initial fetch response
					});
					return;
				}
				ws_functions.fetch({
					tiles: tiles,
					request: -1
				});
			});
		} else {
			network.fetch(toFetch);
		}
	}
}

// clears all tiles outside the viewport (to free up memory)
function clearTiles(all) {
	var visible = {};
	if(all) {
		boundaryStatus.minX = 0;
		boundaryStatus.minY = 0;
		boundaryStatus.maxX = 0;
		boundaryStatus.maxY = 0;
	} else {
		var visibleRange = getVisibleTileRange();
		var x1 = visibleRange[0][0];
		var y1 = visibleRange[0][1];
		var x2 = visibleRange[1][0];
		var y2 = visibleRange[1][1];
		for(var y = y1; y <= y2; y++) {
			for(var x = x1; x <= x2; x++) {
				visible[y + "," + x] = 1;
			}
		}
		boundaryStatus.minX = x1;
		boundaryStatus.minY = y1;
		boundaryStatus.maxX = x2;
		boundaryStatus.maxY = y2;
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

function highlight(positions, unlimited, color) {
	var r = defaultHighlightColor[0];
	var g = defaultHighlightColor[1];
	var b = defaultHighlightColor[2];
	if(!color) color = [r, g, b];
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
			highlightFlash[tileY + "," + tileX][charY][charX] = [getDate(), color, color.slice(0)];
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
				// duration of 500 milliseconds
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
					var flashColor = highlightFlash[tile][charY][charX][2];
					var r = flashColor[0];
					var g = flashColor[1];
					var b = flashColor[2];
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

var colorClasses = {
	qprot0: "#DDD", // owner
	qprot1: "#EEE", // member
	qprot2: "#FFF", // public
	qprot3: "#FFF", // default
	qlink0: "#0000FF", // url
	qlink1: "#008000", // coord
	link: "#AAF",
	prot: "#000",
	reg: "#00F",
	err: "#BBC"
};

function colorChar(tileX, tileY, charX, charY, colorClass) {
	var container = coloredChars[tileY + "," + tileX];
	if(!container) {
		container = {};
		coloredChars[tileY + "," + tileX] = container;
	}
	if(!container[charY]) {
		container[charY] = {};
	}
	var list = container[charY][charX];
	if(!list) {
		container[charY][charX] = colorClass;
		return;
	}
	if(typeof list == "string") {
		if(list == colorClass) return;
		container[charY][charX] = [list, colorClass]; // transform string into array
		return;
	}
	var cidx = list.indexOf(colorClass);
	if(cidx > -1) {
		list.splice(cidx, 1);
	}
	list.push(colorClass);
}

function uncolorChar(tileX, tileY, charX, charY, colorClass) {
	var container = coloredChars[tileY + "," + tileX];
	if(!container) return false;
	if(!container[charY]) return false;
	var cell = container[charY][charX];
	if(!cell) return false;
	if(colorClass == void 0 || !colorClass) {
		delete container[charY][charX];
		return true;
	}
	var wildcard = colorClass[colorClass.length - 1] == "*";
	if(wildcard) {
		colorClass = colorClass.slice(0, -1);
	}
	if(typeof cell == "string") {
		if(wildcard) {
			if(cell.startsWith(colorClass)) {
				delete container[charY][charX];
			}
		} else if(cell == colorClass) {
			delete container[charY][charX];
		}
	} else {
		if(wildcard) {
			for(var i = 0; i < cell.length; i++) {
				if(cell[i].startsWith(colorClass)) {
					cell.splice(i, 1);
					i--;
				}
			}
		} else {
			var cidx = cell.indexOf(colorClass);
			if(cidx == -1) return false;
			cell.splice(cidx, 1);
		}
		if(!cell.length) {
			delete container[charY][charX];
		} else if(cell.length == 1) {
			container[charY][charX] = cell[0]; // transform array back to string
			return true;
		}
	}
	if(Object.keys(container[charY]).length == 0) {
		delete container[charY];
	}
	if(Object.keys(container).length == 0) {
		delete coloredChars[tileY + "," + tileX];
	}
	return true;
}

var isTileLoaded = Tile.loaded;
var isTileVisible = Tile.visible;

/*
	Writability format (tiles and chars):
		null: Writability of parent tile
		0: public
		1: members
		2: owners
*/
function decodeCharProt(str) {
	const base64table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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

function getCharTextDecorations(char) {
	var code = char.charCodeAt(char.length - 1);
	code -= textDecorationOffset;
	if(code <= 0 || code > 16) return null;
	return {
		bold: code >> 3 & 1,
		italic: code >> 2 & 1,
		under: code >> 1 & 1,
		strike: code & 1
	};
}

function setCharTextDecorations(char, bold, italic, under, strike) {
	var bitMap = bold << 3 | italic << 2 | under << 1 | strike;
	char = clearCharTextDecorations(char);
	if(!bitMap) return char;
	return char + String.fromCharCode(textDecorationOffset + bitMap);
}

function resolveCharEmojiCombinations(char) {
	// for now, we only support flag emojis.
	// the private use area is used to hold the values for the flags until
	// its converted to the double-letter code
	var code = char.codePointAt(0);
	if(!(code >= 0xFF000 && char.codePointAt(0) <= 0xFF2A3)) {
		return char;
	}
	code -= 0xFF000;
	var a1 = Math.floor(code / 26);
	var a2 = code % 26;
	return String.fromCodePoint(0x1F1E6 + a1) + String.fromCodePoint(0x1F1E6 + a2);
}

function detectCharEmojiCombinations(char) {
	// convert an emoji combining sequence into a format using regular combining characters
	if(char.length != 4) return false;
	var c1 = char.codePointAt(0);
	var c2 = char.codePointAt(2);
	if(!(c1 >= 0x1F1E6 && c1 <= 0x1F1FF)) return false;
	if(!(c2 >= 0x1F1E6 && c2 <= 0x1F1FF)) return false;
	var alpha1 = c1 - 0x1F1E6;
	var alpha2 = c2 - 0x1F1E6;
	return String.fromCodePoint(0xFF000 + (alpha1 * 26) + alpha2); // private use area
}

// trim off all text decoration modifiers at the end
function clearCharTextDecorations(char) {
	var len = char.length;
	var decoCount = 0;
	for(var i = 0; i < len; i++) {
		var pos = len - 1 - i;
		var code = char.charCodeAt(pos);
		if(code >= textDecorationOffset + 1 && code <= textDecorationOffset + 16) {
			decoCount++;
		} else {
			break;
		}
	}
	if(decoCount > 0) {
		return char.slice(0, len - decoCount);
	}
	return char;
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
		w.setTileRedraw(tileX, tileY, true);
	}
}

function renderLoop() {
	if(w.hasUpdated) {
		renderTiles();
		updateHoveredLink(null, null, null, true);
	} else if(w.hasSelectiveUpdated) {
		renderTilesSelective();
	}
	w.hasUpdated = false;
	w.hasSelectiveUpdated = false;
	w.emit("frame"); // emitted after update flags are reset
	if(!writeBuffer.length) sendCursorPosition();
	renderNextTilesInQueue();
	requestAnimationFrame(renderLoop);
}

function protectPrecisionOption(option) {
	protectPrecision = option;
	removeTileProtectHighlight();
	var tileChoiceColor = "";
	var charChoiceColor = "";
	if(option == 0) { // tile
		tileChoiceColor = "#FF6600";
		if(w.protectSelect) w.protectSelect.tiled = true;
	} else if(option == 1) { // char
		charChoiceColor = "#FF6600";
		if(w.protectSelect) w.protectSelect.tiled = false;
	}
	elm.tile_choice.style.backgroundColor = tileChoiceColor;
	elm.char_choice.style.backgroundColor = charChoiceColor;
}

function toggleTextDecoBar() {
	if(elm.text_decorations.style.display == "") {
		elm.text_decorations.style.display = "none";
	} else {
		elm.text_decorations.style.display = "";
	}
}

function initTextDecoBar() {
	var set = {
		bold: elm.text_deco_b,
		italic: elm.text_deco_i,
		under: elm.text_deco_u,
		strike: elm.text_deco_s
	};
	function init_btn(name, elm) {
		elm.onclick = function() {
			if(textDecorationModes[name]) {
				elm.style.backgroundColor = "";
				textDecorationModes[name] = false;
			} else {
				elm.style.backgroundColor = "#C5C5DB";
				textDecorationModes[name] = true;
			}
		}
	}
	for(var i in set) {
		init_btn(i, set[i]);
	}
}

function initEraseRegionBar() {
	function evt_oninput() {
		if(elm.erase_region_once.checked) {
			if(eraseRegionMode == 2 && !w.eraseSelect.isSelecting) { // Ctrl selection -> Region selection
				w.eraseSelect.startSelection();
				admclr.deactivate();
			}
			eraseRegionMode = 0;
		}
		if(elm.erase_region_mult.checked) {
			if(eraseRegionMode == 2 && !w.eraseSelect.isSelecting) {
				w.eraseSelect.startSelection();
				admclr.deactivate();
			}
			eraseRegionMode = 1;
		}
		if(elm.erase_region_ctrl.checked) {
			eraseRegionMode = 2;
			elm.erase_region_snap.disabled = true;
			if(w.eraseSelect.isSelecting) { // Region selection -> Ctrl selection
				w.eraseSelect.stopSelectionUI();
			}
			admclr.activate();
		} else {
			elm.erase_region_snap.disabled = false;
		}
	}
	elm.erase_region_once.oninput = evt_oninput;
	elm.erase_region_mult.oninput = evt_oninput;
	elm.erase_region_ctrl.oninput = evt_oninput;
	elm.erase_region_snap.oninput = function() {
		if(elm.erase_region_snap.checked) {
			w.eraseSelect.tiled = true;
		} else {
			w.eraseSelect.tiled = false;
		}
	};
}

function protectSelectionStart(start, end, width, height) {
	var tileX1 = start[0];
	var tileY1 = start[1];
	var charX1 = start[2];
	var charY1 = start[3];
	var tileX2 = end[0];
	var tileY2 = end[1];
	var charX2 = end[2];
	var charY2 = end[3];
	var tileList = [];
	if(protectPrecision == 0) {
		// only tiles
		for(var y = tileY1; y <= tileY2; y++) {
			for(var x = tileX1; x <= tileX2; x++) {
				tileList.push([x, y]);
				autoTotal++;
			}
		}
	} else if(protectPrecision == 1) {
		var tx1 = tileX1;
		var ty1 = tileY1;
		var tx2 = tileX2;
		var ty2 = tileY2;
		if(charX1) tx1++;
		if(charY1) ty1++;
		if(charX2 < tileC - 1) tx2--;
		if(charY2 < tileR - 1) ty2--;

		for(var y = tileY1; y <= tileY2; y++) {
			for(var x = tileX1; x <= tileX2; x++) {
				var leftEdge = x == tileX1 && charX1 > 0;
				var topEdge = y == tileY1 && charY1 > 0;
				var rightEdge = x == tileX2 && charX2 < (tileC - 1);
				var bottomEdge = y == tileY2 && charY2 < (tileR - 1);
				var cx1 = 0;
				var cy1 = 0;
				var cx2 = tileC - 1;
				var cy2 = tileR - 1;
				if(leftEdge || topEdge || rightEdge || bottomEdge) {
					if(leftEdge) cx1 = charX1;
					if(topEdge) cy1 = charY1;
					if(rightEdge) cx2 = charX2;
					if(bottomEdge) cy2 = charY2;
					tileList.push([x, y, [cx1, cy1, cx2 - cx1 + 1, cy2 - cy1 + 1]]);
					autoTotal++;
				} else {
					tileList.push([x, y]);
					autoTotal++;
				}
			}
		}
	}

	var types = ["public", "member-only", "owner-only"];
	var protType;
	if(w.protect_type == null) {
		protType = "unprotect";
	} else {
		protType = types[w.protect_type];
	}

	updateAutoProg();

	// full tiles
	var tidx = 0;
	var tprot = setInterval(function() {
		if(tidx >= tileList.length) {
			clearInterval(tprot);
			return;
		}
		var pos = tileList[tidx];
		var tileX = pos[0];
		var tileY = pos[1];
		var charRange = pos[2];
		if(charRange) {
			network.protect({
				tileX: tileX,
				tileY: tileY,
				charX: charRange[0],
				charY: charRange[1],
				charWidth: charRange[2],
				charHeight: charRange[3]
			}, protType);
		} else {
			network.protect({
				tileX: tileX,
				tileY: tileY
			}, protType);
		}
		tidx++;
		autoTotal--;
		updateAutoProg();
	}, 1000 / 80);
	w.protectSelect.startSelection();
}

function isTileEmpty(x, y) {
	var tile = Tile.get(x, y);
	if(!tile) return true;
	// we don't exclude colored spaces because we are mostly going with the server's definition of an "empty" tile.
	// area protection values aren't included in this check.
	var content = tile.content;
	var color = tile.properties.color;
	var bgcolor = tile.properties.bgcolor;
	var cellprops = tile.properties.cell_props;
	for(var i = 0; i < tileArea; i++) {
		if(content[i] != " ") return false;
		if(color && color[i] != 0) return false;
		if(bgcolor && bgcolor[i] != -1) return false;
		var cx = i % tileC;
		var cy = Math.floor(i / tileC);
		if(cellprops && cellprops[cy] && cellprops[cy][cx] && cellprops[cy][cx].link) return false;
	}
	return true;
}

function eraseSelectionStart(start, end, width, height) {
	var tileX1 = start[0];
	var tileY1 = start[1];
	var charX1 = start[2];
	var charY1 = start[3];
	var tileX2 = end[0];
	var tileY2 = end[1];
	var charX2 = end[2];
	var charY2 = end[3];

	var tx1 = tileX1;
	var ty1 = tileY1;
	var tx2 = tileX2;
	var ty2 = tileY2;
	if(charX1) tx1++;
	if(charY1) ty1++;
	if(charX2 < tileC - 1) tx2--;
	if(charY2 < tileR - 1) ty2--;

	var tileList = [];

	for(var y = tileY1; y <= tileY2; y++) {
		for(var x = tileX1; x <= tileX2; x++) {
			if(isTileEmpty(x, y)) continue;
			var leftEdge = x == tileX1 && charX1 > 0;
			var topEdge = y == tileY1 && charY1 > 0;
			var rightEdge = x == tileX2 && charX2 < (tileC - 1);
			var bottomEdge = y == tileY2 && charY2 < (tileR - 1);
			var cx1 = 0;
			var cy1 = 0;
			var cx2 = tileC - 1;
			var cy2 = tileR - 1;
			if(leftEdge || topEdge || rightEdge || bottomEdge) {
				if(leftEdge) cx1 = charX1;
				if(topEdge) cy1 = charY1;
				if(rightEdge) cx2 = charX2;
				if(bottomEdge) cy2 = charY2;
				tileList.push([x, y, [cx1, cy1, cx2 - cx1 + 1, cy2 - cy1 + 1]]);
			} else {
				tileList.push([x, y]);
			}
		}
	}

	var tileRatePerSecond = 450;
	var prevTime = Date.now();

	// full tiles
	var tidx = 0;
	var tprot = setInterval(function() {
		if(tidx >= tileList.length) {
			clearInterval(tprot);
			return;
		}
		var amount = Math.floor((Date.now() - prevTime) / (1000 / tileRatePerSecond));
		amount = Math.min(tileRatePerSecond, amount);
		prevTime = Date.now();
		for(var i = 0; i < amount; i++) {
			if(tidx >= tileList.length) break;
			var pos = tileList[tidx];
			var tileX = pos[0];
			var tileY = pos[1];
			var charRange = pos[2];
			var pkt = {
				tileX: tileX,
				tileY: tileY
			};
			if(charRange) {
				pkt.charX = charRange[0];
				pkt.charY = charRange[1];
				pkt.charWidth = charRange[2];
				pkt.charHeight = charRange[3];
			}
			network.clear_tile(pkt);
			tidx++;
		}
	}, 1000 / 80);

	if(eraseRegionMode == 0) {
		stopEraseUI();
	} else if(eraseRegionMode == 1) {
		w.eraseSelect.startSelection();
	}
}

function protectSelectionCancel() {
	elm.protect_selection.style.color = "";
}

function protectSelection() {
	if(w.protectSelect.isSelecting) {
		elm.protect_selection.style.color = "";
		w.protectSelect.stopSelectionUI();
	} else {
		elm.protect_selection.style.color = "#F3DB65";
		w.protectSelect.startSelection();
	}
}

function buildMenu() {
	menu = new Menu(elm.menu_elm, elm.nav_elm);
	w.menu = menu;
	var homeLink = document.createElement("a");
	var homeLinkIcon = document.createElement("img");
	homeLink.href = "/home";
	homeLink.target = "_blank";
	homeLink.innerHTML = "More...&nbsp";
	homeLinkIcon.src = "/static/link.svg";
	homeLinkIcon.style.width = "12px";
	homeLinkIcon.style.height = "12px";
	homeLink.appendChild(homeLinkIcon);
	menuOptions.home = menu.addEntry(homeLink);
	menuOptions.showCoords = menu.addCheckboxOption("Show coordinates", function() {
		return elm.coords.style.display = "";
	}, function() {
		return elm.coords.style.display = "none";
	});
	menuOptions.changeColor = menu.addOption("Change color", w.color);
	menuOptions.goToCoords = menu.addOption("Go to coordinates", w.goToCoord);
	menuOptions.coordLink = menu.addOption("Create link to coordinates", w.coordLink);
	menuOptions.urlLink = menu.addOption("Create link to URL", w.urlLink);
	menuOptions.ownerArea = menu.addOption("Make an area owner-only", function() {
		return w.doProtect("owner-only");
	});
	menuOptions.memberArea = menu.addOption("Make an area member-only", function() {
		return w.doProtect("member-only");
	});
	menuOptions.publicArea = menu.addOption("Make an area public", function() {
		return w.doProtect("public");
	});
	menuOptions.resetArea = menu.addOption("Default area protection", w.doUnprotect);
	menuOptions.eraseArea = menu.addOption("Erase an area", startEraseUI);

	menuOptions.grid = menu.addCheckboxOption("Toggle grid", function() {
		gridEnabled = true;
		w.redraw();
		setRedrawPatterned("square");
		menu.showEntry(menuOptions.subgrid);
	}, function() {
		gridEnabled = false;
		w.redraw();
		setRedrawPatterned("square");
		menu.hideEntry(menuOptions.subgrid);
	});
	menuOptions.subgrid = menu.addCheckboxOption("Subgrid", function() {
		subgridEnabled = true;
		w.redraw();
		setRedrawPatterned("square");
	}, function() {
		subgridEnabled = false;
		w.redraw();
		setRedrawPatterned("square");
	});
	menu.hideEntry(menuOptions.subgrid);
	menuOptions.linksEnabled = menu.addCheckboxOption("Links enabled", function() {
		linksEnabled = true;
	}, function() {
		linksEnabled = false;
	}, true);
	menuOptions.colorsEnabled = menu.addCheckboxOption("Colors enabled", function() {
		w.enableColors();
		setRedrawPatterned("square");
	}, function() {
		w.disableColors();
		setRedrawPatterned("square");
	}, true);
	if(state.background) {
		menuOptions.backgroundEnabled = menu.addCheckboxOption("Background", function() {
			backgroundEnabled = true;
			w.redraw();
		}, function() {
			backgroundEnabled = false;
			w.redraw();
		}, true);
	}
	var zoomBar = document.createElement("input");
	zoomBar.oninput = function() {
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
	menuOptions.zoom = zoombarId;
}

function updateMenuEntryVisiblity() {
	var permColorText = Permissions.can_color_text(state.userModel, state.worldModel);
	var permColorCell = Permissions.can_color_cell(state.userModel, state.worldModel);
	var permGoToCoord = Permissions.can_go_to_coord(state.userModel, state.worldModel);
	var permCoordLink = Permissions.can_coordlink(state.userModel, state.worldModel);
	var permUrlLink = Permissions.can_urllink(state.userModel, state.worldModel);
	var permOwnerArea = Permissions.can_admin(state.userModel, state.worldModel);
	var permMemberArea = Permissions.can_protect_tiles(state.userModel, state.worldModel);
	var permEraseArea = Permissions.can_erase(state.userModel, state.worldModel);
	w.menu.setEntryVisibility(menuOptions.changeColor, permColorText || permColorCell);
	w.menu.setEntryVisibility(menuOptions.goToCoords, permGoToCoord);
	w.menu.setEntryVisibility(menuOptions.coordLink, permCoordLink);
	w.menu.setEntryVisibility(menuOptions.urlLink, permUrlLink);
	w.menu.setEntryVisibility(menuOptions.ownerArea, permOwnerArea);
	w.menu.setEntryVisibility(menuOptions.memberArea, permMemberArea);
	w.menu.setEntryVisibility(menuOptions.publicArea, permMemberArea);
	w.menu.setEntryVisibility(menuOptions.resetArea, permMemberArea);
	w.menu.setEntryVisibility(menuOptions.eraseArea, permEraseArea);
}

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
	this.lastSelectionTiled = this.tiled;
	this.restartSelection = false;
	this.init = function() {
		if(this.selection) return;
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
	this.deselect = function(successful) {
		this.regionSelected = false;
		this.regionCoordA = null;
		this.regionCoordB = null;
		this.hide();
		if(!successful) {
			for(var i = 0; i < oncancelEvents.length; i++) {
				var func = oncancelEvents[i];
				func();
			}
		}
	}
	this.stopSelectionUI = function(successful) {
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
			uncolorChar(tileX, tileY, charX, charY, "reg");
		}
		w.setTileRedraw(tileX, tileY, true);
		this.deselect(successful);
	}
	var onselectionEvents = [];
	var oncancelEvents = [];
	this.onselection = function(func) {
		onselectionEvents.push(func);
	}
	this.oncancel = function(func) {
		oncancelEvents.push(func);
	}
	this.handleSelection = function() {
		for(var i = 0; i < onselectionEvents.length; i++) {
			var func = onselectionEvents[i];
			this.regionSelected = true;
			if(!this.regionCoordA) continue;
			this.setSelection(this.regionCoordA, this.regionCoordB);
			var coordA = this.regionCoordA.slice(0);
			var coordB = this.regionCoordB.slice(0);
			orderRangeABCoords(coordA, coordB);
			if(this.tiled) {
				coordA[2] = 0;
				coordA[3] = 0;
				coordB[2] = tileC - 1;
				coordB[3] = tileR - 1;
			}
			var regWidth = (coordB[0] - coordA[0]) * tileC + coordB[2] - coordA[2] + 1;
			var regHeight = (coordB[1] - coordA[1]) * tileR + coordB[3] - coordA[3] + 1;
			func(coordA, coordB, regWidth, regHeight);
		}
		if(!this.restartSelection) {
			this.stopSelectionUI(true);
		} else {
			// the selection has been immediately restarted after the event has been fired
			this.restartSelection = false;
			this.regionCoordA = null;
			this.regionCoordB = null;
			this.hide();
		}
	}
	this.startSelection = function() {
		if(this.isSelecting) {
			this.restartSelection = true;
		}
		this.isSelecting = true;
		elm.owot.style.cursor = "cell";
		this.selection.style.backgroundColor = this.color;
	}
	this.destroy = function() {
		for(var i = 0; i < regionSelections.length; i++) {
			if(regionSelections[i] == this) {
				regionSelections.splice(i, 1);
				i--;
			}
		}
	}
	regionSelections.push(this);
	this.init();
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
		var query = getQuerystring(window.location.search);
		if(query.key) {
			data.key = query.key;
		}
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
	latestID: 1,
	callbacks: {},
	http: networkHTTP,
	transmit: function(data) {
		data = JSON.stringify(data);
		try {
			w.socket.send(data);
		} catch(e) {
			console.warn("Transmission error");
		}
	},
	protect: function(position, type) {
		// position: {tileX, tileY, [charX, charY, [charWidth, charHeight]]]}
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
			if("charWidth" in position && "charHeight" in position) {
				data.charWidth = position.charWidth;
				data.charHeight = position.charHeight;
			}
			data.precise = true;
		}
		var protReq = {
			kind: "protect",
			data: data,
			action: type == "unprotect" ? type : "protect"
		};
		network.transmit(protReq);
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
		network.transmit({
			kind: "link",
			data: data,
			type: type
		});
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
	write: function(edits, opts, callback) {
		if(!opts) opts = {};
		var writeReq = {
			kind: "write",
			edits: edits,
			public_only: opts.public_only,
			preserve_links: opts.preserve_links
		};
		if(callback) {
			var id = network.latestID++;
			writeReq.request = id;
			network.callbacks[id] = callback;
		}
		network.transmit(writeReq);
	},
	chathistory: function() {
		network.transmit({
			kind: "chathistory"
		});
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
		if(opts.id) {
			fetchReq.request = opts.id;
		}
		if(callback) {
			var id = network.latestID++;
			fetchReq.request = id;
			network.callbacks[id] = callback;
		}
		network.transmit(fetchReq);
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
	},
	clear_tile: function(position) {
		// position: {tileX, tileY, [charX, charY, [width, height]]]}
		var data = {
			tileX: position.tileX,
			tileY: position.tileY
		};
		var isPrecise = "charX" in position || "charY" in position || "charWidth" in position || "charHeight" in position;
		if(isPrecise) {
			data.charX = position.charX;
			data.charY = position.charY;
			if(!("tileX" in position || "tileY" in position)) {
				data.tileX = Math.floor(data.charX / tileC);
				data.tileY = Math.floor(data.charY / tileR);
				data.charX = data.charX - Math.floor(data.charX / tileC) * tileC;
				data.charY = data.charY - Math.floor(data.charY / tileR) * tileR;
			}
			if("charWidth" in position && "charHeight" in position) {
				data.charWidth = position.charWidth;
				data.charHeight = position.charHeight;
			}
		}
		var req = {
			kind: "clear_tile",
			data: data
		};
		network.transmit(req);
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
		network.transmit(data);
	},
	boundary: function(centerX, centerY, minX, minY, maxX, maxY) {
		network.transmit({
			kind: "boundary",
			centerX: centerX,
			centerY: centerY,
			minX: minX,
			minY: minY,
			maxX: maxX,
			maxY: maxY
		});
	}	
};

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
	ui: {
		announcements: {},
		coordLinkModal: null,
		coordGotoModal: null,
		urlModal: null,
		colorModal: null,
		selectionModal: null
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
	regionSelect: new RegionSelection(),
	protectSelect: new RegionSelection(),
	eraseSelect: new RegionSelection(),
	color: function() {
		w.ui.colorModal.open();
	},
	goToCoord: function() {
		w.ui.coordGotoModal.open();
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

		if(w.isLinking || w.isProtecting) {
			stopLinkUI();
		}
		w.url_input = url;
		elm.owot.style.cursor = "pointer";
		w.isLinking = true;
		w.link_input_type = 0;
	},
	urlLink: function() {
		stopLinkUI();
		w.ui.urlModal.open();
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
		w.ui.coordLinkModal.open();
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

		if(w.isLinking) return;
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
		var jqueryURL = "https://code.jquery.com/jquery-1.7.min.js";
		w.loadScript(jqueryURL, callback);
	},
	redraw: function() {
		renderSerial++;
		w.hasUpdated = true;
	},
	reloadRenderer: function() {
		reloadRenderer();
	},
	setRedraw: function() { // deprecated
		w.redraw();
	},
	setTileRedraw: function(tileX, tileY, highPriority, fastQueue) {
		var tile = Tile.get(tileX, tileY);
		if(!tile) return;
		w.hasSelectiveUpdated = true;
		tile.redraw = true;
		queueTile(tileX, tileY, highPriority);
		if(fastQueue) tile.fastQueue = true;
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
		if(redraw) w.redraw();
		w.hasUpdated = true;
	},
	changeFont: function(fontData, nr) {
		// change the global font
		fontTemplate = fontData;
		font = fontTemplate.replace("$", normFontSize(16 * zoom));
		textRenderCtx.font = font;
		if(!nr) w.redraw();
	},
	fixFonts: function(mainType) {
		if(!window.Promise || !window.FontFace) return;
		var list = {
			"legacycomputing": "url('/static/font/legacycomputing.woff2')"
		};
		if(mainType) { // load just one specific type
			for(var i in list) {
				if(i != mainType) {
					delete list[i];
				}
			}
		}
		var promises = [];
		var fonts = {};
		for(var name in list) {
			var ff = new FontFace(name, list[name]);
			fonts[name] = ff;
			promises.push(ff.load());
		}
		if(!promises.length) return;
		Promise.all(promises).then(function() {
			var fontNames = [];
			for(var name in fonts) {
				document.fonts.add(fonts[name]);
				fontNames.push(name);
			}
			fontOrder.push(...fontNames);
			specialFontOrder.unshift(...fontNames);
			rebuildFontTemplates();
			w.changeFont(fontTemplate, true);
			w.changeSpecialCharFont(specialFontTemplate);
		});
	},
	loadFont: function(name, path, cb) {
		var fnt = new FontFace(name, "url(\"" + encodeURI(path) + "\")");
		fnt.load().then(function() {
			document.fonts.add(fnt);
			if(cb) cb(fnt);
		});
	},
	changeSpecialCharFont: function(fontData, nr) {
		specialFontTemplate = fontData;
		specialCharFont = specialFontTemplate.replace("$", normFontSize(16 * zoom));
		if(!nr) w.redraw();
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
	changeSocket: function(addr, getChatHist) {
		ws_path = addr;
		socket.close();
		createSocket(getChatHist);
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
		if(cursorCoords) {
			var cursorTileX = cursorCoords[0];
			var cursorTileY = cursorCoords[1];
			w.setTileRedraw(cursorTileX, cursorTileY, true);
		}
	},
	changeBgColor: function(color) {
		if(color == -1) {
			YourWorld.BgColor = -1;
			return;
		}
		color = resolveColorValue(color);
		YourWorld.BgColor = color;
		var rgb = int_to_rgb(color);
		setRGBBgColorPicker(rgb[0], rgb[1], rgb[2]);
	},
	fetchUpdates: function(margin) {
		if(!margin) margin = 0;
		var vis = getVisibleTileRange(margin);
		network.fetch({
			minX: vis[0][0],
			minY: vis[0][1],
			maxX: vis[1][0],
			maxY: vis[1][1]
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
	},
	registerHook: function(event, callback) {
		event = event.toLowerCase();
		if(event == "renderchar") {
			// parameters: charCode, ctx, tileX, tileY, charX, charY, offsetX, offsetY, width, height
			specialClientHookMap |= (1 << 0);
			if(!specialClientHooks[event]) {
				specialClientHooks[event] = [];
			}
			specialClientHooks[event].push(callback);
		}
	}
});

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
	return Modal.isOpen;
}

function disableBgColorPicker() {
	// a crude method of "clearing"/"disabling" the color picker
	if(!colorInputBg.jscolor.refine) return;
	colorInputBg.jscolor.fromRGB(255, 255, 255);
	colorInputBg.value = "[ None ]";
	colorInputBg.jscolor.refine = false;
	colorInputBg.onclick = enableBgColorPicker;
}

function enableBgColorPicker() {
	if(colorInputBg.jscolor.refine) return;
	colorInputBg.jscolor.refine = true;
	colorInputBg.onclick = null;
	colorInputBg.jscolor.fromString("#DCE943");
}

function makeCoordLinkModal() {
	var modal = new Modal();
	modal.createForm();
	modal.setFormTitle("Enter the coordinates to create a link to. You can then click on a letter to create the link.\n");
	var coordX = modal.addEntry("X", "text", "number").input;
	var coordY = modal.addEntry("Y", "text", "number").input;
	modal.setMaximumSize(360, 300);
	modal.onSubmit(function() {
		w.doCoordLink(parseFloat(coordY.value), parseFloat(coordX.value));
	});
	w.ui.coordLinkModal = modal;
}

function makeCoordGotoModal() {
	var modal = new Modal();
	modal.createForm();
	modal.setFormTitle("Go to coordinates:\n");
	var coordX = modal.addEntry("X", "text", "number").input;
	var coordY = modal.addEntry("Y", "text", "number").input;
	modal.onSubmit(function() {
		w.doGoToCoord(parseFloat(coordY.value), parseFloat(coordX.value));
	});
	w.ui.coordGotoModal = modal;
}

function makeURLModal() {
	var modal = new Modal();
	modal.setMinimumSize(250, 120);
	modal.createForm();
	modal.setFormTitle("\n");
	var urlInput = modal.addEntry("URL", "text").input;
	urlInput.style.width = "175px";
	modal.onSubmit(function() {
		w.doUrlLink(urlInput.value);
	});
	modal.unalignForm();
	w.ui.urlModal = modal;
}

function buildBackgroundColorModal(modal) {
	modal.addTab("fg", "Text");
	modal.addTab("bg", "Cell");

	modal.focusTab("bg");

	modal.createForm();
	modal.setFormTitle("\n");
	colorInputBg = modal.addEntry("Cell color", "color").input;
	modal.setFooterContentRight(colorShortcutsBg);
	updateBgColorPicker();

	modal.focusTab("fg");
	
	disableBgColorPicker();

	modal.onTabChange(function(evt) {
		var tab = evt.id;
		if(tab == "bg") {
			colorShortcutsBg.style.display = "";
			colorShortcuts.style.display = "none";
		} else if(tab == "fg") {
			colorShortcutsBg.style.display = "none";
			colorShortcuts.style.display = "";
		}
	});
}

function resetColorModalVisibility() {
	var pText = Permissions.can_color_text(state.userModel, state.worldModel);
	var pCell = Permissions.can_color_cell(state.userModel, state.worldModel);
	if(pCell) {
		if(!w.ui.colorModal.getTabData("bg")) {
			buildBackgroundColorModal(w.ui.colorModal);
		}
		w.ui.colorModal.showTab("bg");
	} else {
		w.ui.colorModal.hideTab("bg");
		w.ui.colorModal.focusTab("fg");
	}
	if(pText) {
		w.ui.colorModal.showTab("fg");
	} else {
		w.ui.colorModal.hideTab("fg");
		w.ui.colorModal.focusTab("bg");
	}
	if(!pCell && !pText) {
		w.ui.colorModal.close();
	}
}

function makeColorModal() {
	var modal = new Modal();
	modal.setMinimumSize(290, 128);
	modal.createForm();
	modal.setFormTitle("\n");
	colorInput = modal.addEntry("Text color", "color").input;
	modal.onSubmit(function() {
		var color;
		var isBg = modal.getCurrentTabId() == "bg";
		if(!isBg) { // text color
			color = colorInput.value;
		} else { // cell color
			if(!colorInputBg.jscolor.refine) return;
			color = colorInputBg.value;
		}
		var this_color = 0;
		if(color) {
			this_color = parseInt(color, 16);
		}
		if(!this_color) {
			this_color = 0;
		}
		if(!isBg) {
			w.changeColor(this_color);
			localStorage.setItem("color", this_color);
		} else {
			w.changeBgColor(this_color);
			// we don't need to save the bg color to localStorage (if enabled for this world)
		}
	});
	modal.onClose(function(canceled) {
		if(!canceled) {
			modal.submitForm();
		}
	});
	modal.setFooter();
	modal.setFooterCheckbox("Outline", function(checked) {
		cursorOutlineEnabled = checked;
		storeConfig();
		if(!cursorCoords) return;
		var cursorTileX = cursorCoords[0];
		var cursorTileY = cursorCoords[1];
		w.setTileRedraw(cursorTileX, cursorTileY, true);
	}, cursorOutlineEnabled);

	colorShortcuts = document.createElement("div");
	colorShortcuts.id = "color_shortcuts";
	modal.setFooterContentRight(colorShortcuts);

	colorShortcutsBg = document.createElement("div");
	colorShortcutsBg.id = "color_shortcuts_bg";
	colorShortcutsBg.style.display = "none";

	if(Permissions.can_color_cell(state.userModel, state.worldModel)) {
		buildBackgroundColorModal(modal);
	}

	if(!Permissions.can_color_text(state.userModel, state.worldModel)) {
		modal.focusTab("bg");
		modal.hideTab("fg");
	}
	w.ui.colorModal = modal;
}

function makeSelectionModal() {
	var headerBar = document.createElement("div");

	var area_copy = document.createElement("button");
	area_copy.style.marginBottom = "1px";
	area_copy.innerText = "Copy to Clipboard";
	area_copy.onclick = function() {
		w.clipboard.copy(region_text.value);
	}

	var region_bounds = document.createElement("span");
	region_bounds.style.display = "none";
	region_bounds.style.marginLeft = "5px";
	var reg_label = document.createElement("b");
	reg_label.innerText = "Selection: ";
	var rb_coord1 = document.createElement("span");
	var rb_coord2 = document.createElement("span");
	region_bounds.appendChild(reg_label);
	region_bounds.appendChild(rb_coord1);
	region_bounds.appendChild(document.createTextNode(", "));
	region_bounds.appendChild(rb_coord2);
	var region_text = document.createElement("textarea")
	region_text.id = "area_results";

	headerBar.appendChild(area_copy);
	headerBar.appendChild(region_bounds);

	function updateOutput() {
		var o_color = c_color.cbElm.checked;
		var o_bgcolor = c_bgcolor.cbElm.checked;
		var o_link = c_link.cbElm.checked;
		var o_deco = c_deco.cbElm.checked;
		var o_prot = c_prot.cbElm.checked;
		var o_protpub = c_pprot.cbElm.checked;
		var o_tleft = t_left.cbElm.checked;
		var o_tright = t_right.cbElm.checked;
		var o_tempty = t_empty.cbElm.checked;
		var o_rgap = r_gap.cbElm.checked;
		var o_rlnbrk = r_br.cbElm.checked;
		var o_rsurrog = r_surr.cbElm.checked;
		var o_rcomb = r_comb.cbElm.checked;
		var text = s_str;
		var currentCol = -1;
		var currentBgCol = -1;
		var resText = [];
		for(var y = 0; y < text.length; y++) {
			var textRow = text[y].slice(0);
			filterAdvancedChars(textRow, o_rsurrog, o_rcomb);
			var colRow = o_color && s_colors[y] && s_colors[y].slice(0);
			var bgColRow = o_bgcolor && s_bgcolors[y] && s_bgcolors[y].slice(0);
			var linkRow = o_link && s_links[y] && s_links[y].slice(0);
			var protRow = o_prot && s_prots[y] && s_prots[y].slice(0);
			var decoRow = o_deco && s_decos[y] && s_decos[y].slice(0);
			if(o_tleft || o_tright || o_rgap) spaceTrim(textRow, o_tleft, o_tright, o_rgap, [colRow, linkRow, protRow, decoRow]);
			if(o_deco && decoRow) {
				for(var x = 0; x < textRow.length; x++) {
					var chr = textRow[x];
					var deco = decoRow[x];
					if(deco) {
						chr = setCharTextDecorations(chr, deco.bold, deco.italic, deco.under, deco.strike);
						textRow[x] = chr;
					}
				}
			}
			if(o_color || (o_color && o_bgcolor)) {
				for(var x = 0; x < textRow.length; x++) {
					var col = 0;
					var bgCol = -1;
					if(colRow) col = colRow[x];
					if(bgColRow) bgCol = bgColRow[x];

					if(col == currentCol && bgCol == currentBgCol) continue;

					var chr = "";
					if(bgCol != currentBgCol && o_bgcolor) { // cell color
						chr += "\x1b";
						if(bgCol == -1) {
							chr += "x";
							currentCol = -1; // this also resets text color, so re-add it right after bgcolor definition
						} else {
							chr += "b" + bgCol.toString(16).padStart(6, 0);
						}
					}
					if(col != currentCol && o_color) { // text color
						chr += "\x1b";
						if(col == 0) {
							chr += "x";
							if(o_bgcolor && bgCol != -1) { // re-add cell color if applicable
								chr += "\x1b" + "b" + bgCol.toString(16).padStart(6, 0);
							}
						} else {
							chr += "F" + col.toString(16).padStart(6, 0);
						}
					}
					currentCol = col;
					currentBgCol = bgCol;
					textRow[x] = chr + textRow[x];
				}
			}
			if(o_link && linkRow) {
				for(var x = 0; x < textRow.length; x++) {
					var link = linkRow[x];
					if(!link) continue;
					textRow[x] = "\x1b" + link + textRow[x];
				}
			}
			if(o_prot && protRow) {
				for(var x = 0; x < textRow.length; x++) {
					var prot = protRow[x];
					if(prot == 0 && !o_protpub) continue;
					textRow[x] = "\x1b" + "P" + prot + textRow[x]; // prot should be one character in length
				}
			}
			textRow = textRow.join("");
			if(o_tempty && !textRow.length) {
				continue;
			}
			resText.push(textRow);
		}
		if(!o_rlnbrk) {
			resText = resText.join("\n");
		} else {
			resText = resText.join("");
		}
		region_text.value = resText;
	}

	var s_str;
	var s_colors;
	var s_bgcolors;
	var s_links
	var s_prots;
	var s_decos;

	var modal = new Modal();
	modal.setMinimumSize(500, 450);
	modal.append(headerBar);
	modal.append(region_text);
	modal.createCheckboxField();
	modal.createClose();
	var c_color = modal.addCheckbox("Copy colors");
	var c_bgcolor = modal.addCheckbox("Copy cell colors", c_color);
	var c_link = modal.addCheckbox("Copy links");
	var c_prot = modal.addCheckbox("Copy protections");
	var c_pprot = modal.addCheckbox("Copy public protections", c_prot);
	var c_deco = modal.addCheckbox("Copy text decorations");
	var t_left = modal.addCheckbox("Trim left");
	var t_right = modal.addCheckbox("Trim right");
	var t_empty = modal.addCheckbox("Trim empty lines");
	var r_gap = modal.addCheckbox("Remove gaps");
	var r_br = modal.addCheckbox("Remove line breaks");
	var r_surr = modal.addCheckbox("Remove surrogates");
	var r_comb = modal.addCheckbox("Remove combining chars");
	c_bgcolor.elm.style.display = "none"; // keep bg color option hidden unless there exist colored cells
	modal.checkboxFieldOnInput(function(obj, checked) {
		updateOutput();
	});
	modal.onOpen(function(str, colors, bgcolors, links, protections, decorations, coords) {
		s_str = str;
		s_colors = colors;
		s_bgcolors = bgcolors;
		s_links = links;
		s_prots = protections;
		s_decos = decorations;
		var bgColorsFound = false;
		for(var i = 0; i < bgcolors.length; i++) {
			if(bgcolors[i]) {
				c_bgcolor.elm.style.display = "";
				bgColorsFound = true;
				break;
			}
		}
		if(!bgColorsFound) {
			c_bgcolor.elm.style.display = "none";
		}
		if(!showCursorCoordinates) {
			region_bounds.style.display = "none";
		} else {
			region_bounds.style.display = "";
			rb_coord1.innerText = JSON.stringify(coords[0]);
			rb_coord2.innerText = JSON.stringify(coords[1]);
		}
		updateOutput();
	});
	w.ui.selectionModal = modal;
}

if(state.userModel.is_superuser) {
	w.loadScript("/static/yw/javascript/world_tools.js");
}

if(state.worldModel.default_script_path && window.URL) {
	let url = new URL(state.worldModel.default_script_path, window.location.origin);
	if(url.origin == window.location.origin) { // static file must be from the same website!
		w.loadScript(url.pathname);
	}
}

if(state.background) {
	w.backgroundInfo.x = ("x" in state.background) ? state.background.x : 0;
	w.backgroundInfo.y = ("y" in state.background) ? state.background.y : 0;
	w.backgroundInfo.w = ("w" in state.background) ? state.background.w : 0;
	w.backgroundInfo.h = ("h" in state.background) ? state.background.h : 0;
	w.backgroundInfo.rmod = ("rmod" in state.background) ? state.background.rmod : 0;
	w.backgroundInfo.alpha = ("alpha" in state.background) ? state.background.alpha : 1;
}

var tellEdit = [];
// tileY, tileX, charY, charX, X, X, editID
function searchTellEdit(tileX, tileY, charX, charY) {
	for(var i = 0; i < tellEdit.length; i++) {
		if(tellEdit[i][1] == tileX &&
			tellEdit[i][0] == tileY &&
			tellEdit[i][3] == charX &&
			tellEdit[i][2] == charY) {
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

function updateWorldName() {
	var name = state.worldModel.name;
	if(!name || name.toLowerCase() == "main" || name.toLowerCase() == "owot") {
		document.title = "Our World of Text";
	} else {
		document.title = state.worldModel.pathname;
	}
	if(window.history && window.history.replaceState) {
		var newPath = state.worldModel.pathname + window.location.search + window.location.hash;
		if(!newPath) newPath = "/";
		history.replaceState({}, "", newPath);
	}
}

function reapplyProperties(props) {
	var theme = props.theme;
	var themeDefaults = defaultStyles();
	styles.member = theme.tileMember || themeDefaults.member;
	styles.owner = theme.tileOwner || themeDefaults.owner;
	styles.public = theme.bg || themeDefaults.public;
	styles.text = theme.color || themeDefaults.text;
	styles.menu = theme.menu || themeDefaults.menu;
	styles.cursor = theme.cursor || themeDefaults.cursor;
	styles.guestCursor = theme.guestCursor || themeDefaults.guestCursor;
	styles.public_text = theme.publicText || themeDefaults.public_text;
	styles.member_text = theme.memberText || themeDefaults.member_text;
	styles.owner_text = theme.ownerText || themeDefaults.owner_text;

	menu_color(styles.menu);

	state.worldModel.writability = props.writability;
	state.worldModel.readability = props.readability;

	state.worldModel.color_cell = props.feature.colorCell;
	state.worldModel.color_text = props.feature.colorText;
	state.worldModel.feature_coord_link = props.feature.coordLink;
	state.worldModel.feature_go_to_coord = props.feature.goToCoord;
	state.worldModel.feature_membertiles_addremove = props.feature.memberTilesAddRemove;
	state.worldModel.feature_paste = props.feature.paste;
	state.worldModel.feature_url_link = props.feature.urlLink;
	state.worldModel.show_cursor = props.feature.showCursor;
	state.worldModel.square_chars = props.opts.squareChars;
	state.worldModel.half_chars = props.opts.halfChars;
	state.worldModel.no_copy = props.opts.noCopy;
	state.worldModel.quick_erase = props.opts.quickErase;

	if(state.worldModel.square_chars) {
		defaultSizes.cellW = 18;
	} else {
		defaultSizes.cellW = 10;
	}
	if(state.worldModel.half_chars) {
		defaultSizes.cellH = 20;
	} else {
		defaultSizes.cellH = 18;
	}

	state.worldModel.write_interval = props.opts.writeInt;

	state.worldModel.name = props.name;
	state.worldModel.pathname = props.name ? "/" + props.name : "";
	if(props.opts.charRate) {
		state.worldModel.char_rate = props.opts.charRate.split("/").map(Number);
	}

	updateScaleConsts();
	resetColorModalVisibility();
	updateMenuEntryVisiblity();
	updateWorldName();

	w.reloadRenderer();
	w.setFlushInterval(state.worldModel.write_interval);
}

var ws_functions = {
	fetch: function(data) {
		var id = 0;
		if("request" in data) {
			id = data.request;
			var cb = network.callbacks[id];
			if(typeof cb == "function") {
				cb(data.tiles, null);
			}
			delete network.callbacks[id];
		}
		var fastQueue = id == -1;
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
			var tileX = pos[1];
			var tileY = pos[0];
			w.setTileRedraw(tileX, tileY, false, fastQueue);
			if(bufferLargeChars) {
				w.setTileRedraw(tileX, tileY - 1, false, fastQueue);
				w.setTileRedraw(tileX + 1, tileY - 1, false, fastQueue);
				w.setTileRedraw(tileX + 1, tileY, false, fastQueue);
			}
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
		w.redraw();
		menu_color(styles.menu);
	},
	tileUpdate: function(data) {
		w.emit("tileUpdate", data);
		var highlights = [];
		// settings are configured to offset server-fetched tiles
		if(tileFetchOffsetX || tileFetchOffsetY) {
			tile_offset_object(data.tiles, tileFetchOffsetX, tileFetchOffsetY);
		}
		for(var tileKey in data.tiles) {
			var pos = getPos(tileKey);
			var tileX = pos[1];
			var tileY = pos[0];
			var tile = data.tiles[tileKey];
			if(!tile.properties) {
				tile.properties = {};
			}
			var localTile = Tile.get(tileX, tileY);
			if(!localTile) {
				tile.content = w.splitTile(tile.content);
				if(tile.properties.char) {
					tile.properties.char = decodeCharProt(tile.properties.char);
				}
				Tile.set(tileX, tileY, tile);
				w.setTileRedraw(tileX, tileY);
				continue;
			}
			var props = tile.properties;
			var localProps = localTile.properties;

			var charData = w.splitTile(tile.content);
			var colorData = props.color;
			var bgColorData = props.bgcolor;

			var localCharData = localTile.content;
			var localColorData = localProps.color;
			var localBgColorData = localProps.bgcolor;

			var shouldDeleteLocalColor = false;
			var shouldDeleteLocalBgColor = false;

			localProps.writability = props.writability;
			if(props.cell_props) {
				localProps.cell_props = props.cell_props;
			} else {
				delete localProps.cell_props;
			}
			if(props.char) {
				localProps.char = decodeCharProt(props.char);
			} else {
				delete localProps.char;
			}
			if(!colorData) { // no remote color data, delete local
				shouldDeleteLocalColor = true;
			} else if(!localColorData) { // remote color data exists, set local value to remote
				localColorData = colorData; // we will be sharing a reference with the remote color data
				localProps.color = localColorData;
			}
			if(!bgColorData) {
				shouldDeleteLocalBgColor = true;
			} else if(!localBgColorData) {
				localBgColorData = bgColorData; // again, same with the remote bg color data
				localProps.bgcolor = localBgColorData;
			}

			for(var c = 0; c < tileArea; c++) {
				var charX = c % tileC;
				var charY = Math.floor(c / tileC);

				var localChar = localCharData[c];
				var remoteChar = charData[c];

				var localColor = localColorData ? localColorData[c] : 0;
				var remoteColor = colorData ? colorData[c] : 0;

				var localBgColor = localBgColorData ? localBgColorData[c] : -1;
				var remoteBgColor = bgColorData ? bgColorData[c] : -1;

				if(localChar != remoteChar || localColor != remoteColor || localBgColor != remoteBgColor) {
					// don't overwrite local changes until those changes are confirmed
					if(!searchTellEdit(tileX, tileY, charX, charY)) {
						localCharData[c] = remoteChar;
						if(localColorData) {
							localColorData[c] = remoteColor;
						}
						if(localBgColorData) {
							localBgColorData[c] = remoteBgColor;
						}
					} else {
						shouldDeleteLocalColor = false;
						shouldDeleteLocalBgColor = false;
					}
					// briefly highlight these changes (10 at a time)
					if(useHighlight && Tile.visible(tileX, tileY)) {
						highlights.push([tileX, tileY, charX, charY]);
					}
				}
			}
			if(shouldDeleteLocalColor) {
				delete localProps.color;
			}
			if(shouldDeleteLocalBgColor) {
				delete localProps.bgcolor;
			}
			w.setTileRedraw(tileX, tileY);
			if(bufferLargeChars) {
				w.setTileRedraw(tileX, tileY - 1);
				w.setTileRedraw(tileX + 1, tileY - 1);
				w.setTileRedraw(tileX + 1, tileY);
			}
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
			delete network.callbacks[id];
		}
		w.emit("writeResponse", data);
		for(var i = 0; i < data.accepted.length; i++) {
			for(var x = 0; x < tellEdit.length; x++) {
				if(tellEdit[x][6] == data.accepted[i]) {
					var tileX = tellEdit[x][1];
					var tileY = tellEdit[x][0];
					var charX = tellEdit[x][3];
					var charY = tellEdit[x][2];
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
					if(uncolorChar(tileX, tileY, charX, charY, "err")) {
						w.setTileRedraw(tileX, tileY, true);
					}
					tellEdit.splice(x, 1);
					// because the element has been removed, the length of the array is shorter
					x--;
				}
			}
		}
		for(var i in data.rejected) {
			var rej = data.rejected[i];
			for(var x = 0; x < tellEdit.length; x++) {
				if(tellEdit[x][6] != i) continue;
				var tileX = tellEdit[x][1];
				var tileY = tellEdit[x][0];
				var charX = tellEdit[x][3];
				var charY = tellEdit[x][2];
				if(rej == 1 || rej == 4) { // denied because zero rate limit
					highlight([[tileX, tileY, charX, charY]], true, [255, 0, 0]);
					tellEdit.splice(x, 1);
					x--;
					continue;
				}
				colorChar(tileX, tileY, charX, charY, "err");
				w.setTileRedraw(tileX, tileY, true);
				tellEdit[x][4] = getDate();
				writeBuffer.push(tellEdit[x]);
			}
		}
	},
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
				case "goToCoord":
					state.worldModel.feature_go_to_coord = value;
					break;
				case "coordLink":
					state.worldModel.feature_coord_link = value;
					break;
				case "urlLink":
					state.worldModel.feature_url_link = value;
					break;
				case "paste":
					state.worldModel.feature_paste = value;
					break;
				case "noCopy":
					state.worldModel.no_copy = value;
					break;
				case "chat":
					state.worldModel.chat_permission = value;
					elm.chatbar.disabled = !Permissions.can_chat(state.userModel, state.worldModel);
					break;
				case "showCursor":
					state.worldModel.show_cursor = value;
					break;
				case "colorText":
					state.worldModel.color_text = value;
					resetColorModalVisibility();
					break;
				case "colorCell":
					state.worldModel.color_cell = value;
					resetColorModalVisibility();
					break;
				case "quickErase":
					state.worldModel.quick_erase = value;
					break;
				case "memberTilesAddRemove":
					state.worldModel.feature_membertiles_addremove = value;
					break;
				case "readability":
					break;
				case "writability":
					state.worldModel.writability = value;
					w.redraw();
					break;
				case "name":
					state.worldModel.name = value;
					state.worldModel.pathname = value ? "/" + value : "";
					ws_path = createWsPath();
					updateWorldName();
					break;
				case "charRate":
					state.worldModel.char_rate = value;
					break;
				case "writeInt":
					w.setFlushInterval(value);
					break;
			}
		}
		updateMenuEntryVisiblity();
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
			w.setTileRedraw(tileX, tileY, true);
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
				w.setTileRedraw(csr.tileX, csr.tileY, true);
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
			w.setTileRedraw(csr.tileX, csr.tileY, true);
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

	makeCoordLinkModal();
	makeCoordGotoModal();
	makeURLModal();
	makeColorModal();
	makeSelectionModal();

	addColorShortcuts();
	updateColorPicker();

	if(state.announce) {
		w.doAnnounce(state.announce);
	}

	if(window.location.hostname == "www.ourworldoftext.com") {
		w.doAnnounce("You are currently under the 'www' subdomain. <a href=\"https://ourworldoftext.com\">You may want to go here instead.</a>", "www_warn");
	}

	buildMenu();
	updateMenuEntryVisiblity();
	w.regionSelect.onselection(handleRegionSelection);

	w.protectSelect.onselection(protectSelectionStart);
	w.protectSelect.oncancel(protectSelectionCancel);
	w.protectSelect.tiled = true;

	w.eraseSelect.onselection(eraseSelectionStart);
	w.eraseSelect.charColor = "red";
	w.eraseSelect.color = "rgb(239 176 176 / 50%)";

	w.fetchUnloadedTiles();
	w.fixFonts("legacycomputing");

	browserZoomAdjust(true);
	manageCoordHash();

	protectPrecisionOption(protectPrecision);

	getWorldProps(state.worldModel.name, "style", function(style, error) {
		if(error) {
			console.warn("An error occurred while loading the world style");
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
