var url = require("url");

function generateDiag(text, tileX, tileY) {
    var str = "";
    for(var y = 0; y < 8; y++) {
        for(var x = 0; x < 16; x++) {
            var posX = tileX * 16 + x;
            var posY = tileY * 8 + y;
            var ind = posX + posY;
            var len = text.length;
            var charPos = ind - Math.floor(ind / len) * len
            str += text.charAt(charPos);
        }
    }
    return {
        content: str,
        properties: {
            writability: 2
        }
    };
}

var surrogateRegexStr = "([\\uD800-\\uDBFF][\\uDC00-\\uDFFF])";
var surrogateRegex = new RegExp(surrogateRegexStr, "g");
var combiningRegexStr = "(([\\0-\\u02FF\\u0370-\\u1DBF\\u1E00-\\u20CF\\u2100-\\uD7FF\\uDC00-\\uFE1F\\uFE30-\\uFFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[\\uD800-\\uDBFF])([\\u0300-\\u036F\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F]+))";
var combiningRegex = new RegExp(combiningRegexStr, "g");
var splitRegex = new RegExp(surrogateRegexStr + "|" + combiningRegexStr + "|.|\\n|\\r", "g");
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
        if(noSurrog && data[i].match(surrogateRegex)) {
            data[i] = "?";
        }
        if(noComb && data[i].match(combiningRegex)) {
            data[i] = data[i].charAt(0);
        }
    }
	return data;
}
function filterUTF16Static(str) {
    return advancedSplit(str, true, true).join("");
}

module.exports = async function(data, vars) {
    var db = vars.db;
    var user = vars.user;
    var san_nbr = vars.san_nbr;
    var xrange = vars.xrange;
    var world = vars.world;
    var timemachine = vars.timemachine;
    if(!timemachine) timemachine = {};

    var tiles = {};
    var editLimit = 100000; // don't overload server
    var fetchRectLimit = 40;

    var len = data.fetchRectangles.length
    if(len >= fetchRectLimit) len = fetchRectLimit;
    var utf16static = data.utf16static;
    for(var i = 0; i < len; i++) {
        var rect = data.fetchRectangles[i];
        var minY = san_nbr(rect.minY);
        var minX = san_nbr(rect.minX);
        var maxY = san_nbr(rect.maxY);
        var maxX = san_nbr(rect.maxX);

        if(!(minY <= maxY && minX <= maxX)) {
            return "Invalid range";
        }
        if(!((maxY - minY) * (maxX - minX) <= 2000)) {
            return "Too many tiles";
        }
        var YTileRange = xrange(minY, maxY + 1);
        var XTileRange = xrange(minX, maxX + 1);
        for (var ty in YTileRange) { // fill in null values
            for (var tx in XTileRange) {
                tiles[YTileRange[ty] + "," + XTileRange[tx]] = null;
            }
        }
        if(timemachine.active) {
            var dr1 = await db.get("SELECT time FROM edit WHERE world_id=? LIMIT 1",
                world.id);
            var dr2 = await db.get("SELECT time FROM edit WHERE world_id=? ORDER BY id DESC LIMIT 1",
                world.id);
            var editCount = await db.get("SELECT count(id) AS cnt FROM edit WHERE world_id=?", world.id);
            editCount = editCount.cnt;
            if((!dr1 || !dr2) || editCount >= editLimit) {
                // diagonal text...
                var e_str = "Cannot view timemachine: There are no edits yet. | ";
                if(editCount >= editLimit) {
                    e_str = "There are too many edits in this world. | ";
                }
                for (var ty in YTileRange) {
                    for (var tx in XTileRange) {
                        var tileX = XTileRange[tx];
                        var tileY = YTileRange[ty];
                        tiles[tileY + "," + tileX] = generateDiag(e_str, tileX, tileY);
                    }
                }
                continue;
            }

            dr1 = dr1.time;
            dr2 = dr2.time;

            var time = timemachine.time;
            if(!time) {
                time = Date.now();
            } else {
                var range = dr2 - dr1;
                var div = range / 1000000;
                time = Math.floor(div * timemachine.time) + dr1;
            }

            await db.each("SELECT * FROM edit WHERE world_id=? AND time <= ? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?",
                [world.id, time, minY, minX, maxY, maxX], function(data) {
                if(data.content.charAt(0) == "@") return;
                var con = JSON.parse(data.content);
                for(var q in con) {
                    var z = con[q]
                    if(!tiles[z[0] + "," + z[1]]) {
                        tiles[z[0] + "," + z[1]] = {
                            content: " ".repeat(128).split(""),
                            properties: {
                                writability: 2
                            }
                        };
                    };
                    var tile_r = tiles[z[0] + "," + z[1]];
                    var index_r = z[2]*16+z[3];
                    tile_r.content[index_r] = z[5]
                    var color = z[7];
                    if(!color) color = 0;
                    if(typeof color != "number") color = 0;
                    if(color) {
                        if(!tile_r.properties.color) {
                            tile_r.properties.color = new Array(128).fill(0);
                        }
                        tile_r.properties.color[index_r] = color;
                    }
                }
            });

            for(var z in tiles) {
                if(tiles[z]) {
                    if(typeof tiles[z].content == "object") tiles[z].content = tiles[z].content.join("");
                }
            }
        } else {
            await db.each("SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", 
                [world.id, minY, minX, maxY, maxX], function(data) {
                var properties = JSON.parse(data.properties);
                var content = data.content;
                if(utf16static) content = filterUTF16Static(content);
                tiles[data.tileY + "," + data.tileX] = {
                    content,
                    properties: Object.assign(properties, {
                        writability: data.writability
                    })
                };
            });
        }
    }

    return tiles;
}