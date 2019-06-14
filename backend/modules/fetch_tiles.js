var url = require("url");

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

module.exports = async function(data, vars) {
    var db = vars.db;
    var db_edits = vars.db_edits;
    var user = vars.user;
    var san_nbr = vars.san_nbr;
    var xrange = vars.xrange;
    var world = vars.world;
    var advancedSplit = vars.advancedSplit;
    var timemachine = vars.timemachine;
    var insert_char_at_index = vars.insert_char_at_index;
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

    var o_editlog = data.editlog;
    var o_editlog_start = data.editlog_start;

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
        } else if(o_editlog && user.superuser) {
            o_editlog_start = san_nbr(o_editlog_start);
            if(o_editlog_start < 0) o_editlog_start = 0;
            var tileX = rect.tileX;
            var tileY = rect.tileY;
            var chunkSize = 500;
            var chunkIdx = 0;
            while(true) {
                var hist = await db_edits.all("SELECT time, content FROM edit WHERE time <= ? AND world_id=? AND tileX=? AND tileY=? ORDER BY rowid DESC LIMIT ?,?",
                    [o_editlog_start, world.id, tileX, tileY, chunkIdx * chunkSize, chunkSize]);
                chunkIdx++;
                if(hist.length == 0) break;
                var fillData = " ".repeat(CONST.tileArea);
                var fillColor = new Uint32Array(CONST.tileArea);
                var fillTable = new Uint8Array(CONST.tileArea);
                var fillTableCount = 0;
                var brkWhileLoop = false;
                for(var i = 0; i < hist.length; i++) {
                    var row = hist[i];
                    var time = row.time;
                    var content = row.content;
                    if(content[0] == "@") {
                        content = JSON.parse(content.substr(1));
                        if(content.kind == "tile_clear") break;
                    } else {
                        content = JSON.parse(content);
                        var brkHist = false;
                        for(var e = 0; e < content.length; e++) {
                            var edit = content[e];

                            // input types
                            var charX = san_nbr(edit[3]);
                            var charY = san_nbr(edit[2]);
                            if(typeof edit[5] != "string") edit[5] = "";
                            var char = advancedSplit(edit[5]);
                            var color = san_nbr(edit[7]);

                            // input values
                            var area = charY * 16 + charX;
                            if(area < 0) area = 0;
                            if(area > 127) area = 127;
                            charX = area % 16;
                            charY = Math.floor(area / 16);
                            char = char[0];
                            if(!char) char = " ";
                            if(char == "\n" || char == "\r" || char == "\x1b") char = " ";
                            if(color < 0) color = 0;
                            if(color >= 16777216) color = 16777215;

                            // apply inputs
                            var pos = charY * 16 + charX;
                            if(!fillTable[pos]) {
                                fillTable[pos] = 1;
                                fillTableCount++;
                                fillColor[pos] = color;
                                fillData = insert_char_at_index(fillData, char, pos);
                            }

                            if(fillTableCount >= 128) {
                                brkHist = true;
                                break;
                            }
                        }
                        if(brkHist) {
                            brkWhileLoop = true;
                            break;
                        }
                    }
                    if(time >= o_editlog_start) {
                        brkWhileLoop = true;
                    }
                }
                if(brkWhileLoop) break;
                if(hist.length < chunkSize) break;
            }
            for(var i in tiles) {
                delete tiles[i];
            }
            tiles[tileY + "," + tileX] = {
                content: fillData,
                properties: {
                    color: Array.from(fillColor),
                    writability: 0
                }
            }
            break;
        } else {
            await db.each("SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", 
                [world.id, minY, minX, maxY, maxX], function(data) {
                var properties = JSON.parse(data.properties);
                var content = data.content;
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
                            properties: Object.assign(properties, {
                                writability: data.writability
                            })
                        };
                    }
                    tiles[data.tileY + "," + data.tileX] = tileRes;
                }
            });
        }
    }

    if(alt_return_obj !== null) return alt_return_obj;
    return tiles;
}