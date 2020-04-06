function generateDiag(text, tileX, tileY) {
    var str = "";
    for(var y = 0; y < CONST.tileRows; y++) {
        for(var x = 0; x < CONST.tileCols; x++) {
            var posX = tileX * CONST.tileCols + x;
            var posY = tileY * CONST.tileRows + y;
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
var splitRegex = new RegExp(surrogateRegexStr + "|" + combiningRegexStr + "|.|\\n|\\r|\\u2028|\\u2029", "g");
function advancedSplitCli(str, noSurrog, noComb) {
    str += "";
    // look for surrogate pairs first. then look for combining characters. finally, look for the rest
    var data = str.match(splitRegex);
    if(data == null) return [];
    for(var i = 0; i < data.length; i++) {
        // contains surrogates without second character?
        if(data[i].match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g)) {
            data.splice(i, 1);
            i--;
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
function filterUTF16(str) {
    return advancedSplitCli(str, true, true).join("");
}

module.exports = async function(data, vars, evars) {
    var user = evars.user;
    var world = evars.world;
    var timemachine = evars.timemachine;

    var db = vars.db;
    var db_edits = vars.db_edits;
    var san_nbr = vars.san_nbr;
    var advancedSplit = vars.advancedSplit;
    var memTileCache = vars.memTileCache;
    var encodeCharProt = vars.encodeCharProt;
    var normalizeCacheTile = vars.normalizeCacheTile;
    if(!timemachine) timemachine = {};

    var tiles = {};
    var editLimit = 100000; // don't overload server
    var fetchRectLimit = 50;
    var totalAreaLimit = 5000;

    if(!Array.isArray(data.fetchRectangles)) return "Invalid parameters";
    var len = data.fetchRectangles.length;
    if(len >= fetchRectLimit) len = fetchRectLimit;
    var q_utf16 = data.utf16;
    var q_array = data.array;
    var q_content_only = data.content_only;
    var q_concat = data.concat; // only if content_only is enabled

    // if not null, return special value instead of object containing tiles
    var alt_return_obj = null;

    var total_area = 0;
    for(var v = 0; v < len; v++) {
        var rect = data.fetchRectangles[v];
        if(typeof rect != "object" || Array.isArray(rect) || rect == null) return "Invalid parameters";
        var minY = san_nbr(rect.minY);
        var minX = san_nbr(rect.minX);
        var maxY = san_nbr(rect.maxY);
        var maxX = san_nbr(rect.maxX);

        var tmp;
        if(minX > maxX) {
            tmp = minX;
            minX = maxX;
            maxX = tmp;
        }
        if(minY > maxY) {
            tmp = minY;
            minY = maxY;
            maxY = tmp;
        }
        
        var area = Math.abs(maxY - minY + 1) * Math.abs(maxX - minX + 1);
        if(area > 50 * 50) {
            return "Too many tiles";
        }

        total_area += area;

        if(total_area > totalAreaLimit) {
            return "Too many tiles";
        }

        rect.minY = minY;
        rect.minX = minX;
        rect.maxY = maxY;
        rect.maxX = maxX;
    }

    for(var i = 0; i < len; i++) {
        var rect = data.fetchRectangles[i];
        var minY = rect.minY;
        var minX = rect.minX;
        var maxY = rect.maxY;
        var maxX = rect.maxX;

        if(q_concat && q_content_only) {
            if(alt_return_obj === null) {
                alt_return_obj = "";
                if(q_array) alt_return_obj = [];
            }
        } else {
            for(var ty = minY; ty <= maxY; ty++) {
                for(var tx = minX; tx <= maxX; tx++) {
                    tiles[ty + "," + tx] = null;
                }
            }
        }

        if(timemachine.active) {
            var dr1 = await db_edits.get("SELECT time FROM edit WHERE world_id=? LIMIT 1",
                world.id);
            var dr2 = await db_edits.get("SELECT time FROM edit WHERE world_id=? ORDER BY rowid DESC LIMIT 1",
                world.id);
            var editCount = await db_edits.get("SELECT count(rowid) AS cnt FROM edit WHERE world_id=?", world.id);
            editCount = editCount.cnt;
            if((!dr1 || !dr2) || editCount >= editLimit) {
                // diagonal text
                var e_str = "Cannot view timemachine: There are no edits yet. | ";
                if(editCount >= editLimit) {
                    e_str = "There are too many edits in this world. | ";
                }
                for(var ty = minY; ty <= maxY; ty++) {
                    for(var tx = minX; tx <= maxX; tx++) {
                        tiles[ty + "," + tx] = generateDiag(e_str, tx, ty);
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

            await db_edits.each("SELECT * FROM edit WHERE world_id=? AND time <= ? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?",
                [world.id, time, minY, minX, maxY, maxX], function(data) {
                if(data.content.charAt(0) == "@") return;
                var con = JSON.parse(data.content);
                for(var q in con) {
                    var z = con[q]
                    if(!tiles[z[0] + "," + z[1]]) {
                        tiles[z[0] + "," + z[1]] = {
                            content: " ".repeat(CONST.tileArea).split(""),
                            properties: {
                                writability: 2
                            }
                        };
                    };
                    var tile_r = tiles[z[0] + "," + z[1]];
                    var index_r = z[2]*CONST.tileCols+z[3];
                    tile_r.content[index_r] = z[5]
                    var color = z[7];
                    if(!color) color = 0;
                    if(typeof color != "number") color = 0;
                    if(color) {
                        if(!tile_r.properties.color) {
                            tile_r.properties.color = new Array(CONST.tileArea).fill(0);
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
            var db_tiles = await db.all("SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?",
                [world.id, minY, minX, maxY, maxX]);
            for(var t in tiles) {
                if(tiles[t] == null) {
                    var pos = t.split(",");
                    var tileY = parseInt(pos[0]);
                    var tileX = parseInt(pos[1]);

                    if(memTileCache[world.id] && memTileCache[world.id][tileY] && memTileCache[world.id][tileY][tileX]) {
                        var memTile = memTileCache[world.id][tileY][tileX];
                        tiles[t] = normalizeCacheTile(memTile);
                    }
                }
            }
            for(var t = 0; t < db_tiles.length; t++) {
                var tdata = db_tiles[t];
                // tile writability is put in properties object
                var cachedTile = null;
                if(memTileCache[world.id] && memTileCache[world.id][tdata.tileY] && memTileCache[world.id][tdata.tileY][tdata.tileX]) {
                    var memTile = memTileCache[world.id][tdata.tileY][tdata.tileX];
                    cachedTile = normalizeCacheTile(memTile);
                }

                var properties;
                var content;
                if(cachedTile) {
                    properties = cachedTile.properties;
                    content = cachedTile.content;
                } else {
                    properties = JSON.parse(tdata.properties);
                    properties.writability = tdata.writability;
                    content = tdata.content;
                }

                if(q_utf16) content = filterUTF16(content);
                if(q_array) content = advancedSplitCli(content);
                if(q_concat && q_content_only) {
                    if(q_array) {
                        for(var p = 0; p < content.length; p++) {
                            alt_return_obj.push(content[p]);
                        }
                    } else {
                        alt_return_obj += content;
                    }
                } else {
                    var tileRes;
                    if(q_content_only) {
                        tileRes = content;
                    } else {
                        tileRes = {
                            content,
                            properties
                        };
                    }
                    tiles[tdata.tileY + "," + tdata.tileX] = tileRes;
                }
            }
        }
    }

    if(alt_return_obj !== null) {
        return {
            data: alt_return_obj
        };
    }
    return tiles;
}