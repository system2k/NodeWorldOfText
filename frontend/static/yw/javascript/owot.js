$("#loading").hide();
var owot = $("#owot")[0];
var textInput = $("#textInput");
var textLayer = $("#text")[0];
buildMenu();
owot.hidden = false;
textLayer.hidden = false;
textLayer.style.pointerEvents = "none";
owot.style.cursor = "text";
var width = window.innerWidth;
var height = window.innerHeight;

owot.width = width;
owot.height = height;

var canvasTextRender = document.createElement("canvas");
canvasTextRender.width = 10 * 16;
canvasTextRender.height = 18 * 8;
var textRender = canvasTextRender.getContext("2d");

var cursorCoords = null;

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
path = path.substr("/betaclient".length)
var ws_path = ws_scheme + "://" + wsaddr + path + "/ws/";

var styles = {};

// get world style
jQuery.ajax({
    type: "GET",
    url: "/world_style_beta/?world=" + window.location.pathname.substr("/betaclient/".length),
    success: function(e) {
        createSocket();
        styles = e;
        writability_styles = [styles.public, styles.member, styles.owner]
    },
    dataType: "json"
});

var dragStartX = 0;
var dragStartY = 0;
// the offset before clicking to drag
var dragPosX = 0;
var dragPosY = 0;
var isDragging = false;
$(document).on("mousedown", function(e) {
    dragStartX = e.pageX;
    dragStartY = e.pageY;
    dragPosX = positionX;
    dragPosY = positionY;
    isDragging = true;
})
function renderCursor(coords) {
    if(cursorCoords) {
        var tileX = cursorCoords[0];
        var tileY = cursorCoords[1];
        cursorCoords = null;
        renderTile(tileX, tileY);
    }
    cursorCoords = coords;
    renderTile(coords[0], coords[1]);
}
// tileX, charX
var lastX = [0, 0];
$(document).on("mouseup", function(e) {
    var pos = getTileCoordsFromMouseCoords(e.pageX, e.pageY);
    lastX = [pos[0], pos[2]];
    renderCursor(pos);
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
	return data;
}

var blank = "";
for(var i = 0; i < 128; i++) blank += " ";

function containsNewLine(char) {
    for(var i = 0; i < char.length; i++) {
        if(char.charAt(i) == "\n") return true;
    }
}

function writeChar(char) {
    if(cursorCoords) {
        var tileX = cursorCoords[0];
        var tileY = cursorCoords[1];
        var charX = cursorCoords[2];
        var charY = cursorCoords[3];
        var newLine = containsNewLine(char);
        if(!newLine) {
            var con = tiles[tileY + "," + tileX].content;
            con = advancedSplit(con);
            // replace character
            con[charY * 16 + charX] = char;
            // join splitted content string
            tiles[tileY + "," + tileX].content = con.join("");
            // delete from cache to re-render
            delete tilePixelCache[tileY + "," + tileX];
            renderTile(tileX, tileY)
        }
        // get copy of cursor coordinates
        var cSCopy = cursorCoords.slice();
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

textInput[0].oninput = function(e) {
    var value = textInput[0].value;
    textInput[0].value = "";
    value = value.replace(/\r\n/g, "\n");
    // split all characters (including ones with surrogates and combining chars)
    value = advancedSplit(value);
    for(var i = 0; i < value.length; i++) {
        var char = value[i];
        if(!char) char = " ";
        writeChar(char);
    }
}

$(document).on("keydown", function() {
    textInput.focus();
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

function getBounds() {
    var A = getTileCoordsFromMouseCoords(0, 0);
    var B = getTileCoordsFromMouseCoords(width - 1, height - 1);
    return getRange(A[0], A[1], B[0], B[1]);
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
$("body")[0].append(linkElm);
linkElm.innerHTML = "<div style=\"width: 10px; height: 18px;\"></div>";
linkElm.style.position = "absolute";
linkElm.title = "Link to url...";
linkElm.style.display = "block";
linkElm.target = "_blank";

var waitTimeout = 33;
var lastRender = 0;
$(document).on("mousemove", function(e) {
    var coords = getTileCoordsFromMouseCoords(e.pageX, e.pageY)
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
            linkElm.onclick = function() { return false };
            linkElm.href = "javascript:void(0);";
            linkElm.target = "";
        }
    } else {
        linkElm.hidden = true;
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

function createSocket() {
    socket = new ReconnectingWebSocket(ws_path);

    socket.onmessage = function(msg) {
        var data = JSON.parse(msg.data);
        var kind = data.kind;
        if(ws_functions[kind]) {
            ws_functions[kind](data);
        }
    }

    socket.onopen = function(msg) {
        socket.send(JSON.stringify({
            fetchRectangles: [{
                minX: -100,
                minY: -100,
                maxX: 100,
                maxY: 100
            }],
            kind: "fetch",
            v: "3"
        }))
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

function renderTile(tileX, tileY) {
    var str = tileY + "," + tileX;
    var tile = tiles[str];

    var writability = null;
    // make sure tile is not null before getting the writability
    if(tile) writability = tile.properties.writability;

    // placeholder in case writability is null
    var temp_writability = writability;

    if(writability == null) temp_writability = world_writability;
    if(temp_writability == 0) ctx.fillStyle = styles.public;
    if(temp_writability == 1) ctx.fillStyle = styles.member;
    if(temp_writability == 2) ctx.fillStyle = styles.owner;
    var offsetX = tileX * 160 + (width / 2 | 0) + positionX;
    var offsetY = tileY * 144 + (height / 2 | 0) + positionY;
    // fill tile background color
    ctx.fillRect(offsetX, offsetY, 160, 144);

    // draw cursor
    if(cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
        var charX = cursorCoords[2];
        var charY = cursorCoords[3];
        ctx.fillStyle = styles.cursor;
        ctx.fillRect(offsetX + charX * 10, offsetY + charY * 18, 10, 18);
    }

    // tile is null, so don't add text/color data
    if(!tile) return;
    // tile is already written
    if(tilePixelCache[str]) {
        textLayerCtx.putImageData(tilePixelCache[str], offsetX, offsetY)
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
                if(char != "█") {
                    if(char.length > 1) textRender.font = "16px sans-serif";
                    textRender.fillText(char, x*10, y*18 + 13)
                    if(char.length > 1) textRender.font = font;
                } else {
                    textRender.fillRect(x*10, y*18, 10, 18);
                }
            }
        }
    }
    tilePixelCache[str] = textRender.getImageData(0, 0, 160, 144);
    textLayerCtx.putImageData(tilePixelCache[str], offsetX, offsetY)
    textRender.putImageData(textRender.createImageData(160, 144), 0, 0);
}

function renderTiles() {
    ctx.fillStyle = writability_styles[world_writability];
    // clear tile color layer
    ctx.fillRect(0, 0, width, height);
    // clear text layer
    textLayerCtx.clearRect(0, 0, width, height);
    // get all visible tiles
    var visibleTiles = getBounds();
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
    var _this = {worldModel: state.worldModel, userModel: state.userModel} // TEMPORARY
    menu.addOption("Change color", _this.color);
    if (Permissions.can_go_to_coord(_this.userModel, _this.worldModel)) {
        menu.addOption("Go to coordinates", _this.goToCoord);
    }
    if (Permissions.can_coordlink(_this.userModel, _this.worldModel)) {
        menu.addOption("Create link to coordinates", _this.coordLink);
    }
    if (Permissions.can_urllink(_this.userModel, _this.worldModel)) {
        menu.addOption("Create link to URL", _this.urlLink);
    }
    if (Permissions.can_admin(_this.userModel, _this.worldModel)) {
        menu.addOption("Make an area owner-only", function() {
            return _this.protectATile("owner-only");
        });
    }
    if (Permissions.can_protect_tiles(_this.userModel, _this.worldModel)) {
        menu.addOption("Make an area member-only", function() {
            return _this.protectATile("member-only");
        });
        menu.addOption("Make an area public", function() {
            return _this.protectATile("public");
        });
        return menu.addOption("Default area protection", _this.unprotectATile);
    }
}

if (typeof Object.assign != 'function') {
    // Must be writable: true, enumerable: false, configurable: true
    Object.defineProperty(Object, "assign", {
      value: function assign(target, varArgs) { // .length of function is 2
        'use strict';
        if (target == null) { // TypeError if undefined or null
          throw new TypeError('Cannot convert undefined or null to object');
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

var ws_functions = {
    fetch: function(data) {
        Object.assign(tiles, data.tiles)
        renderTiles();
    }
};