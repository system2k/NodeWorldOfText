// split a string properly with characters containing surrogates and combining characters
function advancedSplit(str) {
	str += "";
	var data = str.match(/([\uD800-\uDBFF][\uDC00-\uDFFF])|(([\0-\u02FF\u0370-\u1DBF\u1E00-\u20CF\u2100-\uD7FF\uDC00-\uFE1F\uFE30-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF])([\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+))|.|\n|\r/g)
	if(data == null) return [];
	return data;
}

function insert_char_at_index(string, char, index) {
    if(!string) string = "";
    if(!char) char = "";
    string = advancedSplit(string);
    char = advancedSplit(char);
    for(var i = 0; i < char.length; i++) {
        if(char[i] !== "\0") {
            string[index + i] = char[i];
        }
    }
    string = string.slice(0, 128);
    string = string.join("");
    return string;
}

function sanitize_color(col) {
    if(!col) col = 0;
    col = parseInt(col);
    if(!col) col = 0;
    if(col == -1) return -1; // skips the colors if -1
    col = Math.floor(col);
    if(col < 0) col = 0;
    if(col > 16777215) col = 16777215;
    return col;
}

in_queue = [];
function is_queueing(tileX, tileY, worldID) {
    for(var i = 0; i < in_queue.length; i++) {
        if(in_queue[i][0] == tileX && in_queue[i][1] == tileY && in_queue[i][2] == worldID) {
            return true;
        }
    }
    return false;
}
is_waiting = []; // functions
function wait_queue(tileX, tileY, worldID) {
    return new Promise(function(resolve) {
        is_waiting.push([tileX, tileY, worldID, function() {
            resolve();
        }])
    })
}

function rem_queue(tileX, tileY, worldID) {
    for(var i = 0; i < in_queue.length; i++) {
        if(in_queue[i][0] == tileX && in_queue[i][1] == tileY && in_queue[i][2] == worldID) {
            in_queue.splice(i, 1);
            break;
        }
    }
}

function resolve_queue(tileX, tileY, worldID) {
    for(var i = 0; i < is_waiting.length; i++) {
        if(is_waiting[i][0] == tileX && is_waiting[i][1] == tileY && is_waiting[i][2] == worldID) {
            var back_function = is_waiting[i][3] // we have to delete the element first, and then call the function
            is_waiting.splice(i, 1);
            back_function();
            break;
        }
    }
}

module.exports = async function(data, vars) {
    var db = vars.db;
    var user = vars.user;
    var world = vars.world;
    var transaction = vars.transaction;
    var san_nbr = vars.san_nbr;
    var tile_coord = vars.tile_coord;
    var broadcast = vars.broadcast;
    var channel = vars.channel;

    var edits_limit = 1280;

    var is_owner = user.id == world.owner_id;
    var is_member = user.stats.member;

     // can write on default tiles (with no protection) AKA writability==null?
    var can_write = user.stats.can_write;

    var edits = data.edits;
    var total_edits = 0;
    var tiles = {};
    // organize edits into tile coordinates
    for(var i = 0; i < edits.length; i++) {
        total_edits++;
        if(typeof edits[i][5] != "string") {
            continue;
        }
        if (!tiles[edits[i][0] + "," + edits[i][1]]) {
            tiles[edits[i][0] + "," + edits[i][1]] = []
        }
        edits[i][5] = edits[i][5].replace(/\n/g, " ")
        edits[i][5] = edits[i][5].replace(/\r/g, " ")
        tiles[edits[i][0] + "," + edits[i][1]].push(edits[i])
        if(total_edits >= edits_limit) { // edit limit reached
            break;
        }
    }

    var accepted = [];
    var rejected = {};
    var upd_tiles = {};

    function rej_edits(edits) {
        for(var i = 0; i < edits.length; i++) {
            rejected[edits[i][6]] = "NO_TILE_PERM"
        }
    }

    // begin writing the edits
    await transaction.begin();
    for(var i in tiles) {
        var tile_data = " ".repeat(128);

        var properties = {
            color: Array(128).fill(0)
        };
        var writability = null;
        var date = Date.now();

        var pos = tile_coord(i)
        var tileY = san_nbr(pos[0]);
        var tileX = san_nbr(pos[1]);

        if(is_queueing(tileX, tileY, world.id)) {
            await wait_queue(tileX, tileY, world.id); // wait for previous tile to finish
        }
        in_queue.push([tileX, tileY, world.id]);

        var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
            [world.id, tileY, tileX])

        var changes = tiles[i];
        if(tile) {
            var content = tile.content;
            tile_data = content;
            properties = JSON.parse(tile.properties)
            writability = tile.writability;
        } else {
            writability = world.writability;
        }
        // tile is owner-only, but user is not owner
        if(writability == 2 && !is_owner) {
            rej_edits(changes)
            continue; // next tile
        }

        // tile is member-only, but user is not member (nor owner)
        if(writability == 1 && !is_owner && !is_member) {
            rej_edits(changes)
            continue;
        }

        // this tile has no protection settings, and this user has no write perms
        if(writability == null && !can_write) {
            rej_edits(changes)
            continue;
        }
        for(var e = 0; e < changes.length; e++) {
            var charY = san_nbr(changes[e][2]);
            var charX = san_nbr(changes[e][3]);
            if(charX < 0) charX = 0;
            if(charX >= 16) charX = 16;
            if(charY < 0) charY = 0;
            if(charY >= 8) charY = 8;
            var char = changes[e][5];
            accepted.push(changes[e][6]);
            var color = changes[e][7];
            if(Array.isArray(color)) {
                color = color.slice(0, 128);
                for(var g = 0; g < color.length; g++) {
                    color[g] = sanitize_color(color[g]);
                }
            } else {
                color = sanitize_color(color);
            }
            if(typeof char !== "string") {
                char = "?";
            }
            var offset = charY * 16 + charX;
            tile_data = insert_char_at_index(tile_data, char, offset);
            if(!properties.color) {
                properties.color = Array(128).fill(0)
            }
            if(Array.isArray(color)) {
                var color_index = 0;
                for(var s = charY*16 + charX; s < 128; s++) {
                    if(color[color_index] !== -1) {
                        properties.color[s] = color[color_index];
                    }
                    color_index++;
                }
            } else {
                if(color !== -1) {
                    properties.color[charY*16 + charX] = color;
                }
            }

            if(properties.cell_props) {
                if(properties.cell_props[charY]) {
                    if(properties.cell_props[charY][charX]) {
                        properties.cell_props[charY][charX] = {};
                    }
                }
            }
        }
        if(tile) { // tile exists, update
            await db.run("UPDATE tile SET (content, properties)=(?, ?) WHERE world_id=? AND tileY=? AND tileX=?",
                [tile_data, JSON.stringify(properties), world.id, tileY, tileX])
        } else { // tile doesn't exist, insert
            await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
                [world.id, tile_data, tileY, tileX, JSON.stringify(properties), date])
        }
        await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)", // log the edit
            [user.id, world.id, tileY, tileX, date, JSON.stringify(changes)])
        upd_tiles[tileY + "," + tileX] = {
            content: tile_data,
            properties: Object.assign(properties, {
                writability
            })
        }
        resolve_queue(tileX, tileY, world.id);
        rem_queue(tileX, tileY, world.id);
    }
    await transaction.end();

    if(Object.keys(upd_tiles).length > 0) {
        broadcast({
            channel,
            kind: "tileUpdate",
            source: "write",
            tiles: upd_tiles
        }, world.name)
    }

    return { accepted, rejected };
}