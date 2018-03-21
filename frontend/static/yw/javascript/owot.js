var YourWorld = {
    Color: 0,
    Nickname: state.userModel.username
}

// edit ID
var nextObjId = 1;

var owot, textInput, textLater;
function init_dom() {
    $("#loading").hide();
    owot = $("#owot")[0];
    owot.hidden = false;
    owot.style.cursor = "text";
    textInput = $("#textInput");
    textLayer = $("#text")[0];
    textLayer.hidden = false;
    textLayer.style.pointerEvents = "none";

    $("#coord_Y").text(0);
    $("#coord_X").text(0);
}

function decimal(percentage) {
    return percentage / 100;
}

function deviceRatio() {
    var ratio = window.devicePixelRatio;
    if(!ratio) ratio = 1;
    return ratio;
}

init_dom();

var width                  = window.innerWidth;
var height                 = window.innerHeight;
var positionX              = 0; // position in client in pixels
var positionY              = 0;
var pingInterval           = 50; // in seconds
var gridEnabled            = false;
var linksEnabled           = true;
var colorsEnabled          = true;
var backgroundEnabled      = true; // if any
var zoomRatio              = window.devicePixelRatio; // browser's zoom ratio
var protectPrecision       = 0; // 0 being tile and 1 being char
var checkTileFetchInterval = 300; // how often to check for unloaded tiles (ms)
var zoom                   = decimal(100); // zoom value
var images                 = {}; // { name: [data RGBA, width, height] }
var images_to_load         = {
    unloaded: "/static/unloaded.png"
}
var selectedChatTab        = 0; // 0 is the page chat, 1 is the global chat

if(state.background) { // add the background image (if it already exists)
    images_to_load.background = state.background;
}
for(var i in images_to_load) { // add blank image object so that client knows it exists, but not loaded
    images[i] = null;
}
var img_load_keys = Object.keys(images_to_load);

var imgToArrayCanvas = document.createElement("canvas");
var backImg = imgToArrayCanvas.getContext("2d");

var loadImageElm = new Image();
var img_load_index = 0;
function loadLoop() {
    var img_key = img_load_keys[img_load_index];
    loadImageElm.src = images_to_load[img_key];
    var error = false;
    loadImageElm.onload = function() {
        if(!error) { // error occured, don't process
            var width = loadImageElm.width;
            var height = loadImageElm.height;
            imgToArrayCanvas.width = width;
            imgToArrayCanvas.height = height;
            backImg.drawImage(loadImageElm, 0, 0);
            images[img_key] = [backImg.getImageData(0, 0, width, height).data, width, height];
        }
        img_load_index++;
        if(img_load_index >= img_load_keys.length) {
            // once all the images are loaded
            renderTiles();
            begin();
        } else {
            // keep loading
            loadLoop();
        }
    }
    loadImageElm.onerror = function() {
        error = true;
        loadImageElm.onload();
    }
}
loadLoop();

var defaultSizes = {
    // in pixels
    tileW: 160,
    tileH: 144,
    cellW: 10,
    cellH: 18,
    // in characters
    tileC: 16, // columns
    tileR: 8 // rows
}

var tileW = defaultSizes.tileW * zoom | 0;
var tileH = defaultSizes.tileH * zoom | 0;
var cellW = defaultSizes.cellW * zoom | 0;
var cellH = defaultSizes.cellH * zoom | 0;

var fontBase = "px 'Courier New', monospace";
var specialCharFontBase = "px sans-serif";

var font = (16 * zoom) + fontBase;
var specialCharFont = (16 * zoom) + specialCharFontBase;

var tileC = defaultSizes.tileC;
var tileR = defaultSizes.tileR;
var tileArea = tileC * tileR;

const dTileW = tileW; // permanent tile sizes in pixel (remains same throughout client's session)
const dTileH = tileH;

// used to stretch background images
var backgroundImageCanvasRenderer = document.createElement("canvas");
backgroundImageCanvasRenderer.width = tileW;
backgroundImageCanvasRenderer.height = tileH;
var backgroundImageCtx = backgroundImageCanvasRenderer.getContext("2d");

function doZoom(percentage) {
    if(percentage < 20 || percentage > 1000) { // zoomed too far in/out?
        return;
    }
    percentage = decimal(percentage);
    zoom = percentage;

    // modify all pixel sizes
    tileW = defaultSizes.tileW * zoom;
    tileH = defaultSizes.tileH * zoom;
    cellW = defaultSizes.cellW * zoom;
    cellH = defaultSizes.cellH * zoom;
    font = (16 * zoom) + fontBase;
    specialCharFont = (16 * zoom) + specialCharFontBase;

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

function browserZoomAdjust(initial) {
    // make the canvas as if it were at 100% zoom,
    // except it uses the proper zoom function
    var ratio = window.devicePixelRatio;
    if(!ratio) ratio = 1;
    if(zoomRatio == ratio && !initial) return; // ratio is still the same, do nothing
    positionX /= zoomRatio;
    positionY /= zoomRatio;
    zoomRatio = ratio;
    positionX *= zoomRatio;
    positionY *= zoomRatio;
    positionX |= 0; // remove decimals
    positionY |= 0;

    adjust_scaling_DOM(ratio);
    doZoom(ratio * 100)
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
$(document).on("mousemove.tileProtectAuto", function() {
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
})

$("body").on("keydown.tileProtectAuto", function(e) {
    if(e.keyCode === 83 && (e.altKey || e.ctrlKey)) { // Alt/Ctrl + S to protect tiles
        if(e.ctrlKey) { // prevent browser's ctrl+s from executing
            e.preventDefault();
        }
        var selected = tileProtectAuto.selected;
        var types = ["owner-only", "member-only", "public"];
        var keys = Object.keys(selected);
        if(keys.length == 0) return;
        autoTotal += keys.length;
        updateAutoProg();
        var i = 0;
        function protectLoop() {
            // get tileX/Y position from key
            var pos = keys[i].split(",").map(Number);
            var cstr = keys[i];
            var precision = selected[cstr][0];
            var prot = selected[cstr][1];

            var tileX = pos[1];
            var tileY = pos[0];
            var charX = selected[cstr][3][2];
            var charY = selected[cstr][3][3];
            var ajaxStr = "/ajax/protect/"
            if(prot == 3) ajaxStr = "/ajax/unprotect/"
            if(precision == 1) {
                ajaxStr += "char/";
            }
            
            var data = {
                world: state.worldModel.name,
                tileY: tileY,
                tileX: tileX
            };
            if(prot != 3) { // if unprotect type
                data.type = types[prot];
            }
            if(precision == 1) {
                data.charX = charX;
                data.charY = charY;
            }
            jQuery.ajax({
                type: "POST",
                url: ajaxStr,
                data: data
            }).done(function() {
                autoTotal--;
                updateAutoProg();
                if(precision == 0) {
                    selected[cstr][2].backgroundColor = "";
                } else if(precision == 1) {
                    delete selected[cstr];
                    uncolorChar(tileX, tileY, charX, charY);
                }
                renderTile(tileX, tileY, true);
                // advance the loop
                i++;
                if(i < keys.length) {
                    protectLoop();
                }
            });
        }
        protectLoop()
    } else {
        tileProtectAuto.ctrlDown = e.ctrlKey;
        tileProtectAuto.shiftDown = e.shiftKey;
    }
})

$("body").on("keyup.tileProtectAuto", function(e) {
    tileProtectAuto.ctrlDown = e.ctrlKey;
    tileProtectAuto.shiftDown = e.shiftKey;
})

// Fast linking
$(document).on("mousemove.linkAuto", function() {
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
})

$("body").on("keydown.linkAuto", function(e) {
    if(e.keyCode === 83 && (e.altKey || e.ctrlKey)) { // Alt/Ctrl + S to add links
        if(e.ctrlKey) { // is Ctrl+S
            e.preventDefault();
        }
        var selected = linkAuto.selected;
        var keys = Object.keys(selected);
        if(keys.length == 0) return;
        autoTotal += keys.length;
        updateAutoProg();
        var i = 0;
        function protectLoop() {
            // get tileX/Y position from key
            var pos = keys[i].split(",").map(Number);
            var cstr = keys[i];

            var tileX = pos[1];
            var tileY = pos[0];
            var charX = pos[3];
            var charY = pos[2];

            var mode = selected[cstr][4];
            var linkData = selected[cstr][5];

            var ajaxStr = "/ajax/urllink/";
            if(mode == 1) ajaxStr = "/ajax/coordlink/";
            
            var data = {
                world: state.worldModel.name,
                tileY: tileY,
                tileX: tileX,
                charY: charY,
                charX : charX
            };
            if(mode == 0) {
                data.url = linkData[0];
            } else if(mode == 1) {
                data.link_tileX = linkData[0];
                data.link_tileY = linkData[1];
            }
            jQuery.ajax({
                type: "POST",
                url: ajaxStr,
                data: data
            }).done(function(){
                autoTotal--;
                updateAutoProg();
                delete selected[cstr];
                uncolorChar(tileX, tileY, charX, charY);
                renderTile(tileX, tileY, true);
                // advance the loop
                i++;
                if(i < keys.length) {
                    protectLoop();
                }
            });
        }
        protectLoop()
    } else {
        linkAuto.ctrlDown = e.ctrlKey;
        linkAuto.shiftDown = e.shiftKey;
    }
})

$("body").on("keyup.linkAuto", function(e) {
    linkAuto.ctrlDown = e.ctrlKey;
    linkAuto.shiftDown = e.shiftKey;
})

// polyfill for Object.assign
if (typeof Object.assign != "function") { // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
	// Must be writable: true, enumerable: false, configurable: true
	Object.defineProperty(Object, "assign", {
		value: function assign(target, varArgs) { // .length of function is 2
			"use strict";
			if (target == null) { // TypeError if undefined or null
				throw new TypeError("Cannot convert undefined or null to object");
			}
			var to = Object(target);
			for (var index = 1; index < arguments.length; index++) {
				var nextSource = arguments[index];
				if (nextSource != null) { // Skip over if undefined or null
					for (var nextKey in nextSource) {
						// Avoid bugs when hasOwnProperty is shadowed
						if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
							to[nextKey] = nextSource[nextKey];
						}
					}
				}
			}
			return to;
		},
		writable: true,
		configurable: true
	});
}

// adjust canvas width, canvas display width, and variable width to
// disobey the browser zoom so that the custom zoom can be used
function adjust_scaling_DOM(ratio) {
    // the size of the viewport
    var window_width = window.innerWidth;
    var window_height = window.innerHeight;

    // change variable sizes to the screen-width of the inner browser (same, regardless of zoom)
    width = Math.round(window_width * ratio);
    height = Math.round(window_height * ratio);

    // make size of canvas the size of the inner browser screen-size
    owot.width = Math.round(window_width * ratio);
    owot.height = Math.round(window_height * ratio);
    // make the display size the suze of the viewport
    owot.style.width = window_width + "px";
    owot.style.height = window_height + "px";

    // comments above apply below
    textLayer.width = Math.round(window_width * ratio);
    textLayer.height = Math.round(window_height * ratio);
    textLayer.style.width = window_width + "px";
    textLayer.style.height = window_height + "px";
}

$(window).on("resize", function(e) {
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
    if(!tile.properties.color) return;
	return tile.properties.color[charY * tileC + charX];
}

// copy individual chars
$(document).on("keydown", function(e) {
    // 67 = c, 77 = m
    if(!e.ctrlKey || (e.keyCode != 67 && e.keyCode != 77)) return;
    textInput[0].value = "";
	// ctrl + c to copy characters where the text cursor is,
	// ctrl + m to copy characters where the mouse cursor is
	var pos_ref = cursorCoords
	if(e.keyCode == 77) { // copy where mouse cursor is
		pos_ref = currentPosition
	}
	if(!pos_ref) return;
	var tileX = pos_ref[0];
	var tileY = pos_ref[1];
	var charX = pos_ref[2];
	var charY = pos_ref[3];
	var char = getChar(tileX, tileY, charX, charY)
    prompt("Copy the character below:", char);
})

// color picker
$(document).on("keydown", function(e) {
    if(!(e.altKey && e.keyCode == 67)) return // if not alt + c, return
    textInput[0].value = "";
    // alt + c to use color of text cell (where mouse cursor is) as main color
    var pos = currentPosition;
    if(!pos) return;
    var tileX = pos[0];
	var tileY = pos[1];
	var charX = pos[2];
    var charY = pos[3];
    var color = getCharColor(tileX, tileY, charX, charY)
    YourWorld.Color = color;
    // update color textbox in "change color" menu
    $(".jscolor")[0].value = ("00000" + color.toString(16)).slice(-6);
})

owot.width = width;
owot.height = height;

var cursorCoords = null;
var cursorCoordsCurrent = [0, 0, 0, 0, "NOT_INITTED"]; // cursorCoords that don't reset to null
var currentPosition = [0, 0, 0, 0];
var currentPositionInitted = false;

var tiles = {};

var ctx = owot.getContext("2d");
ctx.fillStyle = "#eee";
ctx.fillRect(0, 0, width, height);

var textLayerCtx = textLayer.getContext("2d");
textLayer.width = width;
textLayer.height = height;

if (window.MozWebSocket)
    window.WebSocket = window.MozWebSocket;

var wsaddr = window.location.host;
var ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
var path = state.worldModel.pathname;
var ws_path = ws_scheme + "://" + wsaddr + path + "/ws/";

var styles = {};

var menuStyle;
function menu_color(color) {
    // change menu color
    if(!window.menuStyle) {
        menuStyle = document.createElement("style")
        $("head").append(menuStyle)
    }
    menuStyle.innerHTML = "#menu.hover, #nav { background: " + color + "; }"
}

function begin() {
    // get world style
    jQuery.ajax({
        type: "GET",
        url: "/world_style/?world=" + state.worldModel.name,
        success: function(e) {
            createSocket();
            styles = e;
            menu_color(styles.menu);
            writability_styles = [styles.public, styles.member, styles.owner]
        },
        dataType: "json"
    });
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
    $("#protect_precision").css("display", "none");
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
        world: state.worldModel.name,
        tileY: tileY,
        tileX: tileX,
        charY: charY,
        charX: charX
    }
    var ajax_url = "";
    if(w.link_input_type == 0) {
        ajax_url = "/ajax/urllink/";
        data.url = w.url_input;
    } else if(w.link_input_type == 1) {
        data.link_tileX = w.coord_input_x;
        data.link_tileY = w.coord_input_y;
        ajax_url = "/ajax/coordlink/";
    }
    $.ajax({
        type: "POST",
        url: ajax_url,
        data: data
    });
}

function doProtect() {
    if(!lastTileHover) return;
    stopTileUI();
    var tileX = lastTileHover[1];
    var tileY = lastTileHover[2];
    var types = ["public", "member-only", "owner-only"];
    var data = {
        world: state.worldModel.name,
        tileY: tileY,
        tileX: tileX
    }
    var ajax_url = "";
    if(w.protect_type == null) {
        ajax_url = "/ajax/unprotect/";
    } else {
        ajax_url = "/ajax/protect/";
        data.type = types[w.protect_type];
    }
    if(protectPrecision == 1) {
        ajax_url += "char/";
        data.charX = lastTileHover[3];
        data.charY = lastTileHover[4];
    }
    $.ajax({
        type: "POST",
        url: ajax_url,
        data: data
    });
}

var dragStartX = 0;
var dragStartY = 0;
// the offset before clicking to drag
var dragPosX = 0;
var dragPosY = 0;
var isDragging = false;
function event_mousedown(e, arg_pageX, arg_pageY) {
    var pageX = e.pageX*zoomRatio|0;
    var pageY = e.pageY*zoomRatio|0;
    if(arg_pageX != void 0) pageX = arg_pageX;
    if(arg_pageY != void 0) pageY = arg_pageY;
    if(e.target != owot && e.target != linkDiv) return;
    dragStartX = pageX;
    dragStartY = pageY;
    dragPosX = positionX;
    dragPosY = positionY;
    isDragging = true;
    // stop paste
    clearInterval(pasteInterval);
    write_busy = false;
    textInput[0].value = "";

    if(w.isLinking) {
        doLink();
    }
    if(w.isProtecting) {
        doProtect();
    }
    owot.style.cursor = "move";
}
$(document).on("mousedown", function(e) {
    event_mousedown(e);
})
$(document).on("touchstart", function(e) {
    var pos = touch_pagePos(e);
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

    var pixelX = (coords[0] * tileW) + (coords[2] * cellW) + positionX + (width / 2 | 0);
    var pixelY = (coords[1] * tileH) + (coords[3] * cellH) + positionY + (height / 2 | 0);
    
    var diff = null;
    // keep record of old positions to check if they changed
    var posXCompare = positionX;
    var posYCompare = positionY;

    if(pixelX < 0) { // cursor too far left
        diff = Math.abs(pixelX);
        positionX += diff;
    }
    if(pixelX + cellW >= width) { // cursor too far right
        diff = Math.abs(width - pixelX);
        positionX -= cellW - diff;
    }
    if(pixelY < 0) { // cursor too far up
        diff = Math.abs(pixelY);
        positionY += diff;
    }
    if(pixelY + cellH >= height) { // cursor too far down
        diff = Math.abs(height - pixelY);
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
    var pageX = e.pageX * zoomRatio | 0;
    var pageY = e.pageY * zoomRatio | 0;
    if(arg_pageX != void 0) pageX = arg_pageX;
    if(arg_pageY != void 0) pageY = arg_pageY;
    stopDragging();
    if(e.target != owot && e.target != linkDiv) return;

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
$(document).on("mouseup", function(e) {
    event_mouseup(e);
})
$(document).on("touchend", function(e) {
    event_mouseup(e, touchPosX, touchPosY);
})

$(document).on("mouseleave", function(e) {
    stopDragging();
})
$(document).on("mouseenter", function(e) {
    stopDragging();
})
function is_link(tileX, tileY, charX, charY) {
    if(tiles[tileY + "," + tileX]) {
        var tile = tiles[tileY + "," + tileX]
        if(tile) {
            var pos = charY * tileC + charX;
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

function advancedSplit(str) {
	str += "";
	var data = str.match(/([\uD800-\uDBFF][\uDC00-\uDFFF])|(([\0-\u02FF\u0370-\u1DBF\u1E00-\u20CF\u2100-\uD7FF\uDC00-\uFE1F\uFE30-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF])([\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+))|.|\n|\r/g)
    if(data == null) return [];
    for(var i = 0; i < data.length; i++) {
        // contains surrogates without second character?
        if(data[i].match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g)) {
            data.splice(i, 1)
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

var writeInterval = setInterval(function() {
    if(writeBuffer.length == 0) return;
    var data = {
        kind: "write",
        // get copy of buffer
        edits: writeBuffer.slice(0)
    };
    // clear buffer
    writeBuffer.splice(0);
    socket.send(JSON.stringify(data));
}, 1000)

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

function writeChar(char, doNotMoveCursor) {
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
            tiles[tileY + "," + tileX] = blankTile();
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
        color[charY * tileC + charX] = YourWorld.Color;
        tiles[tileY + "," + tileX].properties.color = color;

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
        if(color) {
            editArray.push(YourWorld.Color);
        }
        tellEdit.push([tileX, tileY, charX, charY, nextObjId]);
        writeBuffer.push(editArray);
        nextObjId++;
    }
}

// write characters inputted
var write_busy = false; // busy pasting
var pasteInterval;
setInterval(function() {
    if(write_busy) return;
    var value = textInput[0].value;
    if(value == "") return;
    value = value.replace(/\r\n/g, "\n");
    value = advancedSplit(value);
    var index = 1;
    writeChar(value[0]);
    if(value.length == 1) {
        textInput[0].value = "";
        return
    };
    if (Permissions.can_paste(state.userModel, state.worldModel)) {
        write_busy = true;
        // pasting feature
        pasteInterval = setInterval(function() {
            var res = writeChar(value[index]);
            if(res === null) { // write failed
                return; // keep waiting until tile loads
            }
            index++
            if(index >= value.length) {
                textInput[0].value = "";
                clearInterval(pasteInterval);
                write_busy = false;
            }
        }, 1)
    } else {
        textInput[0].value = "";
    }
}, 10);

$(document).on("keydown", function(e) {
    var key = e.keyCode;
    if(w._state.uiModal) return;
    if(document.activeElement == $("#chatbar")[0]) return;
    textInput.focus();
    textInput[0].value = "";
    // stop paste
    clearInterval(pasteInterval);
    write_busy = false;

    if(key == 38) {
        moveCursor("up");
    } else if(key == 40) {
        moveCursor("down");
    } else if(key == 37) {
        moveCursor("left");
    } else if(key == 39) {
        moveCursor("right");
    } else if(key == 8) { // backspace
        moveCursor("left", true);
        writeChar(" ", true);
    } else if(key == 27) { // esc
        stopLinkUI();
        stopTileUI();
        removeCursor();
        tileProtectAuto.active = false;
        linkAuto.active = false;
    }
})

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

function sendChat() {
    var chatText = $("#chatbar")[0].value;
    $("#chatbar")[0].value = "";
    
    var nickCommand = "/nick ";
    if(chatText.startsWith(nickCommand)) {
        chatText = chatText.substr(nickCommand.length);
        YourWorld.Nickname = chatText.slice(0, 20);
        addChat(null, "user", "[ Server ]", "Set nickname to `" + chatText + "`", "Server");
        return;
    }

    var location = selectedChatTab == 0 ? "page" : "global";

    chatText = chatText.slice(0, 600);

    socket.send(JSON.stringify({
        kind: "chat",
        nickname: YourWorld.Nickname,
        message: chatText,
        location: location
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

    addChat(location, id, type, nickname, chatText, username);
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
})

$("#chat_open").on("click", function() {
    $("#chat_window").show();
    $("#chat_open").hide();
})

$("#chat_page_tab").on("click", function() {
    $("#chat_global_tab")[0].style.backgroundColor = "";
    $("#chat_global_tab")[0].style.color = "";
    $("#chat_page_tab")[0].style.backgroundColor = "#8c8c8c";
    $("#chat_page_tab")[0].style.color = "white";

    $("#global_chatfield").hide();
    $("#page_chatfield").show();
    selectedChatTab = 0;
})

$("#chat_global_tab").on("click", function() {
    $("#chat_global_tab")[0].style.backgroundColor = "#8c8c8c";
    $("#chat_global_tab")[0].style.color = "white";
    $("#chat_page_tab")[0].style.backgroundColor = "";
    $("#chat_page_tab")[0].style.color = "";

    $("#global_chatfield").show();
    $("#page_chatfield").hide();
    selectedChatTab = 1;
})

/*
    [type]:
    * "user"      :: registered non-renamed nick
    * "anon_nick" :: unregistered nick
    * "anon"      :: unregistered
    * "user_nick" :: registered renamed nick
*/
function addChat(chatfield, id, type, nickname, message, realUsername) {
    var field;
    if(chatfield == "page") {
        field = $("#page_chatfield");
    } else if(chatfield == "global") {
        field = $("#global_chatfield");
    } else {
        field = getChatfield();
    }

    var nickDom = document.createElement("a");
    nickDom.style.textDecoration = "underline";

    if(type == "user") {
        nickDom.style.color = assignColor(nickname);
        nickDom.href = "/" + realUsername;
        nickDom.style.fontWeight = "bold";
    }
    if(type == "anon_nick") {
        nickname = "[Anon; " + id + "] " + nickname;
    }
    if(type == "anon") {
        nickname = "[" + id + "]";
    }
    if(type == "user_nick") {
        nickDom.style.color = assignColor(nickname);
        nickDom.href = "/" + realUsername;
        nickname = "[" + id + "] " + nickname;
    }
    nickDom.innerText = nickname + ":";

    var msgDom = document.createElement("span");
    msgDom.innerText = " " + message;

    var chatGroup = document.createElement("div");
    chatGroup.appendChild(nickDom);
    chatGroup.appendChild(msgDom);

    chatGroup.style.wordWrap = "break-word";
    chatGroup.style.wordBreak = "break-all";

    field.append(chatGroup);

    var maxScroll = field[0].scrollHeight - field[0].clientHeight;
    var scroll = field[0].scrollTop;
    if(maxScroll - scroll < 20) {
        field[0].scrollTop = maxScroll;
    }
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
    var mpX = x - positionX - (width / 2 | 0);
    var mpY = y - positionY - (height / 2 | 0);
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
    var coords = [];
    for(var y = y1; y <= y2; y++) {
        for(var x = x1; x <= x2; x++) {
            coords.push([x, y]);
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
    x += (width / 2 | 0);
    y += (height / 2 | 0);
    return [x/zoomRatio|0, y/zoomRatio|0];
}

var linkMargin = 100; // px
var linkElm = document.createElement("a");
linkElm.href = "test";
$("body")[0].appendChild(linkElm);
var linkDiv = document.createElement("div");
linkDiv.style.width = (cellW + (linkMargin * 2)) + "px";
linkDiv.style.height = (cellH + (linkMargin * 2)) + "px";
linkElm.appendChild(linkDiv);
linkElm.style.position = "absolute";
linkElm.title = "Link to url...";
linkElm.style.display = "block";
linkElm.target = "_blank";
linkElm.style.cursor = "pointer";

var waitTimeout = Math.floor(1000 / 60); // 60 fps max for dragging
var lastRender = 0;
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

    var link = is_link(tileX, tileY, charX, charY);
    if(link && linksEnabled) {
        var pos = tileAndCharsToWindowCoords(tileX, tileY, charX, charY);
        linkElm.style.left = (pos[0] - linkMargin) + "px";
        linkElm.style.top = (pos[1] - linkMargin) + "px";
        linkElm.hidden = false;
        linkElm.onclick = "";
        linkElm.target = "_blank";
        linkElm.href = "";
        if(link[0].type == "url") {
            linkElm.title = "Link to URL " + link[0].url;
            linkElm.href = link[0].url;
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

    if(!isDragging) return;

    // wait before updating coords and tiles
    if(Date.now() - lastRender < waitTimeout) return;
    lastRender = Date.now();

    positionX = dragPosX + (pageX - dragStartX);
    positionY = dragPosY + (pageY - dragStartY);

    renderTiles();
}
$(document).on("mousemove", function(e) {
    event_mousemove(e);
})
$(document).on("touchmove", function(e) {
    e.preventDefault();
    var pos = touch_pagePos(e);
    touchPosX = pos[0];
    touchPosY = pos[1];
    event_mousemove(e, pos[0], pos[1]);
})

// get position from touch event
function touch_pagePos(e) {
    var first_touch = e.originalEvent.touches[0];
    return [first_touch.pageX * zoomRatio | 0, first_touch.pageY * zoomRatio | 0];
}

function getChatfield(elm) {
    if(selectedChatTab == 0) {
        return $("#page_chatfield");
    } else if(selectedChatTab == 1) {
        return $("#global_chatfield");
    }
}

$(document).on("wheel", function(e) {
    // if focused on chat, don't scroll world
    if($(e.target).closest(getChatfield())[0] == getChatfield()[0]) return;
    if(e.ctrlKey) return; // don't scroll if ctrl is down (zooming)
    var deltaX = Math.floor(e.originalEvent.deltaX);
    var deltaY = Math.floor(e.originalEvent.deltaY);
    if(e.originalEvent.deltaMode) { // not zero (default)?
        deltaX = 0;
        deltaY = (deltaY / Math.abs(deltaY)) * 100;
    }
    if(e.shiftKey) { // if shift, scroll sideways
        deltaX = deltaY;
        deltaY = 0;
    }
    positionY -= deltaY;
    positionX -= deltaX;
    renderTiles();
})

// gets list of ranges to fetch
function cutRanges(map, width, height) {
    function getPos(x, y) {
        if(x >= width || y >= height) return
        return map[y * width + x]
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
        var zeros = false
        var x = 0
        var y = 0
        var startX = 0
        var startY = 0
        var endX = 0
        var endY = 0
        var endXSet = false
        var lastX = -1
        for(var i = 0; i < width * height; i++) {
            var dat = getPos(x, y)
            if(dat === 0 && !zeros) {
                zeros = true
                startX = x
                startY = y
            }
    
            if(dat === 1 && zeros && x <= endX) {
                endY--
                fillRange(startX, startY, endX, endY);
                break
            }
    
            if(dat === 1 && zeros) {
                var xTemp = x
                if(!endXSet && lastX > -1) {
                    endX = lastX
                    endXSet = true
                }
                x = startX
                endY++
                y++
                if(getPos(x, y)) {
                    endY--
                    fillRange(startX, startY, endX, endY);
                    break
                }
                if(y >= height) {
                    endY--
                    if(lastX === xTemp) {
                        endY--
                    }
                    fillRange(startX, startY, endX, endY);
                    break
                }
                continue
            }
            lastX = x
            x++
            if(x >= width) {
                if(!endXSet && zeros && dat === 0 && lastX > -1) {
                    endX = lastX
                    endXSet = true
                }
                x = startX
                y++
                endY++
                if(y >= height) {
                    endY--
                    fillRange(startX, startY, endX, endY);
                    break
                }
            }
        }
    }
    function containsBlank() {
        for(var i = 0; i < map.length; i++) {
            if(map[i] === 0) return true
        }
        return false
    }
    for(var i = 0; i < width * height; i++) {
        if(containsBlank()) {
            cut()
        } else {
            break
        }
    }
    return ranges;
}

var pingTimeout;
var fetchInterval;
function createSocket() {
    socket = new ReconnectingWebSocket(ws_path);
    w.socket = socket;

    socket.onmessage = function(msg) {
        var data = JSON.parse(msg.data);
        var kind = data.kind;
        if(ws_functions[kind]) {
            ws_functions[kind](data);
        }
    }

    socket.onopen = function(msg) {
        getAndFetchTiles();
        clearInterval(fetchInterval);
        fetchInterval = setInterval(function() {
            getAndFetchTiles();
        }, checkTileFetchInterval)
        socket.send("2::"); // initial ping
        // ping is so that the socket won't close after every minute
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
        var coord = data[i][1] + "," + data[i][0];
        if(coord in tiles) {
            map.push(1);
        } else {
            map.push(0);
            tiles[coord] = null;
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
            minX: range[0] + startX,
            minY: range[1] + startY,
            maxX: range[2] + startX,
            maxY: range[3] + startY
        });
    }
    if(toFetch.length > 0) {
        socket.send(JSON.stringify({
            fetchRectangles: toFetch,
            kind: "fetch",
            v: "3"
        }))
    }
}

// clears all tiles outside the viewport (to free up memory)
function clearTiles() {
    var coordinates = getVisibleTiles();
    // reference to tile coordinates (EG: "5,6")
    var visible = {};
    for(var i = 0; i < coordinates.length; i++) {
        visible[coordinates[i][1] + "," + coordinates[i][0]] = 1;
    }
    for(var i in tiles) {
        if(!(i in visible)) {
            delete tiles[i];
        }
    }
    for(var i in tilePixelCache) {
        if(!(i in visible)) {
            delete tilePixelCache[i];
        }
    }
}

function getPos(ref) {
    ref = ref.split(",");
    return [parseInt(ref[0]), parseInt(ref[1])];
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charAt
// fixes cases where characters can break String.charAt()
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

var tilePixelCache = {};

var world_writability = state.worldModel.writability;
// to be added by world_style
// index 0 = public, 1 = member, 2 = owner
var writability_styles = [];

var highlightFlash = {};
var inkLimit = 0;

function highlight(positions) {
    for(var i = 0; i < positions.length; i++) {
        var tileX = positions[i][0];
        var tileY = positions[i][1];
        var charX = positions[i][2];
        var charY = positions[i][3];
        if(inkLimit > 10) return;
        if(!highlightFlash[tileY + "," + tileX]) {
            highlightFlash[tileY + "," + tileX] = {};
        }
        if(!highlightFlash[tileY + "," + tileX][charY]) {
            highlightFlash[tileY + "," + tileX][charY] = {};
        }
        if(!highlightFlash[tileY + "," + tileX][charY][charX]) {
            highlightFlash[tileY + "," + tileX][charY][charX] = [Date.now(), 128];
            inkLimit++;
        }
    }
}

var flashAnimateInterval = setInterval(function() {
    var tileGroup = {}; // tiles to re-render after highlight
    for(var tile in highlightFlash) {
        for(var charY in highlightFlash[tile]) {
            for(var charX in highlightFlash[tile][charY]) {
                var data = highlightFlash[tile][charY][charX];
                var time = data[0];
                // after 500 milliseconds
                if(Date.now() - time >= 500) {
                    delete highlightFlash[tile][charY][charX]
                    inkLimit--;
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
    var tileWidth = tileW | 0;
    var tileHeight = tileH | 0;
    if(returnCanvas) {
        // returning a canvas (for scaling purposes), so use the constant tile sizes
        tileWidth = dTileW | 0;
        tileHeight = dTileH | 0;
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
            // perform calculation to get chunk out of the image tiled
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
    var tilePosX = tileX * tileW + positionX + (width / 2 | 0);
    var tilePosY = tileY * tileH + positionY + (height / 2 | 0);
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

function decodeCharProt(str) {
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

function renderTile(tileX, tileY, redraw) {
    if(!isTileVisible(tileX, tileY)) {
        return;
    }
    var str = tileY + "," + tileX;
    var offsetX = tileX * tileW + (width / 2 | 0) + positionX;
    var offsetY = tileY * tileH + (height / 2 | 0) + positionY;

    // unloaded tiles
    if(!tiles[str] || (tiles[str] && !tiles[str].initted)) {
        // unloaded tile background is already drawn
        if(tilePixelCache[str]) {
            textLayerCtx.clearRect(offsetX, offsetY, tileW, tileH);
            textLayerCtx.drawImage(tilePixelCache[str][0], offsetX, offsetY)
            return;
        }
        // generate tile background
        var imgData = generateBackgroundPixels(tileX, tileY, images.unloaded);
        // get main canvas of the tile
        var tileCanv = getTileCanvas(str);
        var textRenderCanvas = tileCanv[0];
        // get the canvas context
        var textRender = tileCanv[1];
        textRender.putImageData(imgData, 0, 0);
        textLayerCtx.clearRect(offsetX, offsetY, tileW, tileH);
        textLayerCtx.drawImage(tilePixelCache[str][0], offsetX, offsetY)
        return;
    }

    var tile = tiles[str];

    if(tile == null) {
        tiles[str] = blankTile();
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
    var tileColorInverted = "#" + ("00000" + (16777215 - parseInt(tileColor.substr(1), 16)).toString(16).toUpperCase()).slice(-6);

    // fill tile background color
    ctx.fillRect(offsetX, offsetY, tileW, tileH);

    // precise tile protection
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

    // draw cursor
    if(cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
        var charX = cursorCoords[2];
        var charY = cursorCoords[3];
        ctx.fillStyle = styles.cursor;
        ctx.fillRect(offsetX + charX * cellW, offsetY + charY * cellH, cellW, cellH);
    }

    var highlight = highlightFlash[str];
    if(!highlight) highlight = {};

    for(var y = 0; y < tileR; y++) {
        for(var x = 0; x < tileC; x++) {
            // highlight flash animation
            if(highlight[y]) {
                if(highlight[y][x] !== void 0) {
                    ctx.fillStyle = "rgb(255, 255, " + highlight[y][x][1] + ")";
                    ctx.fillRect(offsetX + x * cellW, offsetY + y * cellH, cellW, cellH);
                }
            }
        }
    }

    function drawGrid(canv, isTileCanvas) {
        // draw the grid
        if(gridEnabled) {
            var thisOffsetX = offsetX;
            var thisOffsetY = offsetY;

            if(isTileCanvas) {
                thisOffsetX = 0;
                thisOffsetY = 0;
            }

            canv.fillStyle = "#B9B9B9";
            for(var x = 1; x < tileC; x++) {
                for(var y = 1; y < tileR; y++) {
                    canv.fillRect(thisOffsetX, thisOffsetY + tileH - zoom - (y*cellH), tileW, zoom);
                    canv.fillRect(thisOffsetX + tileW - zoom - (x*cellW), thisOffsetY, zoom, tileH);
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
    // been drawn at least once?
    tile.been_drawn = true;

    // tile is being redrawn via boolean (draw next time renderer is called), so set it back to false
    if(tile.redraw) {
        delete tile.redraw;
    }

    var tileCanv = getTileCanvas(str);
    var textRenderCanvas = tileCanv[0];
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
            // if text has no color, use default text color. otherwise, colorize it
            if(color == 0 || !colorsEnabled) {
                textRender.fillStyle = styles.text;
            } else {
                textRender.fillStyle = "#" + ("00000" + color.toString(16)).slice(-6);
            }
            // check if this char is a link
            if(props[y]) {
                if(props[y][x]) {
                    var link = props[y][x].link;
                    if(link) {
                        isLink = true;
                        if(link.type == "url") {
                            linkColor = "#0000FF"; // green
                        } else if(link.type == "coord") {
                            linkColor = "#008000"; // blue
                        }
                    }
                }
            }
            if(!char) char = " ";
            // make sure colored text stays the same color after linking
            if(color == 0 || !colorsEnabled) {
                textRender.fillStyle = linkColor;
            }
            // underline link
            if(isLink) {
                textRender.fillRect(x * cellW, (y * cellH + textYOffset + zoom), cellW, zoom)
            }
            if(char != "\u0020" && char != "\u00a0") { // ignore whitespace characters
                if(char == "\u2588") { // █ full block
                    textRender.fillRect(x*cellW, y*cellH, cellW, cellH);
                } else if(char == "\u2580") { // ▀ top half block
                    textRender.fillRect(x*cellW, y*cellH, cellW, cellH / 2 | 0);
                } else if(char == "\u2584") { // ▄ bottom half block
                    textRender.fillRect(x*cellW, y*cellH + (cellH/2|0), cellW, cellH / 2 | 0);
                } else if(char == "\u258c") { // ▌ left half block
                    textRender.fillRect(x*cellW, y*cellH, cellW/2|0, cellH);
                } else if(char == "\u2590") { // ▐ right half block
                    textRender.fillRect(x*cellW + (cellW/2|0), y*cellH, cellW/2|0, cellH);
                } else {
                    if(char.length > 1) textRender.font = specialCharFont;
                    textRender.fillText(char, x*cellW, y*cellH + textYOffset)
                    if(char.length > 1) textRender.font = font;
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
    $("#coord_Y").text(centerY);
    $("#coord_X").text(centerX);

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
    $("#tile_choice").css("background-color", tileChoiceColor);
    $("#char_choice").css("background-color", charChoiceColor);
}
protectPrecisionOption(protectPrecision);

var menu;
function buildMenu() {
    menu = new Menu($("#menu"), $("#nav"));
    menu.addCheckboxOption(" Show coordinates", function() {
        return $("#coords").show();
    }, function() {
        return $("#coords").hide();
    });
    menu.addOption("Change color", w.color);
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
    menu.addCheckboxOption(" Links enabled", function() {
        linksEnabled = true;
    }, function() {
        linksEnabled = false;
    }, true);
    menu.addCheckboxOption(" Colors enabled", function() {
        colorsEnabled = true;
        renderTiles(true);
    }, function() {
        colorsEnabled = false;
        renderTiles(true);
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
}

document.onselectstart = function(e) {
    var target = e.target;
    if($(target).closest(getChatfield())[0] == getChatfield()[0] || target == $("#chatbar")[0]) {
        return true;
    }
    return w._state.uiModal;
}
// [tileX, tileY, charX, charY]
var lastLinkHover = null;
// [type, tileX, tileY, (charX, charY)]
var lastTileHover = null;

var w = {
    userCount: -1,
    clientId: -1,
    isLinking: false,
    isProtecting: false,
    url_input: "",
    coord_input_x: 0,
    coord_input_y: 0,
    link_input_type: 0, // 0 = link, 1 = coord,
    protect_type: null, // null = unprotect, 0 = public, 1 = member, 2 = owner
    protect_bg: "",
    _state: state,
    _ui: {
		announce: $("#announce"),
		coordinateInputModal: new CoordinateInputModal(),
		scrolling: null,
		urlInputModal: new URLInputModal(),
		colorInputModal: new ColorInputModal()
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
        $("#protect_precision").css("display", "");
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
    getTileVisibility: function() { // emulate YWOT's getTileVisibility (unused here)
        var minVisY = (-positionY - (height / 2|0)) / tileH;
        var minVisX = (-positionX - (width / 2|0)) / tileW;
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
    }
}

if (state.announce) {
    w._ui.announce.html(w._state.announce);
    w._ui.announce.show();
}

w._state.goToCoord = {};
w._state.uiModal = false; // is the UI open? (coord, url, go to coord)

buildMenu();

$(document).bind("simplemodal_onopen", function() {
    return w._state.uiModal = true;
});
$(document).bind("simplemodal_onclose", function() {
    return w._state.uiModal = false;
});

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
		var animationInterval = tilesAnimated[posStr] = setInterval(function doAnimation() {
			if (!tiles[posStr]) // not visible
				stopAnimation(posStr);
			var frame = frames[atFrame];
			var newTile = tile;
			newTile.content = frame[0];
			newTile.properties.color = frame[1];
			tiles[posStr] = newTile;
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

function updateUsrCount() {
    $("#usr_online").text(w.userCount + " Users Online");
}

var ws_functions = {
    fetch: function(data) {
        for(var i in data.tiles) {
			var tile = data.tiles[i];
			if (tile && tile.properties && tile.properties.animation) {
				animateTile(tile, i); // if it's already animated it will stop the old animation
			} else if (isAnimated(i)) {
				stopAnimation(i);
			}
            tiles[i] = tile;
            if(!tiles[i]) tiles[i] = blankTile();
            tiles[i].initted = true;
            var pos = getPos(i);
            if(tiles[i].properties.char) {
                tiles[i].properties.char = decodeCharProt(tiles[i].properties.char);
            }
            renderTile(pos[1], pos[0], true);
        }
        // too many tiles, remove tiles outside of the viewport
        var tileLim = 1000;
        if(zoomRatio < 0.5) { // zoomed out too far? make sure tiles don't constantly unload
            tileLim = 4000;
        }
        if(Object.keys(tiles).length >= tileLim) {
            clearTiles()
        }
    },
    colors: function(data) {
        // update all world colors
        styles.public = data.colors.background;
        styles.cursor = data.colors.cursor;
        styles.member = data.colors.member_area;
        styles.menu = data.colors.menu;
        styles.owner = data.colors.owner_area;
        styles.text = data.colors.text;
        renderTiles(true); // render all tiles with new colors
        menu_color(styles.menu);
    },
    tileUpdate: function(data) {
        var highlights = [];
        for(i in data.tiles) {
            // if tile isn't loaded, load it blank
            if(!tiles[i]) {
                tiles[i] = blankTile();
            }
            if(!data.tiles[i]) {
                data.tiles[i] = blankTile();
            }
            if(!data.tiles[i].properties.color) {
                data.tiles[i].properties.color = Object.assign([], blankColor);
            }
            if(data.tiles[i].properties.char) {
                data.tiles[i].properties.char = decodeCharProt(data.tiles[i].properties.char);
            }
			if (data.tiles[i].properties.animation) {
				animateTile(data.tiles[i], i); // if it's already animated it will stop the old animation
			} else if (isAnimated(i)) {
				stopAnimation(i);
			}
            if(!tiles[i].properties.color) {
                tiles[i].properties.color = Object.assign([], blankColor);
            }
            var pos = getPos(i);
            var tileX = pos[1];
            var tileY = pos[0];

            var newContent = blank;
            var newColors = newColorArray();
            // get content and colors from new tile data
            if(data.tiles[i]) {
                newContent = data.tiles[i].content
                if(data.tiles[i].properties.color) {
                    newColors = data.tiles[i].properties.color;
                }
            }
            var oldContent = tiles[i].content;
            var oldColors = tiles[i].properties.color.slice(0);
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
                    highlights.push([tileX, tileY, charX, charY]);
                }
                charX++;
                if(charX >= tileC) {
                    charX = 0;
                    charY++;
                }
            }
            oldContent = oldContent.join("");
            tiles[i].properties = data.tiles[i].properties; // update tile
            tiles[i].content = oldContent; // update only necessary character updates
            tiles[i].properties.color = oldColors; // update only necessary color updates
            tiles[i].redraw = true;
            tiles[i].initted = true;
            var pos = getPos(i);
            renderTile(pos[1], pos[0]);
        }
        if(highlights.length > 0) highlight(highlights);
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
			w._ui.announce.html(data.text);
			w._ui.announce.show();
		} else {
			w._ui.announce.hide();
		}
    },
    ping: function() {
        clearTimeout(pingTimeout);
		pingTimeout = setTimeout(function() {
			socket.send("2::");
		}, pingInterval * 1000)
    },
    tile_clear: function(data) {
        var pos = data.tileY + "," + data.tileX;
        if(tiles[pos]) {
            var writability = tiles[pos].properties.writability;
            tiles[pos] = blankTile();
            tiles[pos].initted = true;
            tiles[pos].properties.writability = writability;
            renderTile(data.tileX, data.tileY);
        }
    },
    chat: function(data) {
        if(data.channel == w.socketChannel) return;
        var type = "";
        if(data.registered && data.nickname == data.realUsername) type = "user";
        if(data.registered && data.nickname != data.realUsername) type = "user_nick";
        if(!data.registered && !data.nickname) type = "anon";
        if(!data.registered && data.nickname) type = "anon_nick";

        addChat(data.location, data.id, type, data.nickname, data.message, data.realUsername);
    },
    user_count: function(data) {
        var count = data.count;
        w.userCount = count;
        updateUsrCount();
    }
};