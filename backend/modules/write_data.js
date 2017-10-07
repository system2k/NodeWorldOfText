function insert_char_at_index(string, char, index) {
    string = string.split("");
    char = char.split("");
    for(var i = 0; i < char.length; i++) {
        string[index + i] = char[i];
    }
    string = string.join("");
    string = string.slice(0, 128);
    var diff_len = 128 - string.length;
    string = " ".repeat(diff_len) + string;
    return string;
}

function sanitize_color(col) {
    if(!col) col = 0;
    col = parseInt(col);
    if(!col) col = 0;
    if(col < 0) col = 0;
    if(col > 16777215) col = 16777215;
    return col;
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
        edits[i][5] = edits[i][5].replace(/\0/g, " ")
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
                    properties.color[s] = color[color_index];
                    color_index++;
                }
            } else {
                properties.color[charY*16 + charX] = color;
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