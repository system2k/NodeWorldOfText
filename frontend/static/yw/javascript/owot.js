var YourWorld = {
    Color: window.localStorage ? +localStorage.getItem("color") : 0,
    Nickname: state.userModel.username
}

var owot, textInput, textLayer;
function init_dom() {
    loading.style.display = "none";
    owot = document.getElementById("owot");
    owot.hidden = false;
    owot.style.cursor = "text";
    textInput = document.getElementById("textInput");
    textLayer = document.getElementById("text");
    textLayer.hidden = false;
    textLayer.style.pointerEvents = "none";

    coord_Y.innerText = "0";
    coord_X.innerText = "0";
}
function getWndWidth() {
    return document.body.clientWidth;
}
function getWndHeight() {
    return document.body.clientHeight;
}
function decimal(percentage) {
    return percentage / 100;
}
function deviceRatio() {
    var ratio = window.devicePixelRatio;
    if(!ratio) ratio = 1;
    return ratio;
}

var nextObjId       = 1; // next edit ID
var width           = getWndWidth();
var height          = getWndHeight();
var js_alert_active = false; // js alert window open
var worldFocused    = false;
var regionSelected  = false;
var regionCoordA    = null;
var regionCoordB    = null;

var positionX              = 0; // client position in pixels
var positionY              = 0;
var gridEnabled            = false;
var subgridEnabled         = true; // character-level grid
var linksEnabled           = true;
var linksRendered          = true;
var colorsEnabled          = true;
var backgroundEnabled      = true; // if any
var zoomRatio              = window.devicePixelRatio; // browser's zoom ratio
var protectPrecision       = 0; // 0 being tile and 1 being char
var checkTileFetchInterval = 300; // how often to check for unloaded tiles (ms)
var zoom                   = decimal(100); // zoom value
var unloadTilesAuto        = true;
var images                 = {}; // { name: [data RGBA, width, height] }
var useHighlight           = true; // highlight new edits
var highlightLimit         = 10;
var ansiBlockFill          = true; // fill certain ansi block characters
var colorizeLinks          = true;
var brBlockFill            = false;
var tileFetchOffsetX       = 0; // offset added to tile fetching and sending coordinates
var tileFetchOffsetY       = 0;
var defaultChatColor       = null; // 24-bit Uint
var ignoreCanvasContext    = true; // ignore canvas context menu when right clicking
var elementSnapApprox      = 10;
var mSpecRendering         = true;
var combiningCharsEnabled  = true;
var surrogateCharsEnabled  = true;
var defaultCoordLinkColor  = "#008000";
var defaultURLLinkColor    = "#0000FF";

var images_to_load         = {
    unloaded: "/static/unloaded.png"
}

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
    erase: "BACKSPACE",
    cursorUp: "UP",
    cursorDown: "DOWN",
    cursorLeft: "LEFT",
    cursorRight: "RIGHT",
    copyRegion: "SHIFT+ALT"
}

var clientOnload = [];
window.addEventListener("load", function() {
    for(var i = 0; i < clientOnload.length; i++) clientOnload[i]();
})

function byId(a) {
    return document.getElementById(a);
}

var loading = byId("loading");
var coord_Y = byId("coord_Y");
var coord_X = byId("coord_X");
var chatbar = byId("chatbar");
var color_input_form_input = byId("color_input_form_input");
var protect_precision = byId("protect_precision");
var announce = byId("announce");
var announce_text = byId("announce_text");
var announce_close = byId("announce_close");
var tile_choice = byId("tile_choice");
var char_choice = byId("char_choice");
var menu_elm = byId("menu");
var nav_elm = byId("nav");
var coords = byId("coords");
var chat_window = byId("chat_window");
var confirm_js = byId("confirm_js");

var jscolorInput;
clientOnload.push(function() {
    jscolorInput = byId("color_input_form_input").jscolor;
    jscolorInput.fromRGB(
        (YourWorld.Color >> 16) & 255, 
        (YourWorld.Color >> 8) & 255, 
         YourWorld.Color & 255);
})

init_dom();

var draggable_element_mousemove = [];
var draggable_element_mouseup = [];
function draggable_element(dragger, dragged) {
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
        if(e.target != dragged) return;
        elmX = dragged.offsetLeft;
        elmY = dragged.offsetTop;
        elmWidth = dragged.offsetWidth;
        elmHeight = dragged.offsetHeight;
        dragging = true;
        clickX = e.pageX;
        clickY = e.pageY;
    })
    // when the element is being dragged
    draggable_element_mousemove.push(function(e, arg_pageX, arg_pageY) {
        if(!dragging) return;

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
    })
    // when the element is released
    draggable_element_mouseup.push(function() {
        dragging = false;
    })
}

draggable_element(chat_window);
draggable_element(confirm_js);

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
        localStorage.setItem("nickname", YourWorld.Nickname)
    }
}

getStoredNickname();

if(state.background) { // add the background image (if it already exists)
    images_to_load.background = state.background;
}
for(var i in images_to_load) { // add blank image object so that client knows it exists, but not loaded
    images[i] = null;
}
var img_load_keys = Object.keys(images_to_load);

var imgToArrayCanvas = document.createElement("canvas");
var backImg = imgToArrayCanvas.getContext("2d"); // temporary canvas used to pull data from images

var loadImageElm;
var img_load_index = 0;
function loadImgPixelData(callback) {
    if(!loadImageElm) loadImageElm = new Image();
    var img_key = img_load_keys[img_load_index];
    loadImageElm.src = images_to_load[img_key];
    var error = false;
    loadImageElm.onload = function() {
        if(!error) {
            var width = loadImageElm.width;
            var height = loadImageElm.height;
            imgToArrayCanvas.width = width;
            imgToArrayCanvas.height = height;
            backImg.drawImage(loadImageElm, 0, 0);
            images[img_key] = [backImg.getImageData(0, 0, width, height).data, width, height];
        } else {
            // failed to load. use gray color
            images[img_key] = [new Uint8ClampedArray([192]), 1, 1];
        }
        img_load_index++;
        if(img_load_index >= img_load_keys.length) {
            // once all the images are loaded
            renderTiles();
            callback();
        } else {
            // continue loading
            loadImgPixelData(callback);
        }
    }
    loadImageElm.onerror = function() {
        error = true;
        loadImageElm.onload();
    }
}

function beginLoadingOWOT() {
    // load main images
    loadImgPixelData(function() {
        begin();
    });
}
beginLoadingOWOT();

function keydown_regionSelect(e) {
    if(!checkKeyPress(e, keyConfig.copyRegion) || w.isSelecting) return;
    w.isSelecting = true;
    owot.style.cursor = "cell";
}
document.addEventListener("keydown", keydown_regionSelect);

function handleRegionSelection() {
    regionSelected = true;
    w.regionSelect.setSelection(regionCoordA, regionCoordB);
    var coordA = regionCoordA.slice(0);
    var coordB = regionCoordB.slice(0);
    orderRangeABCoords(coordA, coordB);
    var regWidth = (coordB[0] - coordA[0]) * tileC + coordB[2] - coordA[2] + 1;
    var regHeight = (coordB[1] - coordA[1]) * tileR + coordB[3] - coordA[3] + 1;
    var tileX = coordA[0];
    var tileY = coordA[1];
    var charX = coordA[2];
    var charY = coordA[3];
    var reg = "";
    var colors = [];
    for(var y = 0; y < regHeight; y++) {
        if(y != 0) {
            reg += "\n";
        }
        for(var x = 0; x < regWidth; x++) {
            reg += getChar(tileX, tileY, charX, charY);
            colors.push(getCharColor(tileX, tileY, charX, charY));
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
    w._ui.selectionModal.open(reg, colors);
}

if(state.userModel.is_staff) {
    chatbar.removeAttribute("maxLength");
}

var defaultSizes = {
    // in pixels
    cellW: 10,
    cellH: 18,
    // assigned later
    tileW: null,
    tileH: null,
    // in characters
    tileC: 16, // columns
    tileR: 8 // rows
}
if(state.worldModel.square_chars) {
    defaultSizes.cellW = 18;
}
if(state.worldModel.half_chars) {
    defaultSizes.cellH = 20;
}

var cellWidthPad, tileW, tileH, cellW, cellH, font, specialCharFont, tileC, tileR, tileArea;

var fontTemplate = "$px 'Courier New', monospace";
var specialCharFontTemplate = "$px consolas, monospace";

function updateScaleConsts() {
    defaultSizes.tileW = defaultSizes.cellW * defaultSizes.tileC;
    defaultSizes.tileH = defaultSizes.cellH * defaultSizes.tileR;
    cellWidthPad = Math.floor((defaultSizes.cellW - 10) / 2); // X text offset if the cell is wider

    tileW = Math.trunc(defaultSizes.tileW * zoom);
    tileH = Math.trunc(defaultSizes.tileH * zoom);
    cellW = Math.trunc(defaultSizes.cellW * zoom);
    cellH = Math.trunc(defaultSizes.cellH * zoom);

    font = fontTemplate.replace("$", 16 * zoom);
    specialCharFont = specialCharFontTemplate.replace("$", 16 * zoom);

    tileC = defaultSizes.tileC;
    tileR = defaultSizes.tileR;
    tileArea = tileC * tileR;
}
updateScaleConsts();

var dTileW = tileW; // permanent tile sizes in pixel (remains same throughout client's session)
var dTileH = tileH;

// used to stretch background images
var backgroundImageCanvasRenderer = document.createElement("canvas");
backgroundImageCanvasRenderer.width = tileW;
backgroundImageCanvasRenderer.height = tileH;
var backgroundImageCtx = backgroundImageCanvasRenderer.getContext("2d");

// performs the zoom calculations and changes all constants
function doZoom(percentage) {
    if(percentage < 20 || percentage > 1000) {
        return;
    }
    percentage = decimal(percentage);
    zoom = percentage;

    // modify all pixel sizes
    tileW = defaultSizes.tileW * zoom;
    tileH = defaultSizes.tileH * zoom;
    cellW = defaultSizes.cellW * zoom;
    cellH = defaultSizes.cellH * zoom;
    font = fontTemplate.replace("$", 16 * zoom);
    specialCharFont = specialCharFontTemplate.replace("$", 16 * zoom);

    // if the tile system has loaded yet. otherwise, update it
    if(window.tilePixelCache) {
        // modify invisible-link size
        linkDiv.style.width = (cellW + (linkMargin * 2)) + "px";
        linkDiv.style.height = (cellH + (linkMargin * 2)) + "px";

        textLayerCtx.clearRect(0, 0, width, height);
        // change size of tiles
        for(var i in tilePixelCache) {
            var canvas = tilePixelCache[i][0];
            canvas.width = tileW;
            canvas.height = tileH;
            var ctx = tilePixelCache[i][1];
            ctx.font = font;
        }
        renderTiles(true);
    }
}

// called from the zoombar, adjusts client position to be in center
function changeZoom(percentage) {
    zoombar.value = percentage;
    positionX /= zoom;
    positionY /= zoom;
    doZoom(percentage);
    positionX *= zoom;
    positionY *= zoom;
    positionX = Math.trunc(positionX); // remove decimals
    positionY = Math.trunc(positionY);
    renderTiles();
}

function browserZoomAdjust(initial) {
    var ratio = window.devicePixelRatio;
    if(!ratio) ratio = 1;
    if(zoomRatio == ratio && !initial) return; // ratio is still the same, do nothing
    positionX /= zoomRatio;
    positionY /= zoomRatio;
    zoomRatio = ratio;
    positionX *= zoomRatio;
    positionY *= zoomRatio;
    positionX = Math.trunc(positionX); // remove decimals
    positionY = Math.trunc(positionY);

    adjust_scaling_DOM(ratio);
    doZoom(ratio * 100);
}

function removeAlpha(data) {
    var res = [];
    var len = data.length / 4;
    for(var i = 0; i < len; i++) {
        var indx = i * 4;
        res.push(data[indx + 0]);
        res.push(data[indx + 1]);
        res.push(data[indx + 2]);
    }
    return res;
}

var tileProtectAuto = {
	selected: {},
	selectedTile: null,
	xPos: 0,
	yPos: 0,
	mode: 0,
	ctrlDown: false,
	shiftDown: false,
	clearSelections: function() {
		for(var i in tileProtectAuto.selected){
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
    var tile = tiles[currentPosition[1] + "," + currentPosition[0]];
    if(!tile) return;
    if(!tile.initted) return;
    tileProtectAuto.selectedTile = tile;
    var tileX = currentPosition[0];
    var tileY = currentPosition[1];
    var charX = currentPosition[2];
    var charY = currentPosition[3];
    tileProtectAuto.xPos = tileX;
    tileProtectAuto.yPos = tileY;
    tileProtectAuto.charXPos = charX;
    tileProtectAuto.charYPos = charY;
    if(tileProtectAuto.ctrlDown) {
        var mode = tileProtectAuto.mode;
        if(protectPrecision == 0) {
            tileProtectAuto.selected[tileY + "," + tileX] =
                [protectPrecision, mode, tile, currentPosition];
        } else if(protectPrecision == 1) {
            tileProtectAuto.selected[tileY + "," + tileX + "," + charY + "," + charX] =
                [protectPrecision, mode, tile, currentPosition];
        }
        var colors = ["red", "green", "blue", "teal"];
        var color = colors[mode];
        if(protectPrecision == 0) {
            tile.backgroundColor = color;
        } else if(protectPrecision == 1) {
            colorChar(tileX, tileY, charX, charY, w.protect_bg, true);
        }
        renderTile(tileX, tileY, true);
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
            renderTile(tileX, tileY);
        }
    }
}
document.addEventListener("mousemove", mousemove_tileProtectAuto)

function keydown_tileProtectAuto(e) {
    if(!worldFocused) return;
    if(checkKeyPress(e, keyConfig.autoApply)) { // Alt/Ctrl + S to protect tiles
        var selected = tileProtectAuto.selected;
        var types = ["owner-only", "member-only", "public"];
        var keys = Object.keys(selected);
        if(keys.length == 0) return;
        if(e.ctrlKey) e.preventDefault();
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
            var charX = selected[i][3][2];
            var charY = selected[i][3][3];

            var data = {
                tileY: tileY,
                tileX: tileX
            }

            var action;
            if(prot == 3) {
                action = "unprotect";
            } else {
                action = "protect";
                data.type = types[prot];
            }

            if(precision == 1) {
                data.charX = charX;
                data.charY = charY;
                data.precise = true;
            }

            w.socket.send(JSON.stringify({
                kind: "protect",
                data: data,
                action: action
            }))

            autoTotal--;
            updateAutoProg();
            if(precision == 0) {
                selected[i][2].backgroundColor = "";
                delete selected[i];
                renderTile(tileX, tileY);
            } else if(precision == 1) {
                delete selected[i];
                uncolorChar(tileX, tileY, charX, charY);
                renderTile(tileX, tileY, true);
            }

            if(idx >= keys.length) return;
            setTimeout(step, 10);
        }
        step();

    } else {
        tileProtectAuto.ctrlDown = checkKeyPress(e, keyConfig.autoSelect);
        tileProtectAuto.shiftDown = checkKeyPress(e, keyConfig.autoDeselect);
    }
}
document.body.addEventListener("keydown", keydown_tileProtectAuto)

// Fast linking
function mousemove_linkAuto() {
    if(!linkAuto.active) return;
    var tile = tiles[currentPosition[1] + "," + currentPosition[0]];
    if(!tile) return;
    if(!tile.initted) return;
    
    var tileX, tileY, charX, charY;
    
    tileX = currentPosition[0];
    tileY = currentPosition[1];
    
    charX = currentPosition[2];
    charY = currentPosition[3];
    
    var color = "blue";
    if(linkAuto.mode == 1) {
        color = "green";
    }

    if(linkAuto.ctrlDown) {
        colorChar(tileX, tileY, charX, charY, color);
        renderTile(tileX, tileY, true);
        var ar = [tileX, tileY, charX, charY, linkAuto.mode];
        if(linkAuto.mode == 0) {
            ar.push([linkAuto.url])
        } else if(linkAuto.mode == 1) {
            ar.push([linkAuto.coordTileX, linkAuto.coordTileY]);
        }
        linkAuto.selected[tileY + "," + tileX + "," + charY + "," + charX] = ar;
    }
    if(linkAuto.shiftDown) {
        var elm = linkAuto.selected[tileY + "," + tileX + "," + charY + "," + charX];
        if(elm !== void 0) {
            uncolorChar(tileX, tileY, charX, charY);
            renderTile(tileX, tileY, true);
            delete linkAuto.selected[tileY + "," + tileX + "," + charY + "," + charX];
        }
    }
}
document.addEventListener("mousemove", mousemove_linkAuto)

function keydown_linkAuto(e) {
    if(!worldFocused) return;
    if(checkKeyPress(e, keyConfig.autoApply)) { // Alt/Ctrl + S to add links
        var selected = linkAuto.selected;
        var keys = Object.keys(selected);
        if(keys.length == 0) return;
        if(e.ctrlKey) e.preventDefault();
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

            var data = {
                tileY: tileY,
                tileX: tileX,
                charY: charY,
                charX: charX
            }

            var link_type;
            if(mode == 0) {
                data.url = w.url_input;
                link_type = "url";
                data.url = linkData[0];
            } else if(mode == 1) {
                data.link_tileX = w.coord_input_x;
                data.link_tileY = w.coord_input_y;
                link_type = "coord";
                data.link_tileX = linkData[0];
                data.link_tileY = linkData[1];
            }

            w.socket.send(JSON.stringify({
                kind: "link",
                data: data,
                type: link_type
            }))

            autoTotal--;
            updateAutoProg();
            delete selected[i];
            uncolorChar(tileX, tileY, charX, charY);
            renderTile(tileX, tileY, true);

            if(idx >= keys.length) return;
            setTimeout(step, 10);
        }
        step();
    } else {
        linkAuto.ctrlDown = checkKeyPress(e, keyConfig.autoSelect);
        linkAuto.shiftDown = checkKeyPress(e, keyConfig.autoDeselect);
    }
}
document.body.addEventListener("keydown", keydown_linkAuto)

function onKeyUp(e) {
    var sel = checkKeyPress(e, keyConfig.autoSelect);
    var des = checkKeyPress(e, keyConfig.autoDeselect);
    linkAuto.ctrlDown = sel;
    linkAuto.shiftDown = des;
    tileProtectAuto.ctrlDown = sel;
    tileProtectAuto.shiftDown = des;
}
document.body.addEventListener("keyup", onKeyUp)

// adjust canvas width, canvas display width, and variable width to
// disobey the browser zoom so that the custom zoom can be used
function adjust_scaling_DOM(ratio) {
    var window_width = getWndWidth();
    var window_height = getWndHeight();
    // change variable sizes to the screen-width of the inner browser (same, regardless of zoom)
    width = Math.round(window_width * ratio);
    height = Math.round(window_height * ratio);
    // make size of canvas the size of the inner browser screen-size
    owot.width = Math.round(window_width * ratio);
    owot.height = Math.round(window_height * ratio);
    // make the display size the size of the viewport
    owot.style.width = window_width + "px";
    owot.style.height = window_height + "px";
    // comments above apply below
    textLayer.width = Math.round(window_width * ratio);
    textLayer.height = Math.round(window_height * ratio);
    textLayer.style.width = window_width + "px";
    textLayer.style.height = window_height + "px";
}

window.addEventListener("resize", function(e) {
    var ratio = window.devicePixelRatio;
    if(!ratio) ratio = 1;

    adjust_scaling_DOM(ratio);

    browserZoomAdjust();
    renderTiles();
})

// fix zooming blurriness issue
browserZoomAdjust(true);

function getChar(tileX, tileY, charX, charY) {
	var tile = tiles[tileY + "," + tileX];
	if(!tile) return " ";
	var content = advancedSplit(tile.content);
	return content[charY * tileC + charX];
}

function getCharColor(tileX, tileY, charX, charY) {
    var tile = tiles[tileY + "," + tileX];
    if(!tile) return 0;
    if(!tile.properties.color) return 0;
	return tile.properties.color[charY * tileC + charX];
}

// copy individual chars
document.addEventListener("keydown", function(e) {
    if(w._state.uiModal) return;
    if(!worldFocused) return;
    var textCursorCopy = checkKeyPress(e, keyConfig.copyCharacterText);
    var mouseCursorCopy = checkKeyPress(e, keyConfig.copyCharacterMouse);
    if(!textCursorCopy && !mouseCursorCopy) return;
    textInput.value = "";
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
	var char = getChar(tileX, tileY, charX, charY)
    w.clipboard.copy(char);
})

// color picker
document.addEventListener("keydown", function(e) {
    if(!worldFocused) return;
    if(!checkKeyPress(e, keyConfig.copyColor)) return;
    textInput.value = "";
    // alt + c to use color of text cell (where mouse cursor is) as main color
    var pos = currentPosition;
    if(!pos) return;
    var tileX = pos[0];
	var tileY = pos[1];
	var charX = pos[2];
    var charY = pos[3];
    var color = getCharColor(tileX, tileY, charX, charY)
    YourWorld.Color = color;
    localStorage.setItem("color", color);
    // update color textbox in "change color" menu
    if(!color) color = 0;
    color_input_form_input.value = ("00000" + color.toString(16)).slice(-6);
})

owot.width = width;
owot.height = height;

var cursorCoords = null; // [tileX, tileY, charX, charY]. if mouse is deselected, the value is null.
var cursorCoordsCurrent = [0, 0, 0, 0, "NOT_INITTED"]; // cursorCoords that don't reset to null. [tileX, tileY, charX, charY]
var currentPosition = [0, 0, 0, 0]; // [tileX, tileY, charX, charY]
var currentPositionInitted = false;

var tiles = {};

var Tile = {};
Tile.set = function(tileX, tileY, data) {
    tiles[tileY + "," + tileX] = data;
}
Tile.delete = function(tileX, tileY) {
    var str = tileY + "," + tileX;
    if(str in tilePixelCache) {
        delete tilePixelCache[str][0];
        delete tilePixelCache[str]
    }
    delete tiles[str];
}

var ctx = owot.getContext("2d");
ctx.fillStyle = "#eee";
ctx.fillRect(0, 0, width, height);

var textLayerCtx = textLayer.getContext("2d");
textLayer.width = width;
textLayer.height = height;

if (!window.WebSocket && window.MozWebSocket)
    window.WebSocket = window.MozWebSocket;

var ws_path;
function createWsPath() {
    ws_path = "ws" + (window.location.protocol === "https:" ? "s" : "") + "://" + window.location.host + state.worldModel.pathname + "/ws/";
}
createWsPath();

var styles = {};

var menuStyle;
function menu_color(color) {
    // change menu color
    if(!window.menuStyle) {
        menuStyle = document.createElement("style")
        document.head.appendChild(menuStyle)
    }
    menuStyle.innerHTML = "#menu.hover, #nav { background: " + color + "; }"
}

function ajaxRequest(settings) {
    var req = new XMLHttpRequest();

    var formData = "";
    var ampAppend = false;
    if(settings.data) {
        for(var i in settings.data) {
            if(ampAppend) formData += "&";
            ampAppend = true;
            formData += encodeURIComponent(i) + "=" + encodeURIComponent(settings.data[i]);
        }
    }
    // append form data to url if this is a GET
    if(settings.type == "GET" && formData) {
        settings.url += "?" + formData;
    }
    var async = !!settings.async;
    req.open(settings.type, settings.url, !async);
    req.onload = function() {
        if(req.status >= 200 && req.status < 400) {
            if(settings.done) {
                settings.done(req.responseText, req);
            }
        } else {
            if(settings.error) {
                settings.error(req);
            }
        }
    }
    req.onerror = function() {
        if(settings.error) {
            settings.error(req);
        }
    }
    if(settings.type == "POST") {
        if(formData) req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        req.send(formData);
    } else {
        req.send();
    }
}

function defaultStyles() {
    return {
        owner: "#ddd",
        member: "#eee",
        public: "#fff",
        cursor: "#ff0",
        guestCursor: "#ffffee",
        text: "#000",
        menu: "#e5e5ff"
    };
}

// begin OWOT's client
function begin() {
    // get world style
    ajaxRequest({
        type: "GET",
        url: "/world_style/?world=" + state.worldModel.name,
        done: function(data) {
            try {
                data = JSON.parse(data);
                styles = data;
            } catch(e) {
                styles = defaultStyles();
            }
            menu_color(styles.menu);
            writability_styles = [styles.public, styles.member, styles.owner];
            createSocket();
        },
        error: function() {
            console.warn("An error occured while loading the world style");
            styles = defaultStyles();
            menu_color(styles.menu);
            writability_styles = [styles.public, styles.member, styles.owner];
            createSocket();
        }
    })
}

function stopLinkUI() {
    if(!lastLinkHover) return;
    if(!w.isLinking) return;
    w.isLinking = false;
    linkAuto.active = false;
    owot.style.cursor = "text";
    var tileX = lastLinkHover[0];
    var tileY = lastLinkHover[1];
    var charX = lastLinkHover[2];
    var charY = lastLinkHover[3];
    // remove highlight
    uncolorChar(tileX, tileY, charX, charY);
    renderTile(tileX, tileY, true);
}

function stopSelectionUI() {
    if(!lastSelectionHover) return;
    if(!w.isSelecting) return;
    w.isSelecting = false;
    owot.style.cursor = "text";
    var tileX = lastSelectionHover[0];
    var tileY = lastSelectionHover[1];
    var charX = lastSelectionHover[2];
    var charY = lastSelectionHover[3];
    // remove highlight
    uncolorChar(tileX, tileY, charX, charY);
    renderTile(tileX, tileY, true);
    regionSelected = false;
    regionCoordA = null;
    regionCoordB = null;
    w.regionSelect.hide();
}

function removeTileProtectHighlight() {
    if(!lastTileHover) return;
    var precision = lastTileHover[0];
    var tileX = lastTileHover[1];
    var tileY = lastTileHover[2];
    var charX = lastTileHover[3];
    var charY = lastTileHover[4];

    if(tiles[tileY + "," + tileX]) {
        if(precision == 0) {
            tiles[tileY + "," + tileX].backgroundColor = "";
        } else if(precision == 1) {
            uncolorChar(tileX, tileY, charX, charY);
        }
    }
    renderTile(tileX, tileY, true);
}

function stopTileUI() {
    if(!lastTileHover) return;
    if(!w.isProtecting) return;
    protect_precision.style.display = "none";
    w.isProtecting = false;
    tileProtectAuto.active = false;
    owot.style.cursor = "text";
    removeTileProtectHighlight();
}

function doLink() {
    if(!lastLinkHover) return;
    stopLinkUI()
    var tileX = lastLinkHover[0];
    var tileY = lastLinkHover[1];
    var charX = lastLinkHover[2];
    var charY = lastLinkHover[3];
    var data = {
        tileY: tileY,
        tileX: tileX,
        charY: charY,
        charX: charX
    }
    var link_type;
    if(w.link_input_type == 0) {
        data.url = w.url_input;
        link_type = "url";
    } else if(w.link_input_type == 1) {
        data.link_tileX = w.coord_input_x;
        data.link_tileY = w.coord_input_y;
        link_type = "coord";
    }
    w.socket.send(JSON.stringify({
        kind: "link",
        data: data,
        type: link_type
    }))
}

function doProtect() {
    if(!lastTileHover) return;
    stopTileUI();
    var tileX = lastTileHover[1];
    var tileY = lastTileHover[2];
    var types = ["public", "member-only", "owner-only"];
    var data = {
        tileY: tileY,
        tileX: tileX
    }
    var action;
    if(w.protect_type == null) {
        action = "unprotect";
    } else {
        action = "protect";
        data.type = types[w.protect_type];
    }
    if(protectPrecision == 1) {
        data.precise = true;
        data.charX = lastTileHover[3];
        data.charY = lastTileHover[4];
    }
    w.socket.send(JSON.stringify({
        kind: "protect",
        data: data,
        action: action
    }))
}

function closest(element, parElement) {
    var currentElm = element;
    while(currentElm) {
        if(currentElm == parElement) return true;
        currentElm = currentElm.parentNode;
    }
    return false;
}

var dragStartX = 0;
var dragStartY = 0;
// the offset before clicking to drag
var dragPosX = 0;
var dragPosY = 0;
var isDragging = false;
function event_mousedown(e, arg_pageX, arg_pageY) {
    var target = e.target;
    if(closest(target, getChatfield()) || target == chatbar) {
        worldFocused = false;
    } else {
        worldFocused = true;
    }

    var pageX = Math.trunc(e.pageX * zoomRatio);
    var pageY = Math.trunc(e.pageY * zoomRatio);
    if(arg_pageX != void 0) pageX = arg_pageX;
    if(arg_pageY != void 0) pageY = arg_pageY;
    if(target != owot && target != linkDiv) {
        return;
    };
    dragStartX = pageX;
    dragStartY = pageY;
    dragPosX = positionX;
    dragPosY = positionY;
    isDragging = true;
    if(document.activeElement == textInput) textInput.focus(); // for mobile typing

    // stop paste
    clearInterval(pasteInterval);
    write_busy = false;
    textInput.value = "";

    if(w.isLinking) {
        doLink();
    }
    if(w.isProtecting) {
        doProtect();
    }
    if(w.isSelecting) {
        regionCoordA = currentPosition;
        w.regionSelect.show();
        w.regionSelect.setSelection(regionCoordA, regionCoordA);
        return;
    }
    owot.style.cursor = "move";
}
document.addEventListener("mousedown", function(e) {
    event_mousedown(e);
})
document.addEventListener("touchstart", function(e) {
    var pos = touch_pagePos(e);
    touchPosX = pos[0];
    touchPosY = pos[1];
    event_mousedown(e, pos[0], pos[1]);
})

// change cursor position
function renderCursor(coords) {
    var newTileX = coords[0];
    var newTileY = coords[1];
    var tileStr = newTileY + "," + newTileX;
    if(!tiles[tileStr]) return false;
    if(!tiles[tileStr].initted) return false;
    var writability = null;
    if(tiles[tileStr]) {
        writability = tiles[tileStr].properties.writability;
    }
    var thisTile = {
        initted: function() { return true },
        writability: writability,
        char: tiles[tileStr].properties.char
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
        if(cursorCoords) {
            cursorCoords = null;
            renderTile(tileX, tileY);
        }
        return false;
    }

    if(cursorCoords) {
        cursorCoords = null;
        renderTile(tileX, tileY);
    }
    cursorCoords = coords;
    cursorCoordsCurrent = coords;
    renderTile(coords[0], coords[1]);

    var pixelX = (coords[0] * tileW) + (coords[2] * cellW) + positionX + Math.trunc(width / 2);
    var pixelY = (coords[1] * tileH) + (coords[3] * cellH) + positionY + Math.trunc(height / 2);
    
    var diff = null;
    // keep record of old positions to check if they changed
    var posXCompare = positionX;
    var posYCompare = positionY;

    if(pixelX < 0) { // cursor too far left
        diff = Math.abs(pixelX);
        positionX += diff;
    }
    if(pixelX + cellW >= width) { // cursor too far right
        diff = width - pixelX;
        positionX -= cellW - diff;
    }
    if(pixelY < 0) { // cursor too far up
        diff = Math.abs(pixelY);
        positionY += diff;
    }
    if(pixelY + cellH >= height) { // cursor too far down
        diff = height - pixelY;
        positionY -= cellH - diff;
    }

    if(diff != null && (posXCompare != positionX || posYCompare != positionY)) renderTiles()
}

// remove cursor from view
function removeCursor() {
    if(!cursorCoords) return; // no cursor?
    var remTileX = cursorCoords[0];
    var remTileY = cursorCoords[1];
    cursorCoords = null;
    renderTile(remTileX, remTileY);
}

function stopDragging() {
    isDragging = false;
    owot.style.cursor = "text";
}

// tileX, charX
var lastX = [0, 0];
function event_mouseup(e, arg_pageX, arg_pageY) {
    var pageX = Math.trunc(e.pageX * zoomRatio);
    var pageY = Math.trunc(e.pageY * zoomRatio);
    if(arg_pageX != void 0) pageX = arg_pageX;
    if(arg_pageY != void 0) pageY = arg_pageY;
    stopDragging();

    for(var i = 0; i < draggable_element_mouseup.length; i++) {
        draggable_element_mouseup[i](e, pageX, pageY);
    }

    if(e.target != owot && e.target != linkDiv) return;

    if(e.which == 3) { // right click
        if(ignoreCanvasContext) {
            owot.style.pointerEvents = "none";
            setTimeout(function() {
                owot.style.pointerEvents = "";
            }, 1)
        }
        return;
    }

    if(w.isSelecting) {
        regionCoordB = currentPosition;
        handleRegionSelection();
        stopSelectionUI();
        return;
    }

    // set cursor
    var pos = getTileCoordsFromMouseCoords(pageX, pageY, true);
    if(tiles[pos[1] + "," + pos[0]] !== void 0) {
        lastX = [pos[0], pos[2]];
        // render the cursor and get results
        if(renderCursor(pos) == false) {
            // cursor should be removed if on area where user cannot write
            if(cursorCoords) {
                removeCursor();
            }
        }
    };
}
document.addEventListener("mouseup", function(e) {
    event_mouseup(e);
})
document.addEventListener("touchend", function(e) {
    event_mouseup(e, touchPosX, touchPosY);
})

document.addEventListener("mouseleave", function(e) {
    stopDragging();
})
document.addEventListener("mouseenter", function(e) {
    stopDragging();
})

function is_link(tileX, tileY, charX, charY) {
    if(tiles[tileY + "," + tileX]) {
        var tile = tiles[tileY + "," + tileX]
        if(tile) {
            var props = tile.properties.cell_props;
            if(!props) props = {};
            if(props[charY]) {
                if(props[charY][charX]) {
                    if(props[charY][charX].link) {
                        return [props[charY][charX].link];
                    }
                }
            }
        }
    }
    return false;
}

var surrogateRegexStr = "([\\uD800-\\uDBFF][\\uDC00-\\uDFFF])";
var surrogateRegex = new RegExp(surrogateRegexStr, "g");
var combiningRegexStr = "(([\\0-\\u02FF\\u0370-\\u1DBF\\u1E00-\\u20CF\\u2100-\\uD7FF\\uDC00-\\uFE1F\\uFE30-\\uFFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[\\uD800-\\uDBFF])([\\u0300-\\u036F\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F]+))";
var combiningRegex = new RegExp(combiningRegexStr, "g");
var splitRegex = new RegExp(surrogateRegexStr + "|" + combiningRegexStr + "|.|\\n|\\r", "g");

// Split a string properly with surrogates and combining characters in mind
function advancedSplit(str, noSurrog, noComb) {
    str += "";
    // look for surrogate pairs first. then look for combining characters. finally, look for the rest
	var data = str.match(splitRegex)
    if(data == null) return [];
    for(var i = 0; i < data.length; i++) {
        // contains surrogates without second character?
        if(data[i].match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g)) {
            data.splice(i, 1)
        }
        if((!surrogateCharsEnabled || noSurrog) && data[i].match(surrogateRegex)) {
            data[i] = "?";
        }
        if((!combiningCharsEnabled || noComb) && data[i].match(combiningRegex)) {
            data[i] = data[i].charAt(0);
        }
    }
	return data;
}

function containsNewLine(char) {
    for(var i = 0; i < char.length; i++) {
        if(char.charAt(i) == "\n") return true;
    }
}

var blankColor = (function() {
    var ar = [];
    for(var i = 0; i < tileArea; i++) {
        ar.push(0);
    }
    return ar;
})();

var writeBuffer = [];

function flushWrites() {
    var data = {
        kind: "write",
        edits: writeBuffer
    };
    w.socket.send(JSON.stringify(data));
    // clear buffer
    writeBuffer.splice(0);
}

var writeInterval = setInterval(function() {
    if(!writeBuffer.length) return;
    flushWrites()
}, 1000)

window.onbeforeunload = function() {
    if(writeBuffer.length) flushWrites();
}

function moveCursor(direction, do_not_change_enter_x) {
    if(!cursorCoords) return;
    var cSCopy = cursorCoords.slice();
    // [tileX, tileY, charX, charY]

    if(direction == "up") {
        cSCopy[3]--;
        if(cSCopy[3] < 0) {
            cSCopy[3] = tileR - 1;
            cSCopy[1]--
        }
    } else if(direction == "down") {
        cSCopy[3]++;
        if(cSCopy[3] > tileR - 1) {
            cSCopy[3] = 0;
            cSCopy[1]++;
        }
    } else if(direction == "left") {
        cSCopy[2]--;
        if(cSCopy[2] < 0) {
            cSCopy[2] = tileC - 1;
            cSCopy[0]--;
        }
    } else if(direction == "right") {
        cSCopy[2]++;
        if(cSCopy[2] > tileC - 1) {
            cSCopy[2] = 0;
            cSCopy[0]++;
        }
    }
    if(!do_not_change_enter_x) {
        lastX = [cSCopy[0], cSCopy[2]];
    }
    renderCursor(cSCopy);
}

function writeChar(char, doNotMoveCursor, temp_color) {
    var charColor = temp_color || YourWorld.Color;
    if(temp_color == 0) charColor = 0;
    var cursor = cursorCoords;
    if(!cursor && (char == "\n" || char == "\r")) {
        cursor = cursorCoordsCurrent;
    }
    char = advancedSplit(char);
    char = char[0];
    if(char == void 0) return;
    if(!cursor) return; // cursor is not visible?
    var tileX = cursor[0];
    var tileY = cursor[1];
    var charX = cursor[2];
    var charY = cursor[3];
    var newLine = containsNewLine(char);
    // first, attempt to move the cursor
    if(!doNotMoveCursor) {
        // get copy of cursor coordinates
        var cSCopy = cursor.slice();
        // move cursor to right
        cSCopy[2]++;
        if(cSCopy[2] >= tileC) {
            cSCopy[2] = 0;
            cSCopy[0]++;
        }
        if(newLine) {
            // move cursor down
            cSCopy[3]++;
            if(cSCopy[3] >= tileR) {
                cSCopy[3] = 0;
                cSCopy[1]++;
            }
            // move x position to last x position
            cSCopy[0] = lastX[0];
            cSCopy[2] = lastX[1];
        }
        renderCursor(cSCopy);
        // check if cursor hasn't moved
        if(cursorCoords) {
            var compare = cursor.slice(0);
            if(cursorCoords[0] == compare[0] && cursorCoords[1] == compare[1] &&
               cursorCoords[2] == compare[2] && cursorCoords[3] == compare[3]) {
                return null;
                // for the purpose of putting the paste feature on hold while
                // the tile is still loading
            }
        }
    }
    // add the character at where the cursor was from
    if(!newLine) {
        if(!tiles[tileY + "," + tileX]) {
            Tile.set(tileX, tileY, blankTile());
        }
        var cell_props = tiles[tileY + "," + tileX].properties.cell_props;
        if(!cell_props) cell_props = {};
        var color = tiles[tileY + "," + tileX].properties.color;
        if(!color) color = Object.assign([], blankColor);

        // delete link
        if(cell_props[charY]) {
            if(cell_props[charY][charX]) {
                delete cell_props[charY][charX];
            }
        }
        // change color
        if(Permissions.can_color_text(state.userModel, state.worldModel)) {
            color[charY * tileC + charX] = charColor;
            tiles[tileY + "," + tileX].properties.color = color;
        }

        // update cell properties (link positions)
        tiles[tileY + "," + tileX].properties.cell_props = cell_props;

        var con = tiles[tileY + "," + tileX].content;
        con = advancedSplit(con);
        // replace character
        con[charY * tileC + charX] = char;
        // join splitted content string
        tiles[tileY + "," + tileX].content = con.join("");
        // re-render
        renderTile(tileX, tileY, true)

        var editArray = [tileY, tileX, charY, charX, Date.now(), char, nextObjId];
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
}

function spaceTrim(str_array, left, right, gaps, secondary_array) {
    // secondary_array is an optional argument where elements are trimmed in parallel with str_array
    var marginLeft = 0;
    var marginRight = 0;
    var countL = left;
    var countR = right;
    for(var i = 0; i < str_array.length; i++) {
        var idxL = i;
        var idxR = str_array.length - 1 - i;
        if(str_array[idxL] == " " && countL) {
            marginLeft++;
        } else {
            countL = false;
        }
        if(str_array[idxR] == " " && countR) {
            marginRight++;
        } else {
            countR = false;
        }
        if(!countL && !countR) break;
    }
    if(marginLeft) {
        str_array.splice(0, marginLeft);
        if(secondary_array) secondary_array.splice(0, marginLeft);
    }
    if(marginRight) {
        str_array.splice(str_array.length - marginRight);
        if(secondary_array) secondary_array.splice(secondary_array.length - marginRight);
    }
    if(gaps) {
        var spaceFreq = 0;
        for(var i = 0; i < str_array.length; i++) {
            var chr = str_array[i];
            if(chr == " ") {
                spaceFreq++;
            } else {
                spaceFreq = 0;
            }
            if(spaceFreq > 1) {
                str_array.splice(i, 1);
                if(secondary_array) secondary_array.splice(i, 1);
                i--;
            }
        }
    }
    return str_array;
}

function convertToDate(epoch) {
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    var str = "";
    var date = new Date(epoch);
    var month = date.getMonth();
    var day = date.getDate();
    var year = date.getFullYear();
    var hour = date.getHours();
    var minute = date.getMinutes();

    str += year + " " + months[month] + " " + day + " ";

    var per = "AM";
    if(hour >= 12) {
        per = "PM";
    }
    if(hour > 12) {
        hour = hour - 12;
    }
    if(hour == 0) {
        hour = 12;
    }
    str += hour + ":" + ("0" + minute).slice(-2) + " " + per;

    return str;
}

// write characters inputted
var write_busy = false; // busy pasting
var pasteInterval;
var char_input_check = setInterval(function() {
    if(write_busy) return;
    var value = textInput.value;
    if(value == "") return;
    value = value.replace(/\r\n/g, "\n");
    value = value.replace(/\r/g, "\n");
    value = advancedSplit(value);
    var index = 1;
    if(value[0] == "\x1b") {
        index--;
    } else {
        writeChar(value[0]);
    }
    if(value.length == 1) {
        textInput.value = "";
        return
    };
    if(Permissions.can_paste(state.userModel, state.worldModel)) {
        write_busy = true;
        clearInterval(pasteInterval);
        var hex = "ABCDEF";
        var pasteColor = YourWorld.Color;
        pasteInterval = setInterval(function() {
            var chr = value[index];
            // colored paste
            if(chr == "\x1b") {
                var hCode = value[index + 1];
                var cCol = "";
                if(hCode == "x") {
                    cCol = "000000";
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
            } else {
                var res = writeChar(chr, false, pasteColor);
                if(res === null) { // write failed
                    return; // keep waiting until tile loads
                }
                index++;
            }
            if(index >= value.length) {
                textInput.value = "";
                clearInterval(pasteInterval);
                write_busy = false;
            }
        }, 1)
    } else {
        textInput.value = "";
    }
}, 10);

document.onkeydown = function(e) {
    if(!worldFocused) return;
    var key = getKeyCode(e);
    if(w._state.uiModal) return;
    if(document.activeElement == chatbar) return;
    if(document.activeElement != textInput) textInput.focus();
    // stop paste
    clearInterval(pasteInterval);
    write_busy = false;

    if(checkKeyPress(e, keyConfig.cursorUp)) { // arrow up
        moveCursor("up");
    }
    if(checkKeyPress(e, keyConfig.cursorDown)) { // arrow down
        moveCursor("down");
    }
    if(checkKeyPress(e, keyConfig.cursorLeft)) { // arrow left
        moveCursor("left");
    }
    if(checkKeyPress(e, keyConfig.cursorRight)) { // arrow right
        moveCursor("right");
    }
    if(checkKeyPress(e, keyConfig.reset)) { // esc
        stopLinkUI();
        stopTileUI();
        stopSelectionUI();
        removeCursor();
        tileProtectAuto.active = false;
        linkAuto.active = false;
    }
    if(checkKeyPress(e, keyConfig.erase)) { // erase character
        moveCursor("left", true);
        writeChar(" ", true);
    }
    if(checkKeyPress(e, keyConfig.tab)) { // tab
        for(var i = 0; i < 4; i++) writeChar(" ");
        e.preventDefault();
    }
}

var colors = ["#660066", "#003366", "#ff9900", "#ff0066", "#003300", "#ff0000", "#3a3a3a", "#006666", "#3399ff", "#3333ff", "#000000"]
function assignColor(username) {
	username = username.toUpperCase();
	var colLen = colors.length
	var usrLen = username.length
	var avg = 0;
	for(var i = 0; i < usrLen; i++) {
		var chr = username.charCodeAt(i);
		avg += (chr * chr | (i * chr) % 628) * (i << chr) + (chr*(i + 19 + (chr % 56))*chr)
	}
	return colors[(Math.abs(avg | 0)) % colLen]
}

function getTileCoordsFromMouseCoords(x, y, ignoreZoomRatio) {
    if(!ignoreZoomRatio) {
        x *= zoomRatio;
        y *= zoomRatio;
    }
    var tileX = 0;
    var tileY = 0;
    var charX = 0;
    var charY = 0;
    // position relative to position in client and mouse
    var mpX = x - positionX - Math.trunc(width / 2);
    var mpY = y - positionY - Math.trunc(height / 2);
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

function getRange(x1, y1, x2, y2) {
    var tmp;
    if(x1 > x2) {
        tmp = x1;
        x1 = x2;
        x2 = tmp;
    }
    if(y1 > y2) {
        tmp = y1;
        y1 = y2;
        y2 = tmp;
    }

    assert(intmax([x1, y1, x2, y2]), "Ranges too large")

    var coords = [];
    for(var y = y1; y <= y2; y++) {
        for(var x = x1; x <= x2; x++) {
            coords.push([x, y]);
            if(coords.length >= 10000) throw "Array too large";
        }
    }
    return coords;
}

function getVisibleTiles(margin) {
    if(!margin) margin = 0;
    var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin, true);
    var B = getTileCoordsFromMouseCoords(width - 1 + margin, height - 1 + margin, true);
    return getRange(A[0], A[1], B[0], B[1]);
}

function getWidth(margin) {
    if(!margin) margin = 0;
    var A = getTileCoordsFromMouseCoords(0 - margin, 0, true);
    var B = getTileCoordsFromMouseCoords(width - 1 + margin, 0, true);
    return B[0] - A[0] + 1;
}

function getHeight(margin) {
    if(!margin) margin = 0;
    var A = getTileCoordsFromMouseCoords(0, 0 - margin, true);
    var B = getTileCoordsFromMouseCoords(0, height - 1 + margin, true);
    return B[1] - A[1] + 1;
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
    x += Math.trunc(width / 2);
    y += Math.trunc(height / 2);
    return [Math.trunc(x/zoomRatio), Math.trunc(y/zoomRatio)];
}

function alertJS(data) {
    if(js_alert_active) return;
    js_alert_active = true;
    confirm_js.style.display = "";
    confirm_js_code.innerText = data;
    run_js_confirm_risk.href = "javascript:confirmRunJsLink(\"" + escapeQuote(data) + "\");"
    run_js_confirm.href = "javascript:confirmRunJsLink(null, true);"
    confirm_js_cancel.onclick = closeJSAlert;
    confirm_js_cancel_x.onclick = closeJSAlert;
}

function closeJSAlert() {
    if(!js_alert_active) return;
    js_alert_active = false;
    confirm_js.style.display = "none";
    run_js_confirm.href = "javascript:void 0;"
    run_js_confirm.innerText = "run";
    run_js_confirm_risk.style.display = "none";
}

function confirmRunJsLink(data, confirmWarning) {
    if(confirmWarning) {
        run_js_confirm_risk.style.display = "";
        run_js_confirm.text = "run ▲";
        return; 
    }
    var doRun = confirm("Are you sure you want to run this javascript link?\nPress cancel to NOT run it.\n\"" + escapeQuote(data.slice(0, 256)) + "\"");
    if(!doRun) return closeJSAlert();
    var link = document.createElement("a");
    link.href = data;
    link.click()
    closeJSAlert();
}

function runJsLink(data) {
    alertJS(data);
}

function escapeQuote(text) { // escapes " and ' and \
    return text.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"").replace(/\'/g, "\\'");
}

var linkMargin = 100; // px
var linkElm = document.createElement("a");
linkElm.href = "";
document.body.appendChild(linkElm);
var linkDiv = document.createElement("div");
linkDiv.style.width = (cellW + (linkMargin * 2)) + "px";
linkDiv.style.height = (cellH + (linkMargin * 2)) + "px";
linkElm.appendChild(linkDiv);
linkElm.style.position = "absolute";
linkElm.title = "Link to url...";
linkElm.style.display = "block";
linkElm.target = "_blank";
linkElm.style.cursor = "pointer";

var touchPosX = 0;
var touchPosY = 0;
function event_mousemove(e, arg_pageX, arg_pageY) {
    var pageX = e.pageX * zoomRatio;
    var pageY = e.pageY * zoomRatio;
    if(arg_pageX != void 0) pageX = arg_pageX;
    if(arg_pageY != void 0) pageY = arg_pageY;
    var coords = getTileCoordsFromMouseCoords(pageX, pageY, true)
    currentPosition = coords;
    currentPositionInitted = true;
    var tileX = coords[0];
    var tileY = coords[1];
    var charX = coords[2];
    var charY = coords[3];

    for(var i = 0; i < draggable_element_mousemove.length; i++) {
        draggable_element_mousemove[i](e, pageX, pageY);
    }

    if(e.target != owot && e.target != linkDiv) return;
    var link = is_link(tileX, tileY, charX, charY);
    if(link && linksEnabled && !w.isSelecting) {
        var pos = tileAndCharsToWindowCoords(tileX, tileY, charX, charY);
        linkElm.style.left = (pos[0] - linkMargin) + "px";
        linkElm.style.top = (pos[1] - linkMargin) + "px";
        linkElm.hidden = false;
        linkElm.onclick = "";
        linkElm.target = "_blank";
        linkElm.href = "";
        linkElm.onclick = null;
        linkElm.rel = "";
        if(link[0].type == "url") {
            var URL_Link = link[0].url;
            linkElm.href = URL_Link;
            var linkProtocol = linkElm.protocol;
            if(linkProtocol == "javascript:") {
                URL_Link = "javascript:runJsLink(\"" + escapeQuote(URL_Link) + "\");"
                linkElm.href = URL_Link;
            } else {
                linkElm.rel = "noopener noreferrer";
            }
            linkElm.title = "Link to URL " + linkElm.href;
        } else if(link[0].type == "coord") {
            var pos = link[0].link_tileX + "," + link[0].link_tileY;
            linkElm.title = "Link to coordinates " + pos;
            linkElm.href = "javascript:void(0);";
            linkElm.onclick = function() {
                w.doGoToCoord(link[0].link_tileY, link[0].link_tileX)
            }
            linkElm.target = "";
        }
    } else {
        linkElm.style.top = "-1000px";
        linkElm.style.left = "-1000px";
        linkElm.hidden = true;
    }

    // region selecting
    if(w.isSelecting) {
        if(lastSelectionHover) {
            var tileX = lastSelectionHover[0];
            var tileY = lastSelectionHover[1];
            var charX = lastSelectionHover[2];
            var charY = lastSelectionHover[3];
            uncolorChar(tileX, tileY, charX, charY);
            renderTile(tileX, tileY, true);
        }
        lastSelectionHover = currentPosition;
        var newTileX = currentPosition[0];
        var newTileY = currentPosition[1];
        var newCharX = currentPosition[2];
        var newCharY = currentPosition[3];
        if(tiles[newTileY + "," + newTileX]) {
            colorChar(newTileX, newTileY, newCharX, newCharY, "#9999e6", true);
            // re-render tile
            renderTile(newTileX, newTileY, true);
        }
        regionCoordB = currentPosition;
        if(regionCoordA && regionCoordB) w.regionSelect.setSelection(regionCoordA, regionCoordB);
    }

    // url/coordinate linking
    if(w.isLinking) {
        if(lastLinkHover) {
            var tileX = lastLinkHover[0];
            var tileY = lastLinkHover[1];
            var charX = lastLinkHover[2];
            var charY = lastLinkHover[3];
            uncolorChar(tileX, tileY, charX, charY);
            renderTile(tileX, tileY, true);
        }
        lastLinkHover = currentPosition;
        var newTileX = currentPosition[0];
        var newTileY = currentPosition[1];
        var newCharX = currentPosition[2];
        var newCharY = currentPosition[3];
        if(tiles[newTileY + "," + newTileX]) {
            colorChar(newTileX, newTileY, newCharX, newCharY, "#aaf", true);
            // re-render tile
            renderTile(newTileX, newTileY, true);
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
                if(tiles[tileY + "," + tileX] && !tileProtectAuto.selected[tileY + "," + tileX]) {
                    tiles[tileY + "," + tileX].backgroundColor = "";
                }
            } else if(precision == 1) {
                uncolorChar(tileX, tileY, charX, charY);
                renderTile(tileX, tileY, true);
            }
            renderTile(tileX, tileY, true);
        }
        var cp = currentPosition;
        lastTileHover = [protectPrecision, cp[0], cp[1], cp[2], cp[3]];
        var newTileX = currentPosition[0];
        var newTileY = currentPosition[1];
        var newCharX = currentPosition[2];
        var newCharY = currentPosition[3];
        if(protectPrecision == 0) {
            if(tiles[newTileY + "," + newTileX] && !tileProtectAuto.selected[newTileY + "," + newTileX]) {
                tiles[newTileY + "," + newTileX].backgroundColor = w.protect_bg;
                renderTile(newTileX, newTileY);
            }
        } else if(protectPrecision == 1) {
            if(tiles[newTileY + "," + newTileX]) {
                colorChar(newTileX, newTileY, newCharX, newCharY, w.protect_bg)
                renderTile(newTileX, newTileY, true);
            }
        }
    }

    // if dragging beyond window, stop
    if(pageX >= width || pageY >= height || pageX < 0 || pageY < 0) stopDragging();

    if(!isDragging || w.isSelecting) return;

    positionX = dragPosX + (pageX - dragStartX);
    positionY = dragPosY + (pageY - dragStartY);

    renderTiles();
}
document.addEventListener("mousemove", function(e) {
    event_mousemove(e);
})
document.addEventListener("touchmove", function(e) {
    e.preventDefault();
    var pos = touch_pagePos(e);
    touchPosX = pos[0];
    touchPosY = pos[1];
    event_mousemove(e, pos[0], pos[1]);
})

// get position from touch event
function touch_pagePos(e) {
    var first_touch = e.touches[0];
    return [Math.trunc(first_touch.pageX * zoomRatio), Math.trunc(first_touch.pageY * zoomRatio)];
}

document.addEventListener("wheel", function(e) {
    if(w._state.uiModal) return;
    // if focused on chat, don't scroll world
    if(closest(e.target, getChatfield())) return;
    if(e.ctrlKey) return; // don't scroll if ctrl is down (zooming)
    var deltaX = Math.trunc(e.deltaX);
    var deltaY = Math.trunc(e.deltaY);
    if(e.deltaMode) { // not zero (default)?
        deltaX = 0;
        deltaY = (deltaY / Math.abs(deltaY)) * 100;
    }
    if(checkKeyPress(e, keyConfig.sidewaysScroll)) { // if shift, scroll sideways
        deltaX = deltaY;
        deltaY = 0;
    }
    positionY -= deltaY;
    positionX -= deltaX;
    renderTiles();
})

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
        key: ""
    }
    for(var i = 0; i < combination.length; i++) {
        var key = combination[i];
        switch(key) {
            case "CTRL": map.ctrl = true; break;
            case "SHIFT": map.shift = true; break;
            case "ALT": map.alt = true; break;

            case "ESC": map.key = "Escape"; break;
            case "TAB": map.key = "Tab"; break;
            case "SPACE": map.key = " "; break;
            case "PAGEUP": map.key = "PageUp"; break;
            case "PAGEDOWN": map.key = "PageDown"; break;
            case "UP": map.key = "ArrowUp"; break;
            case "DOWN": map.key = "ArrowDown"; break;
            case "LEFT": map.key = "ArrowLeft"; break;
            case "RIGHT": map.key = "ArrowRight"; break;
            case "CAPS": map.key = "CapsLock"; break;
            case "END": map.key = "End"; break;
            case "HOME": map.key = "Home"; break;
            case "INSERT": map.key = "Insert"; break;
            case "DELETE": map.key = "Delete"; break;
            case "PLUS": map.key = "+"; break;
            case "MINUS": map.key = "-"; break;
            case "ENTER": map.key = "Enter"; break;
            case "BACKSPACE": map.key = "Backspace"; break;
            default: map.key = key;
        }
    }
    if(map.ctrl != e.ctrlKey) return false;
    if(map.shift != e.shiftKey) return false;
    if(map.alt != e.altKey) return false;
    var eKey = e.key;
    // key must not be Ctrl/Shift/Alt because it's already stored in a boolean
    if(eKey == "Control") eKey = "";
    if(eKey == "Shift") eKey = "";
    if(eKey == "Alt") eKey = "";
    if(eKey != void 0) if(map.key.toUpperCase() != eKey.toUpperCase()) return false;
    return true;
}

/*
    === cutRanges ===
    (returns a list of ranges based off unloaded tiles)
    map:    array of values determining if a tile has been loaded or not
    width:  the width of the view
    height: the height of the view
*/
function cutRanges(map, width, height) {
    function getPos(x, y) {
        if(x >= width || y >= height) return;
        return map[y * width + x];
    }
    
    var ranges = [];
    
    function fillRange(x1, y1, x2, y2) {
        ranges.push([x1, y1, x2, y2]);
        for(var y = y1; y <= y2; y++) {
            for(var x = x1; x <= x2; x++) {
                map[y * width + x] = 1;
            }
        }
    }
    
    function cut() {
        // reached uninitialized value
        var zeros = false;
        // current scanning position
        var x = 0;
        var y = 0;
        // starting position of range
        var startX = 0;
        var startY = 0;
        // ending position of range
        var endX = 0;
        var endY = 0;
        // width of range is final
        var endXSet = false;
        // x position of previous row scan
        var lastX = -1;
        for(var i = 0; i < width * height; i++) {
            var dat = getPos(x, y);
            // set first detected unitialized value as the starting point
            if(dat === 0 && !zeros) {
                zeros = true;
                startX = x;
                startY = y;
            }
            // we reached the edge of map and the next row contains initialized values
            if(dat === 1 && zeros && x <= endX) {
                endY--;
                fillRange(startX, startY, endX, endY);
                break;
            }
            // we hit a barrier
            if(dat === 1 && zeros) {
                var xTemp = x;
                // finalize range width
                if(!endXSet && lastX > -1) {
                    endX = lastX;
                    endXSet = true;
                }
                // move to next row
                x = startX;
                endY++;
                y++;
                // there is already a value, exit
                if(getPos(x, y)) {
                    endY--;
                    fillRange(startX, startY, endX, endY);
                    break;
                }
                // we reached the bottom, exit
                if(y >= height) {
                    endY--;
                    if(lastX === xTemp) {
                        endY--;
                    }
                    fillRange(startX, startY, endX, endY);
                    break;
                }
                continue;
            }
            lastX = x;
            x++;
            // we reached the right edge of the map
            if(x >= width) {
                // no width of range is defined, set it
                if(!endXSet && zeros && dat === 0 && lastX > -1) {
                    endX = lastX;
                    endXSet = true;
                }
                // move to next row
                x = startX;
                y++;
                endY++;
                // we reached the bottom of the map
                if(y >= height) {
                    endY--;
                    fillRange(startX, startY, endX, endY);
                    break;
                }
            }
        }
    }
    function containsBlank() {
        for(var i = 0; i < map.length; i++) {
            if(map[i] === 0) return true;
        }
        return false;
    }
    // ensure all unloaded tiles in the map are processed
    for(var i = 0; i < width * height; i++) {
        if(containsBlank()) {
            cut();
        } else {
            break;
        }
    }
    return ranges;
}

var fetchInterval;
var timesConnected = 0;
function createSocket() {
    socket = new ReconnectingWebSocket(ws_path);
    w.socket = socket;
    timesConnected++;

    socket.onmessage = function(msg) {
        var data = JSON.parse(msg.data);
        var kind = data.kind;
        if(ws_functions[kind]) {
            ws_functions[kind](data);
        }
    }

    socket.onopen = function(msg) {
        console.log("Connected socket");
        getAndFetchTiles();
        clearInterval(fetchInterval);
        fetchInterval = setInterval(function() {
            getAndFetchTiles();
        }, checkTileFetchInterval)
        if(timesConnected == 1) {
            if(Permissions.can_chat(state.userModel, state.worldModel)) {
                socket.send(JSON.stringify({
                    kind: "chathistory"
                }));
            }
            timesConnected++;
        }
    }

    socket.onclose = function() {
        console.log("Socket has closed. Reconnecting...");
    }
}

// fetches only unloaded tiles
function getAndFetchTiles() {
    var margin = 200; // px
    var data = getVisibleTiles(margin);
    
    var startX = data[0][0];
    var startY = data[0][1];

    // fill the map
    var map = [];
    for(var i = 0; i < data.length; i++) {
        var cell = data[i];
        var tileY = cell[1];
        var tileX = cell[0];
        var coord = tileY + "," + tileX;
        if(coord in tiles) {
            map.push(1);
        } else {
            map.push(0);
            Tile.set(tileX, tileY, null);
        }
    }
    var width = getWidth(margin);
    var height = Math.floor(map.length / width);
    var ranges = cutRanges(map, width, height);

    var toFetch = [];
    for(var i = 0; i < ranges.length; i++) {
        var range = ranges[i];
        toFetch.push({
            // the range cutter doesn't handle negative coords, so adjust them
            minX: range[0] + startX + tileFetchOffsetX,
            minY: range[1] + startY + tileFetchOffsetY,
            maxX: range[2] + startX + tileFetchOffsetX,
            maxY: range[3] + startY + tileFetchOffsetY
        });
    }
    if(toFetch.length > 0) {
        w.socket.send(JSON.stringify({
            fetchRectangles: toFetch,
            kind: "fetch"
        }))
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

function getPos(ref) {
    ref = ref.split(",");
    return [parseInt(ref[0]), parseInt(ref[1])];
}

// fixes cases where characters can break String.charAt() : https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charAt
function fixedCharAt(str, idx) {
    var ret = "";
    str += "";
    var end = str.length;
    var surrogatePairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
    while ((surrogatePairs.exec(str)) != null) {
        var li = surrogatePairs.lastIndex;
        if (li - 2 < idx) {
            idx++;
        } else {
            break;
        }
    }
    if (idx >= end || idx < 0) {
        return "";
    }
    ret += str.charAt(idx);
    if (/[\uD800-\uDBFF]/.test(ret) && /[\uDC00-\uDFFF]/.test(str.charAt(idx + 1))) {
        ret += str.charAt(idx + 1);
    }
    return ret;
}

function newColorArray() {
    var ar = [];
    for(var i = 0; i < tileArea; i++) {
        ar.push(0);
    }
    return ar;
}

// cache for individual tile pixel data
var tilePixelCache = {};

var world_writability = state.worldModel.writability;
// to be added by world_style
// index 0 = public, 1 = member, 2 = owner
var writability_styles = [];

var highlightFlash = {};
var highlightCount = 0;

function highlight(positions) {
    for(var i = 0; i < positions.length; i++) {
        var tileX = positions[i][0];
        var tileY = positions[i][1];
        var charX = positions[i][2];
        var charY = positions[i][3];
        if(highlightCount > highlightLimit) return;
        if(!highlightFlash[tileY + "," + tileX]) {
            highlightFlash[tileY + "," + tileX] = {};
        }
        if(!highlightFlash[tileY + "," + tileX][charY]) {
            highlightFlash[tileY + "," + tileX][charY] = {};
        }
        if(!highlightFlash[tileY + "," + tileX][charY][charX]) {
            highlightFlash[tileY + "," + tileX][charY][charX] = [Date.now(), 128];
            highlightCount++;
        }
    }
}

var flashAnimateInterval = setInterval(function() {
    if(!highlightCount) return;
    var tileGroup = {}; // tiles to re-render after highlight
    for(var tile in highlightFlash) {
        for(var charY in highlightFlash[tile]) {
            for(var charX in highlightFlash[tile][charY]) {
                var data = highlightFlash[tile][charY][charX];
                var time = data[0];
                // after 500 milliseconds
                if(Date.now() - time >= 500) {
                    delete highlightFlash[tile][charY][charX]
                    highlightCount--;
                } else {
                    // increase color brightness
                    highlightFlash[tile][charY][charX][1] += 2;
                    if(highlightFlash[tile][charY][charX][1] >= 255) {
                        highlightFlash[tile][charY][charX][1] = 255;
                    }
                }
                // mark tile to re-render
                tileGroup[tile] = 1;
            }
        }
    }
    // re-render tiles
    for(var i in tileGroup) {
        var pos = getPos(i);
        renderTile(pos[1], pos[0]);
    }
}, 1)

var blank = "";
for(var i = 0; i < tileArea; i++) blank += " ";

function blankTile() {
    var newTile = {
        content: blank,
        properties: {
            cell_props: {},
            writability: null,
            color: null
        },
        initted: false
    }
    newTile.properties.color = Object.assign([], blankColor);
    return newTile;
}

// format:
/*
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
var coloredChars = {};

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

function getTileCanvas(str) {
    var textRenderCanvas = tilePixelCache[str];
    var textRender;
    if(!textRenderCanvas) {
        textRenderCanvas = document.createElement("canvas");
        textRenderCanvas.width = cellW * tileC;
        textRenderCanvas.height = cellH * tileR;
        textRender = textRenderCanvas.getContext("2d");
        textRender.font = font;
        tilePixelCache[str] = [textRenderCanvas, textRender];
    } else {
        textRender = tilePixelCache[str][1];
    }
    return [textRenderCanvas, textRender];
}

function generateBackgroundPixels(tileX, tileY, image, returnCanvas) {
    var tileWidth = Math.trunc(tileW);
    var tileHeight = Math.trunc(tileH);
    if(returnCanvas) {
        // returning a canvas (for scaling purposes), so use the constant tile sizes
        tileWidth = Math.trunc(dTileW);
        tileHeight = Math.trunc(dTileH);
    }
    var imgData = textLayerCtx.createImageData(tileWidth, tileHeight);
    if(!image) { // image doesn't exist, return as how it is
        return imgData;
    }
    var fromData = image[0]; // pixel data (RGBA)
    var img_width = image[1];
    var img_height = image[2];
    // [pixels] where the tile starts in the client (offset relative to 0,0)
    var startX = tileX * tileWidth;
    var startY = tileY * tileHeight;
    // start drawing the pixels
    for(var y = 0; y < tileHeight; y++) {
        for(var x = 0; x < tileWidth; x++) {
            var posX = startX + x;
            var posY = startY + y;
            // perform calculation to get chunk out of the image tiles
            posX = posX - Math.floor(posX / img_width) * img_width;
            posY = posY - Math.floor(posY / img_height) * img_height;
            var index = (posY * img_width + posX) * 4;
            var destIndex = (y * tileWidth + x) * 4;
            imgData.data[destIndex + 0] = fromData[index + 0];
            imgData.data[destIndex + 1] = fromData[index + 1];
            imgData.data[destIndex + 2] = fromData[index + 2];
            imgData.data[destIndex + 3] = fromData[index + 3];
        }
    }
    if(returnCanvas) { // return canvas version of background
        backgroundImageCtx.putImageData(imgData, 0, 0);
        return backgroundImageCanvasRenderer;
    }
    return imgData;
}

function isTileVisible(tileX, tileY) {
    var tilePosX = tileX * tileW + positionX + Math.trunc(width / 2);
    var tilePosY = tileY * tileH + positionY + Math.trunc(height / 2);
    // too far left or top. check if the right/bottom edge of tile is also too far left/top
    if((tilePosX < 0 || tilePosY < 0) && (tilePosX + tileW - 1 < 0 || tilePosY + tileH - 1 < 0)) {
        return false;
    }
    // too far right or bottom
    if(tilePosX >= width || tilePosY >= height) {
        return false;
    }
    return true
}

var base64table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/*
	Writability format (tiles and chars):
		null: The parent's writability
		0: public
		1: members
		2: owners
*/
function decodeCharProt(str) {
    if(str.charAt(0) != "@") {
        console.error("Unrecognized char-protection format");
        return;
    }
    var res = new Array(128).fill(0);
    str = str.substr(1);
    for(var i = 0; i < str.length; i++) {
        var code = base64table.indexOf(str.charAt(i));
        var char1 = Math.trunc(code / (4*4) % 4);
        var char2 = Math.trunc(code / (4) % 4);
        var char3 = Math.trunc(code / (1) % 4);
        res[i*3 + 0] = char1;
        if(i*3 + 1 > 127) break;
        res[i*3 + 1] = char2;
        if(i*3 + 2 > 127) break;
        res[i*3 + 2] = char3;
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
function encodeCharProt(array) {
    // convert array from writability-format to base64-format
    for(var c = 0; c < array.length; c++) {
        switch(array[c]) {
            case null: array[c] = 0; continue;
            case 0: array[c] = 1; continue;
            case 1: array[c] = 2; continue;
            case 2: array[c] = 3; continue;
        }
    }
    var str = "@";
    var bytes = Math.ceil(128 / 3)
    for(var i = 0; i < bytes; i++) {
        var idx = i * 3;
        var char1 = ((4*4)*array[idx + 0]);
        var char2 = ((4)*array[idx + 1])
        var char3 = ((1)*array[idx + 2])
        if(idx + 1 > 127) char2 = 0;
        if(idx + 2 > 127) char3 = 0;
        var code = char1 + char2 + char3;
        str += base64table.charAt(code)
    }
    return str;
}

function renderTile(tileX, tileY, redraw) {
    if(!isTileVisible(tileX, tileY)) {
        return;
    }
    var str = tileY + "," + tileX;
    var offsetX = tileX * tileW + Math.trunc(width / 2) + positionX;
    var offsetY = tileY * tileH + Math.trunc(height / 2) + positionY;

    // unloaded tiles
    if(!tiles[str] || (tiles[str] && !tiles[str].initted)) {
        // unloaded tile background is already drawn
        if(tilePixelCache[str]) {
            textLayerCtx.clearRect(offsetX, offsetY, tileW, tileH);
            textLayerCtx.drawImage(tilePixelCache[str][0], offsetX, offsetY)
            return;
        }
        // generate tile background
        var imgData = generateBackgroundPixels(tileX, tileY, images.unloaded, true);
        // get main canvas of the tile
        var tileCanv = getTileCanvas(str);
        // get the canvas context
        var textRender = tileCanv[1];
        textRender.drawImage(imgData, 0, 0, tileW, tileH);
        textLayerCtx.clearRect(offsetX, offsetY, tileW, tileH);
        textLayerCtx.drawImage(tilePixelCache[str][0], offsetX, offsetY)
        return;
    }

    var tile = tiles[str];

    if(tile == null) {
        Tile.set(tileX, tileY, blankTile());
        tile = tiles[str];
    }

    var writability = null;

    // make sure tile is not null before getting the writability
    if(tile) writability = tile.properties.writability;

    // placeholder in case writability is null
    var temp_writability = writability;

    if(!tile.backgroundColor) {
        if(writability == null) temp_writability = world_writability;
        if(temp_writability == 0) ctx.fillStyle = styles.public;
        if(temp_writability == 1) ctx.fillStyle = styles.member;
        if(temp_writability == 2) ctx.fillStyle = styles.owner;
    } else {
        ctx.fillStyle = tile.backgroundColor;
    }

    // put this right below the changes to fillStyle for tiles' background color
    var tileColor = ctx.fillStyle;
    var tileColorInverted = "#" + ("00000" + (16777215 - parseInt(tileColor.substr(1), 16)).toString(16)).slice(-6);

    // fill tile background color
    ctx.fillRect(offsetX, offsetY, tileW, tileH);

    // render char protections
    if(tile.properties.char && !tile.backgroundColor) {
        function plotCharProt(x, y, writability) {
            if(writability == null) return;
            
            if(writability == 0) ctx.fillStyle = styles.public;
            if(writability == 1) ctx.fillStyle = styles.member;
            if(writability == 2) ctx.fillStyle = styles.owner;

            ctx.fillRect(offsetX + x * cellW, offsetY + y * cellH, cellW, cellH);
        }
        for(var p = 0; p < 128; p++) {
            var code = tile.properties.char[p];
            plotCharProt(p % 16, Math.floor(p / 16), code);
        }
    }

    // render cursor
    if(cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
        var charX = cursorCoords[2];
        var charY = cursorCoords[3];
        ctx.fillStyle = styles.cursor;
        ctx.fillRect(offsetX + charX * cellW, offsetY + charY * cellH, cellW, cellH);
    }

    var highlight = highlightFlash[str];
    if(!highlight) highlight = {};

    // render edit highlight animation
    for(var y = 0; y < tileR; y++) {
        for(var x = 0; x < tileC; x++) {
            if(highlight[y]) {
                if(highlight[y][x] !== void 0) {
                    ctx.fillStyle = "rgb(255,255," + highlight[y][x][1] + ")";
                    ctx.fillRect(offsetX + x * cellW, offsetY + y * cellH, cellW, cellH);
                }
            }
        }
    }

    function drawGrid(canv, isTileCanvas) {
        if(gridEnabled) {
            var thisOffsetX = offsetX;
            var thisOffsetY = offsetY;

            if(isTileCanvas) {
                thisOffsetX = 0;
                thisOffsetY = 0;
            }

            if(subgridEnabled) {
                canv.fillStyle = "#B9B9B9";
                for(var x = 1; x < tileC; x++) {
                    for(var y = 1; y < tileR; y++) {
                        canv.fillRect(thisOffsetX, thisOffsetY + tileH - zoom - (y * cellH), tileW, zoom);
                        canv.fillRect(thisOffsetX + tileW - zoom - (x * cellW), thisOffsetY, zoom, tileH);
                    }
                }
            }

            canv.fillStyle = tileColorInverted;
            canv.fillRect(thisOffsetX, thisOffsetY + tileH - zoom, tileW, zoom);
            canv.fillRect(thisOffsetX + tileW - zoom, thisOffsetY, zoom, tileH);
        }
    }

    // tile is null, so don't add text/color data
    if(!tile) {
        drawGrid(ctx);
        return;
    };

    // tile is already written
    // (force redraw if tile hasn't been drawn before and it's initted)
    if(tilePixelCache[str] && !redraw && !tile.redraw && !(!tile.been_drawn && tile.initted)) {
        textLayerCtx.clearRect(offsetX, offsetY, tileW, tileH);
        textLayerCtx.drawImage(tilePixelCache[str][0], offsetX, offsetY)
        return;
    }
    // tile has been drawn at least once
    tile.been_drawn = true;

    // tile is being redrawn via boolean (draw next time renderer is called), so set it back to false
    if(tile.redraw) {
        delete tile.redraw;
    }

    var tileCanv = getTileCanvas(str);
    var textRender = tileCanv[1];

    // first, clear text renderer canvas
    textRender.clearRect(0, 0, tileW, tileH);
    if(images.background && backgroundEnabled) {
        var background_data = generateBackgroundPixels(tileX, tileY, images.background, true);
        textRender.drawImage(background_data, 0, 0, tileW, tileH)
    }

    var content = tile.content;
    var colors = tile.properties.color;
    // color data doesn't exist, use empty array as placeholder
    if(!colors) colors = newColorArray();

    var props = tile.properties.cell_props;
    if(!props) props = {};

    content = advancedSplit(content);
    // fillText is always off by 5 pixels, adjust it
    var textYOffset = cellH - (5 * zoom);
    for(var y = 0; y < tileR; y++) {
        for(var x = 0; x < tileC; x++) {
            // fill background if defined
            if(coloredChars[str]) {
                if(coloredChars[str][y]) {
                    if(coloredChars[str][y][x]) {
                        var color = coloredChars[str][y][x];
                        textRender.fillStyle = color;
                        textRender.fillRect(x * cellW, y * cellH, cellW, cellH);
                    }
                }
            }

            var char = content[y * tileC + x];
            var color = colors[y * tileC + x];
            // initialize link color to default text color in case there's no link to color
            var linkColor = styles.text;
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
            var cCode = char.charCodeAt(0);

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
                textRender.fillRect(x * cellW, (y * cellH + textYOffset + zoom), cellW, zoom)
            }
            if(char != "\u0020" && char != "\u00a0") { // ignore whitespace characters
                if(cCode >= 0x2800 && cCode <= 0x28FF && brBlockFill) { // render braille chars as rectangles
                    var dimX = cellW / 2;
                    var dimY = cellH / 4;
                    if((cCode >> 0) & 1) textRender.fillRect(x * cellW, y * cellH, dimX, dimY);
                    if((cCode >> 3) & 1) textRender.fillRect(x * cellW + dimX, y * cellH, dimX, dimY);
                    if((cCode >> 1) & 1) textRender.fillRect(x * cellW, y * cellH + dimY, dimX, dimY);
                    if((cCode >> 4) & 1) textRender.fillRect(x * cellW + dimX, y * cellH + dimY, dimX, dimY);
                    if((cCode >> 2) & 1) textRender.fillRect(x * cellW, y * cellH + dimY * 2, dimX, dimY);
                    if((cCode >> 5) & 1) textRender.fillRect(x * cellW + dimX, y * cellH + dimY * 2, dimX, dimY);
                    if((cCode >> 6) & 1) textRender.fillRect(x * cellW, y * cellH + dimY * 3, dimX, dimY);
                    if((cCode >> 7) & 1) textRender.fillRect(x * cellW + dimX, y * cellH + dimY * 3, dimX, dimY);
                } else if(char == "\u2588" && ansiBlockFill) { // █ full block
                    textRender.fillRect(x * cellW, y * cellH, cellW, cellH);
                } else if(char == "\u2580" && ansiBlockFill) { // ▀ top half block
                    textRender.fillRect(x * cellW, y * cellH, cellW, Math.trunc(cellH / 2));
                } else if(char == "\u2584" && ansiBlockFill) { // ▄ bottom half block
                    textRender.fillRect(x * cellW, y * cellH + Math.trunc(cellH / 2), cellW, Math.trunc(cellH / 2));
                } else if(char == "\u258c" && ansiBlockFill) { // ▌ left half block
                    textRender.fillRect(x * cellW, y * cellH, Math.trunc(cellW / 2), cellH);
                } else if(char == "\u2590" && ansiBlockFill) { // ▐ right half block
                    textRender.fillRect(x * cellW + Math.trunc(cellW / 2), y * cellH, Math.trunc(cellW / 2), cellH);
                } else { // character rendering
                    var mSpec = (char.charCodeAt(1) == 822) && mSpecRendering;
                    if(char.length > 1 && !mSpec) textRender.font = specialCharFont;
                    if(mSpec) char = char.replace(String.fromCharCode(822), "");
                    textRender.fillText(char, x * cellW + XPadding, y * cellH + textYOffset); // render text
                    if(char.length > 1 && !mSpec) textRender.font = font;
                    if(mSpec) textRender.fillRect(x * cellW, y * cellH + cellH - 9 * zoom, cellW, zoom);
                }
            }
        }
    }
    drawGrid(textRender, true);

    // add image to main canvas
    textLayerCtx.clearRect(offsetX, offsetY, tileW, tileH);
    textLayerCtx.drawImage(tilePixelCache[str][0], offsetX, offsetY)
}

function renderTiles(redraw) {
    // update coordinate display
    var tileCoordX = Math.floor(-positionX / tileW);
    var tileCoordY = Math.floor(-positionY / tileH);
    var centerY = -Math.floor(tileCoordY / 4);
    var centerX = Math.floor(tileCoordX / 4);
    coord_Y.innerText = centerY;
    coord_X.innerText = centerX;

    if(redraw) {
        for(var i in tiles) {
            if(tiles[i]) {
                tiles[i].redraw = true;
            }
        }
    }

    ctx.fillStyle = "#ddd";
    // clear tile color layer
    ctx.fillRect(0, 0, width, height);
    // clear text layer
    textLayerCtx.clearRect(0, 0, width, height);
    // get all visible tiles
    var visibleTiles = getVisibleTiles();
    for(var i in visibleTiles) {
        var tileX = visibleTiles[i][0];
        var tileY = visibleTiles[i][1];
        renderTile(tileX, tileY);
    }

    w.callEvent("tilesRendered");
}

function protectPrecisionOption(option) { // 0 being tile and 1 being char
    protectPrecision = option;
    removeTileProtectHighlight();
    var tileChoiceColor = "";
    var charChoiceColor = "";
    switch(option) {
        case 0:
            tileChoiceColor = "#FF6600";
            break;
        case 1:
            charChoiceColor = "#FF6600";
    }
    tile_choice.style.backgroundColor = tileChoiceColor;
    char_choice.style.backgroundColor = charChoiceColor;
}
protectPrecisionOption(protectPrecision);

var menu;
function buildMenu() {
    menu = new Menu(menu_elm, nav_elm);
    menu.addEntry("<li><a href=\"/home/\" target=\"_blank\">More...&nbsp;<img src=\"/static/Icon_External_Link.png\"></a></li>");
    menu.addCheckboxOption(" Show coordinates", function() {
        return coords.style.display = "";
    }, function() {
        return coords.style.display = "none";
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
    menu.addCheckboxOption(" Toggle grid", function() {
        gridEnabled = true;
        renderTiles(true);
    }, function() {
        gridEnabled = false;
        renderTiles(true);
    });
    menu.addCheckboxOption(" Toggle subgrid", function() {
        subgridEnabled = true;
        renderTiles(true);
    }, function() {
        subgridEnabled = false;
        renderTiles(true);
    }, true);
    menu.addCheckboxOption(" Links enabled", function() {
        linksEnabled = true;
    }, function() {
        linksEnabled = false;
    }, true);
    menu.addCheckboxOption(" Colors enabled", function() {
        w.enableColors();
    }, function() {
        w.disableColors();
    }, true);
    if("background" in images) {
        menu.addCheckboxOption(" Background", function() {
            backgroundEnabled = true;
            renderTiles(true);
        }, function() {
            backgroundEnabled = false;
            renderTiles(true);
        }, true);
    }
    menu.addEntry("<input oninput=\"changeZoom(this.value)\" ondblclick=\"changeZoom(100)\" title=\"Zoom\" type=\"range\" value=\"100\" min=\"20\" max=\"1000\" id=\"zoombar\">");
}

document.onselectstart = function(e) {
    var target = e.target;
    if(closest(target, getChatfield()) || target == chatbar) {
        return true;
    }
    return w._state.uiModal;
}

function orderRangeABCoords(coordA, coordB) {
    var tmp;
    if(coordA[0] > coordB[0]) {
        // swap X coords
        tmp = coordA[0];
        coordA[0] = coordB[0];
        coordB[0] = tmp;
        tmp = coordA[2];
        coordA[2] = coordB[2];
        coordB[2] = tmp;
    } else if(coordA[0] == coordB[0] && coordA[2] > coordB[2]) {
        // swap X char coords
        tmp = coordA[2];
        coordA[2] = coordB[2];
        coordB[2] = tmp;
    }
    if(coordA[1] > coordB[1]) {
        // swap Y coords
        tmp = coordA[1];
        coordA[1] = coordB[1];
        coordB[1] = tmp;
        tmp = coordA[3];
        coordA[3] = coordB[3];
        coordB[3] = tmp;
    } else if(coordA[1] == coordB[1] && coordA[3] > coordB[3]) {
        // swap Y char coords
        tmp = coordA[3];
        coordA[3] = coordB[3];
        coordB[3] = tmp;
    }
}

// [tileX, tileY, charX, charY]
var lastLinkHover = null;
// [type, tileX, tileY, (charX, charY)]
var lastTileHover = null;
// [tileX, tileY, charX, charY]
var lastSelectionHover = null;

var w = {
    userCount: -1,
    clientId: -1,
    isLinking: false,
    isProtecting: false,
    isSelecting: false,
    url_input: "",
    coord_input_x: 0,
    coord_input_y: 0,
    link_input_type: 0, // 0 = link, 1 = coord,
    protect_type: null, // null = unprotect, 0 = public, 1 = member, 2 = owner
    protect_bg: "",
    pMod: false,
    _state: state,
    _ui: {
        announce: announce,
        announce_text: announce_text,
        announce_close: announce_close,
		coordinateInputModal: new CoordinateInputModal(),
		scrolling: null,
		urlInputModal: new URLInputModal(),
        colorInputModal: new ColorInputModal(),
        selectionModal: new SelectionModal()
    },
    clipboard: {
        textarea: null,
        init: function() {
            var area = document.createElement("textarea");
            area.value = ""
            area.style.width = "1px";
            area.style.height = "1px";
            area.style.position = "absolute";
            area.style.left = "-1000px";
            document.body.appendChild(area);
            w.clipboard.textarea = area;
        },
        copy: function(string) {
            w.clipboard.textarea.value = string;
            w.clipboard.textarea.select();
            document.execCommand("copy");
            w.clipboard.textarea.value = "";
        }
    },
    regionSelect: {
        selection: null,
        init: function() {
            var div = document.createElement("div");
            div.className = "region_selection";
            div.style.display = "none";
            document.body.appendChild(div);
            w.regionSelect.selection = div;
        },
        setSelection: function(start, end) {
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
            var pxCoordA = tileAndCharsToWindowCoords(tileX1, tileY1, charX1, charY1);
            var pxCoordB = tileAndCharsToWindowCoords(tileX2, tileY2, charX2, charY2);
            var regWidth = pxCoordB[0] - pxCoordA[0] + Math.trunc(cellW) - 2;
            var regHeight = pxCoordB[1] - pxCoordA[1] + Math.trunc(cellH) - 2;
            var sel = w.regionSelect.selection;
            sel.style.width = regWidth + "px";
            sel.style.height = regHeight + "px";
            sel.style.top = pxCoordA[1] + "px";
            sel.style.left = pxCoordA[0] + "px";
        },
        show: function() {
            w.regionSelect.selection.style.display = "";
        },
        hide: function() {
            w.regionSelect.selection.style.display = "none";
        }
    },
    color: function() {
        w._ui.colorInputModal.open(function(color) {
            var this_color = 0;
            if(color) {
                this_color = parseInt(color, 16);
            }
            if(!this_color) {
                this_color = 0;
            }
            YourWorld.Color = this_color;
            localStorage.setItem("color", this_color);
        });
    },
    goToCoord: function() {
        w._ui.coordinateInputModal.open("Go to coordinates:", w.doGoToCoord.bind(w));
    },
    doGoToCoord: function(y, x) {
        var maxX = 14073748835532; // do not go beyond these coords
        var maxY = 15637498706147;
        if(x > maxX || x < -maxX || y > maxY || y < -maxY) {
            return;
        }
        positionX = -x * tileW * 4;
        positionY = y * tileH * 4;
        renderTiles();
    },
    getCenterCoords: function() {
        return [-positionY / tileH, -positionX / tileW]
    },
    doUrlLink: function(url) {
        linkAuto.active = true;
        linkAuto.mode = 0;
        linkAuto.url = url;

        if(w.isLinking || w.isProtecting) return;
        w.url_input = url;
        owot.style.cursor = "pointer";
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
        owot.style.cursor = "pointer";
        w.isLinking = true;
        w.link_input_type = 1;
    },
    coordLink: function() {
        w._ui.coordinateInputModal.open("Enter the coordinates to create a link to. You can then click on a letter to create the link.", w.doCoordLink.bind(w));
    },
    doProtect: function(protectType, unprotect) {
        // show the protection precision menu
        protect_precision.style.display = "";
        tileProtectAuto.active = true;
		if(unprotect) { // default area protection
			tileProtectAuto.mode = 3;
		} else {
			if(protectType == "owner-only") tileProtectAuto.mode = 0;
			if(protectType == "member-only") tileProtectAuto.mode = 1;
			if(protectType == "public") tileProtectAuto.mode = 2;
        }

        if(w.isLinking || w.isProtecting) return;
        owot.style.cursor = "pointer";
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
    socketChannel: null,
    moveCursor: moveCursor,
    fetchUpdates: getAndFetchTiles,
    acceptOwnEdits: false,
    getTileVisibility: function() {
        var minVisY = (-positionY - Math.trunc(height / 2)) / tileH;
        var minVisX = (-positionX - Math.trunc(width / 2)) / tileW;
        var numDown = height / tileH;
        var numAcross = width / tileW;
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
    events: {},
    chat: {
        send: api_chat_send
    },
    on: function(type, call) {
        if(typeof call != "function") {
            throw "Callback is not a function";
        }
        if(!OWOT.events[type]) {
            OWOT.events[type] = [];
        }
        OWOT.events[type].push(call);
    },
    off: function(type, call) {
        if(!OWOT.events[type]) return;
        while(true) {
            var idx = OWOT.events[type].indexOf(call);
            if(idx == -1) break;
            OWOT.events[type].splice(idx, 1);
        }
    },
    callEvent: function(type, data) {
        var evt = OWOT.events[type];
        if(!evt) return;
        for(var e = 0; e < evt.length; e++) {
            var func = evt[e];
            func(data);
        }
    },
    broadcastCommand: function(data) {
        /*
            Clients would receive broadcasted data if they send the following data to the server:
            {
                kind: "cmd_opt"
            }
            The server will return the following data once mode opt-in is complete:
            {
                kind: "cmd_opt",
                enabled: true
            }
            Clients would receive broadcasted data in the following format:
            {
                kind: "cmd",
                data: <utf8 string, maximum length of 2048>,
                sender: <utf8 string>,
                source: "cmd"
            }
        */
        w.socket.send(JSON.stringify({
            kind: "cmd",
            data: data
        }))
    },
    jquery: function(callback) {
        if(window.jQuery) return;
        var jqueryURL = "/static/lib/jquery-1.7.min.js";
        var script = document.createElement("script");
        if(callback === true) {
            // synchronous
            ajaxRequest({
                type: "GET",
                url: jqueryURL,
                async: true,
                done: function(e) {
                    script.innerText = e;
                    document.head.appendChild(script);
                }
            })
        } else {
            script.src = jqueryURL;
            document.head.appendChild(script);
            script.onload = callback;
        }
    },
    redraw: function() {
        // redraw all tiles, clearing the cahe
        renderTiles(true);
    },
    changeFont: function(fontData) {
        // change the global font
        fontTemplate = fontData;
        font = fontTemplate.replace("$", 16 * zoom);
        for(var i in tilePixelCache) {
            tilePixelCache[i][1].font = font;
        }
        w.redraw();
    },
    changeSpecialCharFont: function(fontData) {
        specialCharFontTemplate = fontData;
        specialCharFont = specialCharFontTemplate.replace("$", 16 * zoom);
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
        if(images.unloaded && !ignoreUnloadedPattern && !w.pMod) {
            var data = images.unloaded[0];
            for(var i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
            w.pMod = true;
        }
        w.redraw();
    }
}

var OWOT = w;

if(Permissions.can_chat(state.userModel, state.worldModel)) {
    OWOT.on("chat", event_on_chat); // Chat event
}

if (state.announce) {
    w._ui.announce_text.innerHTML = w._state.announce;
    w._ui.announce.style.display = "";
}

w._ui.announce_close.onclick = function() {
    w._ui.announce.style.display = "none";
}

w._state.goToCoord = {};
w._state.uiModal = false; // is the UI open? (coord, url, go to coord)

buildMenu();
w.clipboard.init();
w.regionSelect.init();

w.on("tilesRendered", function() {
    if(regionCoordA && regionCoordB) w.regionSelect.setSelection(regionCoordA, regionCoordB);
})

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

var tilesAnimated = {};

function stopAnimation(posStr) {
	clearInterval(tilesAnimated[posStr]);
	delete tilesAnimated[posStr];
}

function isAnimated(posStr) {
	return tilesAnimated[posStr] != null;
}

function animateTile(tile, posStr) {
    var pos = getPos(posStr);
	if (isAnimated(posStr))
		stopAnimation(posStr);
	setTimeout(function() { // delay it a bit, so the parent code is fully executed
        var pos = getPos(posStr);
		var tileY = pos[0];
		var tileX = pos[1];
		var animation = tile.properties.animation;
		var changeInterval = animation.changeInterval;
		var repeat = animation.repeat;
		var frames = animation.frames;
		var framenum = frames.length;
		var animationInterval;
		var atFrame = 0;
		animationInterval = tilesAnimated[posStr] = setInterval(function doAnimation() {
			if (!tiles[posStr]) // not visible
				stopAnimation(posStr);
			var frame = frames[atFrame];
			var newTile = tile;
			newTile.content = frame[0];
			newTile.properties.color = frame[1];
            Tile.set(tileX, tileY, newTile)
			renderTile(tileX, tileY, true);
			atFrame++;
			if (atFrame >= framenum) {
				if (repeat)
					atFrame = 0;
				else
					stopAnimation(posStr);
			}
		}.bind(this), changeInterval);
	}.bind(this), 200);
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

function ReconnectingWebSocket(url) {
    this.binaryType = "blob";
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    var closed = false;
    var self = this;
    function connect() {
        self.socket = new WebSocket(url);
        self.socket.onclose = function(r) {
            if(self.onclose) self.onclose(r);
            if(closed) return;
            setTimeout(connect, 1000);
        }
        self.socket.onopen = function(e) {
            self.socket.onmessage = self.onmessage;
            self.socket.onerror = self.onerror;
            self.socket.binaryType = self.binaryType;
            if(self.onopen) self.onopen(e);
        }
    }
    connect();
    this.send = function(data) {
        this.socket.send(data);
    }
    this.close = function() {
        closed = true;
        this.socket.close();
    }
    this.refresh = function() {
        this.socket.close();
    }
    return this;
}

var ws_functions = {
    fetch: function(data) {
        if(tileFetchOffsetX || tileFetchOffsetY) {
            tile_offset_object(data.tiles, tileFetchOffsetX, tileFetchOffsetY);
        }
        for(var tileKey in data.tiles) {
            var tile = data.tiles[tileKey];
            var pos = getPos(tileKey);
			if (tile && tile.properties && tile.properties.animation) {
				animateTile(tile, tileKey); // if it's already animated it will stop the old animation
			} else if (isAnimated(tileKey)) {
				stopAnimation(tileKey);
            }
            Tile.set(pos[1], pos[0], tile);
            if(!tiles[tileKey]) Tile.set(pos[1], pos[0], blankTile());
            tiles[tileKey].initted = true;
            if(tiles[tileKey].properties.char) {
                tiles[tileKey].properties.char = decodeCharProt(tiles[tileKey].properties.char);
            }
            renderTile(pos[1], pos[0], true);
        }
        // too many tiles, remove tiles outside of the viewport
        var tileLim = 1000;
        if(zoom < 0.5) { // zoomed out too far? make sure tiles don't constantly unload
            tileLim = 10000;
        }
        if(Object.keys(tiles).length >= tileLim && unloadTilesAuto) {
            clearTiles()
        }
    },
    colors: function(data) {
        // update all world colors
        styles.public = data.colors.background;
        styles.cursor = data.colors.cursor;
        styles.member = data.colors.member_area;
        styles.menu   = data.colors.menu;
        styles.owner  = data.colors.owner_area;
        styles.text   = data.colors.text;
        renderTiles(true); // render all tiles with new colors
        menu_color(styles.menu);
    },
    tileUpdate: function(data) {
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
                data.tiles[tileKey].properties.color = Object.assign([], blankColor);
            }
            if(data.tiles[tileKey].properties.char) {
                data.tiles[tileKey].properties.char = decodeCharProt(data.tiles[tileKey].properties.char);
            }
			if (data.tiles[tileKey].properties.animation) {
				animateTile(data.tiles[tileKey], tileKey); // if it's already animated it will stop the old animation
			} else if (isAnimated(tileKey)) {
				stopAnimation(tileKey);
			}
            if(!tiles[tileKey].properties.color) {
                tiles[tileKey].properties.color = Object.assign([], blankColor);
            }

            var newContent = blank;
            var newColors = newColorArray();
            // get content and colors from new tile data
            if(data.tiles[tileKey]) {
                newContent = data.tiles[tileKey].content
                if(data.tiles[tileKey].properties.color) {
                    newColors = data.tiles[tileKey].properties.color;
                }
            }
            var oldContent = tiles[tileKey].content;
            var oldColors = tiles[tileKey].properties.color.slice(0);
            newContent = advancedSplit(newContent);
            oldContent = advancedSplit(oldContent);
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
                    if(useHighlight) highlights.push([tileX, tileY, charX, charY]);
                }
                charX++;
                if(charX >= tileC) {
                    charX = 0;
                    charY++;
                }
            }
            oldContent = oldContent.join("");
            tiles[tileKey].properties = data.tiles[tileKey].properties; // update tile
            tiles[tileKey].content = oldContent; // update only necessary character updates
            tiles[tileKey].properties.color = oldColors; // update only necessary color updates
            tiles[tileKey].redraw = true;
            tiles[tileKey].initted = true;
            var pos = getPos(tileKey);
            renderTile(pos[1], pos[0]);
        }
        if(highlights.length > 0 && useHighlight) highlight(highlights);
    },
    write: function(data) {
        // after user has written text, the client should expect list of all edit ids that passed
        for(var i = 0; i < data.accepted.length; i++) {
            for(var x = 0; x < tellEdit.length; x++) {
                if(tellEdit[x][4] == data.accepted[i]) {
                    tellEdit.splice(x, 1);
                    // because the element has been removed, so the length of the array is shorter
                    x--;
                }
            }
        }
    },
    channel: function(data) {
        w.socketChannel = data.sender;
        w.clientId = data.id;
        w.userCount = data.initial_user_count;
        updateUsrCount();
    },
    announcement: function(data) {
        if(data.text) {
			w._ui.announce_text.innerHTML = data.text;
			w._ui.announce.style.display = "";
		} else {
			w._ui.announce.style.display = "none";
		}
    },
    ping: function(data) {
        if(data.time) {
            var clientReceived = Date.now();
            // serverPingTime is from chat.js
            var pingMs = clientReceived - serverPingTime;
            addChat(null, 0, "user", "[ Server ]", "Ping: " + pingMs + " MS", "Server", false, false, false, null, clientReceived);
            return;
        }
    },
    tile_clear: function(data) {
        var pos = data.tileY + "," + data.tileX;
        if(tiles[pos]) {
            var writability = tiles[pos].properties.writability;
            Tile.set(data.tileX, data.tileY, blankTile());
            tiles[pos].initted = true;
            tiles[pos].properties.writability = writability;
            renderTile(data.tileX, data.tileY);
        }
    },
    chat: function(data) {
        if(data.channel == w.socketChannel) return;
        var type = chatType(data.registered, data.nickname, data.realUsername);
        OWOT.callEvent("chat", {
            location: data.location,
            id: data.id,
            type: type,
            nickname: data.nickname,
            message: data.message,
            realUsername: data.realUsername,
            op: data.op,
            admin: data.admin,
            staff: data.staff,
            color: data.color
        });
    },
    user_count: function(data) {
        var count = data.count;
        w.userCount = count;
        updateUsrCount();
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
                chat.message, chat.realUsername, chat.op, chat.admin, chat.staff, chat.color, chat.date);
        }
        for(var p = 0; p < page_prev.length; p++) {
            var chat = page_prev[p];
            var type = chatType(chat.registered, chat.nickname, chat.realUsername);
            addChat(chat.location, chat.id, type, chat.nickname,
                chat.message, chat.realUsername, chat.op, chat.admin, chat.staff, chat.color, chat.date);
        }
    },
    cmd: function(data) {
        w.callEvent("cmd", data);
    }
};