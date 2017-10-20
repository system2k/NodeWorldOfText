$("#loading").hide();
var owot = $("#owot")[0];
var textInput = $("#textInput");
var textLayer = $("#text")[0];
owot.hidden = false;
textLayer.hidden = false;
textLayer.style.pointerEvents = "none";
owot.style.cursor = "text";
var width = window.innerWidth;
var height = window.innerHeight;

var pingInterval = 50; // in seconds
var images = {};
// [data RGB, width, height]

var backgroundImageParser = document.createElement("canvas");
var backImg = backgroundImageParser.getContext("2d");
var unloadedImage = new Image();
unloadedImage.src = "/static/unloaded.png";
unloadedImage.onload = function() {
    backImg.drawImage(unloadedImage, 0, 0);
    var width = unloadedImage.width;
    var height = unloadedImage.height;
    images.unloaded = [removeAlpha(backImg.getImageData(0, 0, width, height).data), width, height];
    // one all the images are loaded
    renderTiles();
    begin();
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

var YourWorld = {
    Color: 0
}

$("#coord_Y").text(0);
$("#coord_X").text(0);

// edit ID
var nextObjId = 1;

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

// Fast tile protecting
$(document).on("mousemove.tileProtectAuto", function() {
    if(!tileProtectAuto.active) return;
    var tile = tiles[currentPosition[1] + "," + currentPosition[0]];
    if(!tile) return;
    if(!tile.initted) return;
    tileProtectAuto.selectedTile = tile;
    var tileX = currentPosition[0];
    var tileY = currentPosition[1];
    tileProtectAuto.xPos = tileX;
    tileProtectAuto.yPos = tileY;
    if(tileProtectAuto.ctrlDown) {
        var mode = tileProtectAuto.mode;
        tileProtectAuto.selected[tileY + "," + tileX] = [mode, tile];
        if (mode === 0) tile.backgroundColor = "red";
        if (mode === 1) tile.backgroundColor = "green";
        if (mode === 2) tile.backgroundColor = "blue";
        if (mode === 3) tile.backgroundColor = "teal";
        renderTile(tileX, tileY);
    }
    if(tileProtectAuto.shiftDown) {
        var pos = tileY + "," + tileX;
        if(tileProtectAuto.selected[pos] !== void 0) {
            tile.backgroundColor = ""
            delete tileProtectAuto.selected[pos];
            renderTile(tileX, tileY);
        }
    }
})

$("body").on("keydown.tileProtectAuto", function(e) {
    if(e.keyCode === 83 && (e.altKey || e.ctrlKey)) { // Alt/Ctrl + S to protect tiles
        if(e.ctrlKey) { // is Ctrl+S
            e.preventDefault();
        }
        var selected = tileProtectAuto.selected;
        var types = ["owner-only", "member-only", "public"];
        var keys = Object.keys(selected);
        if(keys.length == 0) return;
        var i = 0;
        function protectLoop() {
            // get tileX/Y position from key
            var pos = keys[i].split(",").map(Number);
            var cstr = keys[i];
            var prot = selected[cstr][0];

            var tileX = pos[1];
            var tileY = pos[0];
            var ajaxStr = "/ajax/protect/"
            if(prot == 3) ajaxStr = "/ajax/unprotect/"
            
            var data = {
                world: state.worldModel.name,
                tileY: tileY,
                tileX: tileX
            };
            if(prot != 3) { // if unprotect type
                data.type = types[prot];
            }
            jQuery.ajax({
                type: "POST",
                url: ajaxStr,
                data: data
            }).done(function(){
                selected[cstr][1].backgroundColor = "";
                renderTile(tileX, tileY);
                delete selected[cstr];
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
        delete tilePixelCache[tileY + "," + tileX];
        renderTile(tileX, tileY);
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
            delete tilePixelCache[tileY + "," + tileX];
            renderTile(tileX, tileY);
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
                delete selected[cstr];
                uncolorChar(tileX, tileY, charX, charY);
                delete tilePixelCache[tileY + "," + tileX];
                renderTile(tileX, tileY);
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

$(window).on("resize", function(e) {
    width = window.innerWidth;
    height = window.innerHeight;

    owot.width = width;
    owot.height = height;
    textLayer.width = width;
    textLayer.height = height;

    renderTiles();
})

owot.width = width;
owot.height = height;

var canvasTextRender = document.createElement("canvas");
canvasTextRender.width = 10 * 16;
canvasTextRender.height = 18 * 8;
var textRender = canvasTextRender.getContext("2d");

var cursorCoords = null;
var cursorCoordsCurrent = [0, 0, 0, 0, "NOT_INITTED"]; // cursorCoords that don't reset to null
var currentPosition = [0, 0, 0, 0];
var currentPositionInitted = false;

var positionX = 0;
var positionY = 0;
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
var path = window.location.pathname.replace(/\/$/, "");
var ws_path = ws_scheme + "://" + wsaddr + path + "/ws/";

var styles = {};

var menuStyle;
function menu_color(color) {
    // change menu color
    if(!window.menuStyle) {
        menuStyle = document.createElement("style")
        $("head")[0].append(menuStyle)
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
    owot.style.cursor = "text";
    var tileX = lastLinkHover[0];
    var tileY = lastLinkHover[1];
    var charX = lastLinkHover[2];
    var charY = lastLinkHover[3];
    // remove highlight
    uncolorChar(tileX, tileY, charX, charY);
    delete tilePixelCache[tileY + "," + tileX];
    renderTile(tileX, tileY);
}

function stopTileUI() {
    if(!lastTileHover) return;
    if(!w.isProtecting) return;
    w.isProtecting = false;
    owot.style.cursor = "text";
    var tileX = lastTileHover[0];
    var tileY = lastTileHover[1];
    // remove highlight

    if(tiles[tileY + "," + tileX]) {
        tiles[tileY + "," + tileX].backgroundColor = "";
    }
    delete tilePixelCache[tileY + "," + tileX];
    renderTile(tileX, tileY);
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
    var tileX = lastTileHover[0];
    var tileY = lastTileHover[1];
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
$(document).on("mousedown", function(e) {
    if(e.target != owot && e.target != linkDiv) return;
    dragStartX = e.pageX;
    dragStartY = e.pageY;
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
})

// change cursor position
function renderCursor(coords) {
    var newTileX = coords[0];
    var newTileY = coords[1];
    if(!tiles[newTileY + "," + newTileX]) return false;
    if(!tiles[newTileY + "," + newTileX].initted) return false;
    var writability = null;
    if(tiles[newTileY + "," + newTileX]) {
        writability = tiles[newTileY + "," + newTileX].properties.writability;
    }
    var thisTile = {
        initted: function() { return true },
        writability: writability
    }
    var tileX = 0;
    var tileY = 0;
    if(cursorCoords) {
        tileX = cursorCoords[0];
        tileY = cursorCoords[1];
    }
    if(!Permissions.can_edit_tile(state.userModel, state.worldModel, thisTile)) {
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

    var pixelX = (coords[0] * 160) + (coords[2] * 10) + positionX + (width / 2 | 0);
    var pixelY = (coords[1] * 144) + (coords[3] * 18) + positionY + (height / 2 | 0);
    
    var diff = null;
    var posXCompare = positionX;
    var posYCompare = positionY;

    if(pixelX < 0) { // cursor too far left
        diff = Math.abs(pixelX);
        positionX += diff;
    }
    if(pixelX + 10 >= width) { // cursor too far right
        diff = Math.abs(width - pixelX);
        positionX -= 10 - diff;
    }
    if(pixelY < 0) { // cursor too far up
        diff = Math.abs(pixelY);
        positionY += diff;
    }
    if(pixelY + 18 >= height) { // cursor too far down
        diff = Math.abs(height - pixelY);
        positionY -= 18 - diff;
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

// tileX, charX
var lastX = [0, 0];
$(document).on("mouseup", function(e) {
    if(e.target != owot && e.target != linkDiv) return;

    // set cursor
    var pos = getTileCoordsFromMouseCoords(e.pageX, e.pageY);
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

    isDragging = false;
    owot.style.cursor = "text";
})
$(document).on("mouseleave", function(e) {
    isDragging = false;
})
$(document).on("mouseenter", function(e) {
    isDragging = false;
})
function is_link(tileX, tileY, charX, charY) {
    if(tiles[tileY + "," + tileX]) {
        var tile = tiles[tileY + "," + tileX]
        if(tile) {
            var pos = charY * 16 + charX;
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

function blankColor() {
    var ar = [];
    for(var i = 0; i < 128; i++) {
        ar.push(0);
    }
    return ar;
}

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

function moveCursor(direction) {
    if(!cursorCoords) return;
    var cSCopy = cursorCoords.slice();
    // [tileX, tileY, charX, charY]

    if(direction == "up") {
        cSCopy[3]--;
        if(cSCopy[3] < 0) {
            cSCopy[3] = 7;
            cSCopy[1]--
        }
    } else if(direction == "down") {
        cSCopy[3]++;
        if(cSCopy[3] > 7) {
            cSCopy[3] = 0;
            cSCopy[1]++;
        }
    } else if(direction == "left") {
        cSCopy[2]--;
        if(cSCopy[2] < 0) {
            cSCopy[2] = 15;
            cSCopy[0]--;
        }
    } else if(direction == "right") {
        cSCopy[2]++;
        if(cSCopy[2] > 15) {
            cSCopy[2] = 0;
            cSCopy[0]++;
        }
    }
    lastX = [cSCopy[0], cSCopy[2]];
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
    if(cursor) {
        var tileX = cursor[0];
        var tileY = cursor[1];
        var charX = cursor[2];
        var charY = cursor[3];
        var newLine = containsNewLine(char);
        if(!newLine) {
            if(!tiles[tileY + "," + tileX]) {
                tiles[tileY + "," + tileX] = blankTile();
            }
            var cell_props = tiles[tileY + "," + tileX].properties.cell_props;
            if(!cell_props) cell_props = {};
            var color = tiles[tileY + "," + tileX].properties.color;
            if(!color) color = blankColor();

            // delete link
            if(cell_props[charY]) {
                if(cell_props[charY][charX]) {
                    delete cell_props[charY][charX];
                }
            }
            // change color
            color[charY * 16 + charX] = YourWorld.Color;
            tiles[tileY + "," + tileX].properties.color = color;
            // update cell properties (link positions)
            tiles[tileY + "," + tileX].properties.cell_props = cell_props;

            var con = tiles[tileY + "," + tileX].content;
            con = advancedSplit(con);
            // replace character
            con[charY * 16 + charX] = char;
            // join splitted content string
            tiles[tileY + "," + tileX].content = con.join("");
            // delete from cache to re-render
            delete tilePixelCache[tileY + "," + tileX];
            renderTile(tileX, tileY)

            var editArray = [tileY, tileX, charY, charX, Date.now(), char, nextObjId];
            if(color) {
                editArray.push(YourWorld.Color);
            }
            tellEdit.push([tileX, tileY, charX, charY, nextObjId]);
            writeBuffer.push(editArray);
            nextObjId++;
        }
        if(!doNotMoveCursor) {
            // get copy of cursor coordinates
            var cSCopy = cursor.slice();
            // move cursor to right
            cSCopy[2]++;
            if(cSCopy[2] >= 16) {
                cSCopy[2] = 0;
                cSCopy[0]++;
            }
            if(newLine) {
                // move cursor down
                cSCopy[3]++;
                if(cSCopy[3] >= 8) {
                    cSCopy[3] = 0;
                    cSCopy[1]++;
                }
                // move x position to last x position
                cSCopy[0] = lastX[0];
                cSCopy[2] = lastX[1];
            }
            renderCursor(cSCopy);
        }
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
            writeChar(value[index]);
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
        moveCursor("left");
        writeChar(" ", true);
    } else if(key == 27) { // esc
        stopLinkUI();
        stopTileUI();
        removeCursor();
        tileProtectAuto.active = false;
        linkAuto.active = false;
    }
})

function getTileCoordsFromMouseCoords(x, y) {
    var tileX = 0;
    var tileY = 0;
    var charX = 0;
    var charY = 0;
    // position relative to position in client and mouse
    var mpX = x - positionX - (width / 2 | 0);
    var mpY = y - positionY - (height / 2 | 0);
    // cell position (relative to anywhere)
    charX = Math.floor(mpX / 10);
    charY = Math.floor(mpY / 18);
    // add tile position
    tileX = Math.floor(charX / 16);
    tileY = Math.floor(charY / 8);
    // in-tile cell position
    charX = charX - (Math.floor(charX / 16) * 16);
    charY = charY - (Math.floor(charY / 8) * 8);
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
    var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
    var B = getTileCoordsFromMouseCoords(width - 1 + margin, height - 1 + margin);
    return getRange(A[0], A[1], B[0], B[1]);
}

function getWidth(margin) {
    if(!margin) margin = 0;
    var A = getTileCoordsFromMouseCoords(0 - margin, 0);
    var B = getTileCoordsFromMouseCoords(width - 1 + margin, 0);
    return B[0] - A[0] + 1;
}

function getHeight(margin) {
    if(!margin) margin = 0;
    var A = getTileCoordsFromMouseCoords(0, 0 - margin);
    var B = getTileCoordsFromMouseCoords(0, height - 1 + margin);
    return B[1] - A[1] + 1;
}

function tileAndCharsToWindowCoords(tileX, tileY, charX, charY) {
    var x = tileX * 160;
    var y = tileY * 144;
    x += charX * 10;
    y += charY * 18;
    x += positionX;
    y += positionY;
    x += (width / 2 | 0);
    y += (height / 2 | 0);
    return [x, y];
}

var linkElm = document.createElement("a");
linkElm.href = "test";
$("body")[0].appendChild(linkElm);
var linkDiv = document.createElement("div");
linkDiv.style.width = "10px";
linkDiv.style.height = "18px";
linkElm.appendChild(linkDiv);
linkElm.style.position = "absolute";
linkElm.title = "Link to url...";
linkElm.style.display = "block";
linkElm.target = "_blank";
linkElm.style.cursor = "pointer";

var waitTimeout = 0; // 0: no wait timeout
var lastRender = 0;
$(document).on("mousemove", function(e) {
    var coords = getTileCoordsFromMouseCoords(e.pageX, e.pageY)
    currentPosition = coords;
    currentPositionInitted = true;
    var tileX = coords[0];
    var tileY = coords[1];
    var charX = coords[2];
    var charY = coords[3];

    var link = is_link(tileX, tileY, charX, charY);
    if(link) {
        var pos = tileAndCharsToWindowCoords(tileX, tileY, charX, charY);
        linkElm.style.left = pos[0] + "px";
        linkElm.style.top = pos[1] + "px";
        linkElm.hidden = false;
        linkElm.onclick = "";
        linkElm.target = "_blank";
        if(link[0].type == "url") {
            linkElm.title = "Link to URL " + link[0].url;
            linkElm.href = link[0].url;
        } else if(link[0].type == "coord") {
            var pos = link[0].link_tileX + "," + link[0].link_tileY;
            linkElm.title = "Link to coordinates " + pos;
            linkElm.href = "javascript:w.doGoToCoord(" +
                link[0].link_tileY + "," + link[0].link_tileX + ");";
            linkElm.target = "";
        }
    } else {
        linkElm.style.top = "-100px";
        linkElm.style.left = "-100px";
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
            delete tilePixelCache[tileY + "," + tileX];
            renderTile(tileX, tileY);
        }
        lastLinkHover = currentPosition;
        var newTileX = currentPosition[0];
        var newTileY = currentPosition[1];
        var newCharX = currentPosition[2];
        var newCharY = currentPosition[3];
        if(tiles[newTileY + "," + newTileX]) {
            colorChar(newTileX, newTileY, newCharX, newCharY, "#aaf", true);
            // re-render tile
            delete tilePixelCache[newTileY + "," + newTileX];
            renderTile(newTileX, newTileY);
        }
    }
    // tile protection
    if(w.isProtecting) {
        if(lastTileHover) {
            var tileX = lastTileHover[0];
            var tileY = lastTileHover[1];
            if(tiles[tileY + "," + tileX] && !tileProtectAuto.selected[tileY + "," + tileX]) {
                tiles[tileY + "," + tileX].backgroundColor = "";
            }
            delete tilePixelCache[tileY + "," + tileX];
            renderTile(tileX, tileY);
        }
        lastTileHover = currentPosition;
        var newTileX = currentPosition[0];
        var newTileY = currentPosition[1];
        if(tiles[newTileY + "," + newTileX] && !tileProtectAuto.selected[newTileY + "," + newTileX]) {
            tiles[newTileY + "," + newTileX].backgroundColor = w.protect_bg;
            renderTile(newTileX, newTileY);
        }
    }

    if(!isDragging) return;

    // wait before updating coords and tiles
    if(Date.now() - lastRender < waitTimeout) return;
    lastRender = Date.now();

    var posX = e.pageX;
    var posY = e.pageY;

    positionX = dragPosX + (posX - dragStartX);
    positionY = dragPosY + (posY - dragStartY);

    renderTiles();
})
$(document).on("wheel", function(e) {
    if(e.ctrlKey) return; // don't scroll if ctrl is down (zooming)
    var deltaX = e.originalEvent.deltaX;
    var deltaY = e.originalEvent.deltaY;
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
        fetchInterval = setInterval(function() {
            getAndFetchTiles();
        }, 300)
        socket.send("2::"); // initial ping
    }
}

// fetches only unloaded tiles
function getAndFetchTiles() {
    var margin = 200;
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

// clears all tiles outside the viewport
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

var font = "16px 'Courier New'"
textRender.font = font;

function newColorArray() {
    var ar = [];
    for(var i = 0; i < 128; i++) {
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
    var tileGroupCount = 0;
    for(var i in tileGroup) {
        var pos = getPos(i);
        renderTile(pos[1], pos[0]);
        tileGroupCount++;
    }
}, 1)

var blank = "";
for(var i = 0; i < 128; i++) blank += " ";

function blankTile() {
    return {
        content: blank,
        properties: {
            cell_props: {},
            writability: null,
            color: blankColor()
        },
        initted: false
    };
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
    if(coloredChars[tileY + "," + tileX] && !linkAuto.selected[pos]) {
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

function renderTile(tileX, tileY) {
    var str = tileY + "," + tileX;
    var offsetX = tileX * 160 + (width / 2 | 0) + positionX;
    var offsetY = tileY * 144 + (height / 2 | 0) + positionY;

    // unloaded tiles
    if(!(str in tiles)) {
        var imgData = textLayerCtx.createImageData(160, 144);
        var fromData = images.unloaded[0];
        var img_width = images.unloaded[1];
        var img_height = images.unloaded[2];
        var startX = tileX * 160;
        var startY = tileY * 144;
        for(var y = 0; y < 144; y++) {
            for(var x = 0; x < 160; x++) {
                var posX = startX + x;
                var posY = startY + y;
                posX = posX - Math.floor(posX / img_width) * img_width;
                posY = posY - Math.floor(posY / img_height) * img_height;
                var index = (posY * img_width + posX) * 3;
                var destIndex = (y * 160 + x) * 4;
                imgData.data[destIndex + 0] = fromData[index + 0];
                imgData.data[destIndex + 1] = fromData[index + 1];
                imgData.data[destIndex + 2] = fromData[index + 2];
                imgData.data[destIndex + 3] = 255;
            }
        }
        tilePixelCache[str] = imgData;
        textLayerCtx.putImageData(tilePixelCache[str], offsetX, offsetY);
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

    // fill tile background color
    ctx.fillRect(offsetX, offsetY, 160, 144);

    // draw cursor
    if(cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
        var charX = cursorCoords[2];
        var charY = cursorCoords[3];
        ctx.fillStyle = styles.cursor;
        ctx.fillRect(offsetX + charX * 10, offsetY + charY * 18, 10, 18);
    }

    var highlight = highlightFlash[str];
    if(!highlight) highlight = {};

    for(var y = 0; y < 8; y++) {
        for(var x = 0; x < 16; x++) {
            // highlight flash animation
            if(highlight[y]) {
                if(highlight[y][x] !== void 0) {
                    ctx.fillStyle = "rgb(255, 255, " + highlight[y][x][1] + ")";
                    ctx.fillRect(offsetX + x * 10, offsetY + y * 18, 10, 18);
                }
            }
        }
    }

    // tile is null, so don't add text/color data
    if(!tile) return;
    // tile is already written
    if(tilePixelCache[str]) {
        textLayerCtx.putImageData(tilePixelCache[str], offsetX, offsetY)
        //textLayerCtx.drawImage(canvasTextRender, offsetX, offsetY)
        return;
    }
    var content = tile.content;
    var colors = tile.properties.color;
    // color data doesn't exist, use empty array as placeholder
    if(!colors) colors = newColorArray();

    var props = tile.properties.cell_props;
    if(!props) props = {};

    content = advancedSplit(content);

    for(var y = 0; y < 8; y++) {
        for(var x = 0; x < 16; x++) {
            // fill background if defined
            if(coloredChars[str]) {
                if(coloredChars[str][y]) {
                    if(coloredChars[str][y][x]) {
                        var color = coloredChars[str][y][x];
                        textRender.fillStyle = color;
                        textRender.fillRect(x * 10, y * 18, 10, 18);
                    }
                }
            }

            var char = content[y * 16 + x];
            var color = colors[y * 16 + x];
            // initialize link color to default text color in case there's no link to color
            var linkColor = styles.text;
            var isLink = false;
            // if text has no color, use defaul text color. otherwise, colorize it
            if(color == 0) {
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
            // make sure colored text stays colored after linking
            if(color == 0) {
                textRender.fillStyle = linkColor;
            }
            // underline link
            if(isLink) {
                textRender.fillRect(x * 10, (y * 18 + (13 + 1)), 10, 1)
            }
            // ignore whitespace characters
            if(char != "\u0020" && char != "\u00a0") {
                if(char == "█") {
                    textRender.fillRect(x*10, y*18, 10, 18);
                } else if(char == "▀") {
                    textRender.fillRect(x*10, y*18, 10, 9);
                } else if(char == "▄") {
                    textRender.fillRect(x*10, y*18 + 9, 10, 9);
                } else if(char == "▌") {
                    textRender.fillRect(x*10, y*18, 5, 18);
                } else if(char == "▐") {
                    textRender.fillRect(x*10 + 5, y*18, 5, 18);
                } else {
                    if(!char) char = " ";
                    if(char.length > 1) textRender.font = "16px sans-serif";
                    textRender.fillText(char, x*10, y*18 + 13)
                    if(char.length > 1) textRender.font = font;
                }
            }
        }
    }
    tilePixelCache[str] = textRender.getImageData(0, 0, 160, 144);
    textLayerCtx.putImageData(tilePixelCache[str], offsetX, offsetY)
    textRender.putImageData(textRender.createImageData(160, 144), 0, 0);
}

function renderTiles() {
    // update coordinate display
    var tileCoordX = Math.floor(-positionX / 160);
    var tileCoordY = Math.floor(-positionY / 144);
    var centerY = -Math.floor(tileCoordY / 4);
    var centerX = Math.floor(tileCoordX / 4);
    $("#coord_Y").text(centerY);
    $("#coord_X").text(centerX);

    ctx.fillStyle = "#ddd";
    // clear tile color layer
    ctx.fillRect(0, 0, width, height);
    // clear text layer
    textLayerCtx.clearRect(0, 0, width, height);
    // get all visible tiles
    var visibleTiles = getVisibleTiles();
    for(var i in visibleTiles) {
        // get position from string position: "Y,X"
        var tileX = visibleTiles[i][0];
        var tileY = visibleTiles[i][1];
        renderTile(tileX, tileY);
    }
}

function buildMenu() {
    var menu;
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
        return menu.addOption("Default area protection", w.doUnprotect);
    }
}

document.onselectstart = function() {
    return w._state.uiModal;
}
// [tileX, tileY, charX, charY]
var lastLinkHover = null;
// [tileX, tileY]
var lastTileHover = null;

var w = {
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
        var scroller;
        y *= -4;
        x *= 4;
        y += 2;
        x += 2;
        if (!w._state.goToCoord.initted) {
            w._state.goToCoord.cancel = function() {
                clearInterval(w._state.goToCoord.interval);
                return $(document).trigger("YWOT_GoToCoord_stop");
            };
            $(document).bind("YWOT_GoToCoord_start", function() {
                return $(document).bind("mousedown", w._state.goToCoord.cancel);
            });
            $(document).bind("YWOT_GoToCoord_stop", function() {
                $(document).unbind("mousedown", w._state.goToCoord.cancel);
            });
            w._state.goToCoord.initted = true;
        }
        scroller = function() {
            var centerX;
            var centerY;
            var distance;
            var xDiff;
            var xMove;
            var yDiff;
            var yMove;
            var _ref;
            _ref = w.getCenterCoords(), centerY = _ref[0], centerX = _ref[1];
            yDiff = y - centerY;
            xDiff = x - centerX;
            yDiff *= 144;
            xDiff *= 160;
            distance = Helpers.vectorLen(yDiff, xDiff);
            yMove = Math.round(yDiff * 20 / distance);
            xMove = Math.round(xDiff * 20 / distance);
            if (Helpers.vectorLen(yDiff, xDiff) < 40) {
                w._state.goToCoord.cancel();
                return;
            }
            yDiff = yDiff - yMove;
            positionY -= yMove;
            xDiff = xDiff - xMove;
            positionX -= xMove;
            renderTiles();
        };
        w._state.goToCoord.interval = setInterval(scroller, 25);
        $(document).trigger("YWOT_GoToCoord_start");
    },
    getCenterCoords: function() {
        return [-positionY / 144, -positionX / 160]
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
        tileProtectAuto.active = true;
		if(unprotect) { // default area protection
			tileProtectAuto.mode = 3;
		} else {
			if(protectType == "owner-only") tileProtectAuto.mode = 0;
			if(protectType == "member-only") tileProtectAuto.mode = 1;
			if(protectType == "public") tileProtectAuto.mode = 2;
        }
        console.log(protectType, unprotect)

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
    moveCursor: moveCursor
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
        if(tellEdit[i][0] == tileX &&
            tellEdit[i][1] == tileY &&
            tellEdit[i][2] == charX &&
            tellEdit[i][3] == charY) {
            return true;
        }
    }
    return false;
}

var ws_functions = {
    fetch: function(data) {
        for(var i in data.tiles) {
            tiles[i] = data.tiles[i];
            if(!tiles[i]) tiles[i] = blankTile();
            tiles[i].initted = true;
            // re-render tile
            delete tilePixelCache[i];
        }
        // too many tiles, remove tiles outside of the viewport
        if(Object.keys(tiles).length >= 1000) {
            clearTiles()
        }
        renderTiles();
    },
    colors: function(data) {
        // update all world colors
        styles.public = data.colors.background;
        styles.cursor = data.colors.cursor;
        styles.member = data.colors.member_area;
        styles.menu = data.colors.menu;
        styles.owner = data.colors.owner_area;
        styles.text = data.colors.text;
        tilePixelCache = {};
        renderTiles();
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
                data.tiles[i].properties.color = blankColor();
            }
            if(!tiles[i].properties.color) {
                tiles[i].properties.color = blankColor();
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
            for(var g = 0; g < 128; g++) {
                var oChar = oldContent[g];
                var nChar = newContent[g];
                var oCol = oldColors[g];
                var nCol = newColors[g];
                if(oChar != nChar || oCol != nCol) {
                    // make sure it won't overwrite the clients changes before they get sent.
                    // if edits are from client, don't overwrite, but leave the highlight flashes

                    if(!searchTellEdit(tileX, tileY, charX, charY) && data.channel != w.socketChannel) {
                        oldContent[g] = nChar;
                        oldColors[g] = nCol;
                    }
                    // briefly highlight these edits (10 at a time)
                    highlights.push([tileX, tileY, charX, charY]);
                }
                charX++;
                if(charX >= 16) {
                    charX = 0;
                    charY++;
                }
            }
            oldContent = oldContent.join("");
            delete tilePixelCache[i]; // force tile to be redrawn
            tiles[i].properties = data.tiles[i].properties; // update tile
            tiles[i].content = oldContent; // update only necessary character updates
            tiles[i].properties.color = oldColors; // update only necessary color updates
            renderTile(tileX, tileY);
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
    }
};