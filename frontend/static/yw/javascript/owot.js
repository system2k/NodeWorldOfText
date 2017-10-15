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

var images = {};
// [data RGB, width, height]

var backgroundImageParser = document.createElement("canvas");
var backImg = backgroundImageParser.getContext("2d");
var unloadedImage = new Image();
unloadedImage.src = "/static/unloaded.png";
unloadedImage.onload = function() {
    backImg.drawImage(unloadedImage, 0, 0);
    images.unloaded = [removeAlpha(backImg.getImageData(0, 0, 16, 16).data), 16, 16];
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
var currentPosition = [0, 0, 0, 0];

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

function begin() {
    // get world style
    jQuery.ajax({
        type: "GET",
        url: "/world_style/?world=" + state.worldModel.name,
        success: function(e) {
            createSocket();
            styles = e;

            // change menu color
            var menuStyle = document.createElement("style")
            menuStyle.innerHTML = "#menu.hover, #nav { background: " + styles.menu + "; }"
            $("head")[0].append(menuStyle)

            writability_styles = [styles.public, styles.member, styles.owner]
        },
        dataType: "json"
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
    textInput[0].value = "";
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
    if(e.target != owot && e.target != linkDiv) return;
    var pos = getTileCoordsFromMouseCoords(e.pageX, e.pageY);
    lastX = [pos[0], pos[2]];
    if(tiles[pos[1] + "," + pos[0]] !== void 0) renderCursor(pos);
    isDragging = false;
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
	return data;
}

var blank = "";
for(var i = 0; i < 128; i++) blank += " ";

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

function writeChar(char) {
    if(cursorCoords) {
        var tileX = cursorCoords[0];
        var tileY = cursorCoords[1];
        var charX = cursorCoords[2];
        var charY = cursorCoords[3];
        var newLine = containsNewLine(char);
        if(!newLine) {
            if(!tiles[tileY + "," + tileX]) {
                tiles[tileY + "," + tileX] = blankTile();
            }
            var cell_props = tiles[tileY + "," + tileX].properties.cell_props;
            if(!cell_props) cell_props = {};
            var color = tiles[tileY + "," + tileX].properties.color;
            if(!color) color = blankColor();

            if(cell_props[charY]) {
                if(cell_props[charY][charX]) {
                    delete cell_props[charY][charX];
                }
            }
            color[charY * 16 + charX] = YourWorld.Color;
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
            writeBuffer.push(editArray);
            nextObjId++;
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

// write characters inputted
setInterval(function() {
    var value = textInput[0].value;
    if(value == "") return;
    value = value.replace(/\r\n/g, "\n");
    value = advancedSplit(value);
    writeChar(value[0]);
    value.shift();
    textInput[0].value = value.join("");
    if (!Permissions.can_paste(state.userModel, state.worldModel)) {
        textInput[0].value = "";
    }
}, 10);

$(document).on("keydown", function() {
    if(w._state.uiModal) return;
    textInput.focus();
    textInput[0].value = "";
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

function getVisibleTiles() {
    var A = getTileCoordsFromMouseCoords(0, 0);
    var B = getTileCoordsFromMouseCoords(width - 1, height - 1);
    return getRange(A[0], A[1], B[0], B[1]);
}

function getWidth() {
    var A = getTileCoordsFromMouseCoords(0, 0);
    var B = getTileCoordsFromMouseCoords(width - 1, 0);
    return B[0] - A[0] + 1;
}

function getHeight() {
    var A = getTileCoordsFromMouseCoords(0, 0);
    var B = getTileCoordsFromMouseCoords(0, height - 1);
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

var waitTimeout = 33;
var lastRender = 0;
$(document).on("mousemove", function(e) {
    var coords = getTileCoordsFromMouseCoords(e.pageX, e.pageY)
    currentPosition = coords;
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
        linkElm.style.top = "-100px";
        linkElm.style.left = "-100px";
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
        getAndFetchTiles();
        fetchInterval = setInterval(function() {
            getAndFetchTiles();
        }, 300)
    }
}

// fetches only unloaded tiles
function getAndFetchTiles() {
    var data = getVisibleTiles();
    
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
    var width = getWidth();
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

function highlight(tileX, tileY, charX, charY) {
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

var flashAnimateInterval = setInterval(function() {
    for(var tile in highlightFlash) {
        for(var charY in highlightFlash[tile]) {
            for(var charX in highlightFlash[tile][charY]) {
                var data = highlightFlash[tile][charY][charX];
                var time = data[0];
                if(Date.now() - time >= 500) {
                    delete highlightFlash[tile][charY][charX]
                    inkLimit--;
                } else {
                    highlightFlash[tile][charY][charX][1] += 2;
                    if(highlightFlash[tile][charY][charX][1] >= 255) {
                        highlightFlash[tile][charY][charX][1] = 255;
                    }
                }
                delete tilePixelCache[tile];
                var pos = getPos(tile);
                renderTile(pos[0], pos[1]);
            }
        }
    }
})

function blankTile() {
    return {
        content: blank,
        properties: {
            cell_props: {},
            writability: null,
            color: blankColor()
        }
    };
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
    var highlight = highlightFlash[str];
    if(!highlight) highlight = {};

    for(var y = 0; y < 8; y++) {
        for(var x = 0; x < 16; x++) {
            // highlight flash animation
            if(highlight[y]) {
                if(highlight[y][x] !== void 0) {
                    textRender.fillStyle = "rgb(255, 255, " + highlight[y][x][1] + ")";
                    textRender.fillRect(x * 10, y * 18, 10, 18);
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
                    textRender.fillRect(x*10, y*18 + 9, 5, 18);
                } else if(char == "▐") {
                    textRender.fillRect(x*10 + 5, y*18 + 9, 5, 18);
                } else {
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
    var _this = {} // TEMPORARY
    menu.addOption("Change color", w.color);
    if (Permissions.can_go_to_coord(state.userModel, state.worldModel)) {
        menu.addOption("Go to coordinates", w.goToCoord);
    }
    if (Permissions.can_coordlink(state.userModel, state.worldModel)) {
        menu.addOption("Create link to coordinates", _this.coordLink);
    }
    if (Permissions.can_urllink(state.userModel, state.worldModel)) {
        menu.addOption("Create link to URL", _this.urlLink);
    }
    if (Permissions.can_admin(state.userModel, state.worldModel)) {
        menu.addOption("Make an area owner-only", function() {
            return _this.protectATile("owner-only");
        });
    }
    if (Permissions.can_protect_tiles(state.userModel, state.worldModel)) {
        menu.addOption("Make an area member-only", function() {
            return _this.protectATile("member-only");
        });
        menu.addOption("Make an area public", function() {
            return _this.protectATile("public");
        });
        return menu.addOption("Default area protection", _this.unprotectATile);
    }
}

document.onselectstart = function() {
    return w._state.uiModal;
}

var w = {
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
        return $(document).trigger("YWOT_GoToCoord_start");
    },
    getCenterCoords: function() {
        return [-positionY / 144, -positionX / 160]
    }
}

w._state.goToCoord = {};
w._state.uiModal = false;

buildMenu();

$(document).bind("simplemodal_onopen", function() {
    return w._state.uiModal = true;
});
$(document).bind("simplemodal_onclose", function() {
    return w._state.uiModal = false;
});

var ws_functions = {
    fetch: function(data) {
        for(var i in data.tiles) {
            tiles[i] = data.tiles[i];
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

    }
};