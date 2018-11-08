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

function checkJSLinks(prop_reference) {
    if(!prop_reference.cell_props) return;
    var cell_props = prop_reference.cell_props;
    for(var y in cell_props) {
        var row = cell_props[y];
        for(var x in row) {
            var cell = row[x];
            if(!cell.link) continue;
            var link = cell.link;
            if(link.type != "url") continue;
            if(!link.url) continue;
            var protocol = url.parse(link.url).protocol;
            if(protocol == "javascript:") {
                link.js = true;
            }
        }
    }
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
    for(var i = 0; i < len; i++) {
        var rect = data.fetchRectangles[i];
        var minY = san_nbr(rect.minY)
        var minX = san_nbr(rect.minX)
        var maxY = san_nbr(rect.maxY)
        var maxX = san_nbr(rect.maxX)

        if(!(minY <= maxY && minX <= maxX)) {
            return "Invalid range"
        }
        if(!((maxY - minY) * (maxX - minX) <= 2000)) {
            return "Too many tiles"
        }
        var YTileRange = xrange(minY, maxY + 1);
        var XTileRange = xrange(minX, maxX + 1);
        for (var ty in YTileRange) { // fill in null values
            for (var tx in XTileRange) {
                tiles[YTileRange[ty] + "," + XTileRange[tx]] = null
            }
        }
        if(timemachine.active) {
            var dr1 = await db.get("select time from edit where world_id=? limit 1",
                world.id);
            var dr2 = await db.get("select time from edit where world_id=? order by id desc limit 1",
                world.id);
            var editCount = await db.get("SELECT count(*) as CNT FROM edit WHERE world_id=?", world.id);
            editCount = editCount.CNT;
            if((!dr1 || !dr2) || editCount >= editLimit) {
                // diagonal text...
                var e_str = "Cannot view timemachine: There are no edits yet. | ";
                if(editCount >= editLimit) {
                    e_str = "There are too many edits in this world. | ";
                }
                for (var ty in YTileRange) { // fill in null values
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
                time = Math.floor(div * timemachine.time) + dr1
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
            })

            for(var z in tiles) {
                if(tiles[z]) {
                    if(typeof tiles[z].content == "object") tiles[z].content = tiles[z].content.join("");
                }
            }
        } else {
            await db.each("SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", 
                [world.id, minY, minX, maxY, maxX], function(data) {
                var properties = JSON.parse(data.properties);
                checkJSLinks(properties);
                tiles[data.tileY + "," + data.tileX] = {
                    content: data.content,
                    properties: Object.assign(properties, {
                        writability: data.writability
                    })
                }
            })
        }
    }

    return tiles;
}