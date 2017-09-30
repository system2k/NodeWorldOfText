module.exports = async function(data, vars) {
    var db = vars.db;
    var user = vars.user;
    var world = vars.world;
    var transaction = vars.transaction;
    var san_nbr = vars.san_nbr;
    var tile_coord = vars.tile_coord;

    var edits_limit = 1000;

    var is_owner = user.id == world.owner_id;
    if(!world.public_writable) {
        if(!(user.stats.owner || user.stats.member)) {
            // no permission to write anywhere?
            return "No permission to write"
        }
    }

    var edits = data.edits;
    var total_edits = 0;
    var tiles = {};
    // organize edits into tile coordinates
    for(var i = 0; i < edits.length; i++) {
        if (!tiles[edits[i][0] + "," + edits[i][1]]) {
            tiles[edits[i][0] + "," + edits[i][1]] = []
        }
        edits[i][5] = edits[i][5].replace(/\n/g, " ")
        edits[i][5] = edits[i][5].replace(/\r/g, " ")
        edits[i][5] = edits[i][5].replace(/\0/g, " ")
        tiles[edits[i][0] + "," + edits[i][1]].push(edits[i])
        total_edits++;
        if(total_edits >= edits_limit) { // edit limit reached
            break;
        }
    }

    var accepted = [];

    // begin writing the edits
    await transaction.begin();
    for(var i in tiles) {
        var tile_data = " ".repeat(128).split("");

        var properties = {
            color: Array(128).fill(0)
        };
        var date = Date.now();

        var pos = tile_coord(i)
        var tileY = san_nbr(pos[0]);
        var tileX = san_nbr(pos[1]);
        var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
            [world.id, tileY, tileX])

        var changes = tiles[i];
        if(tile) {
            var content = tile.content.split("");
            tile_data = content;
            properties = JSON.parse(tile.properties)
            if(properties.protected && !is_owner) {
                // tile is protected but user is not owner
                continue; // go to next tile
            }
        }
        accepted = accepted.concat(changes)
        for(var e = 0; e < changes.length; e++) {
            var charY = san_nbr(changes[e][2]);
            var charX = san_nbr(changes[e][3]);
            if(charX < 0) charX = 0;
            if(charX >= 16) charX = 16;
            if(charY < 0) charY = 0;
            if(charY >= 16) charY = 16;
            var char = changes[e][5];
            var color = san_nbr(changes[e][6]);
            if(typeof char !== "string") {
                char = "?";
            }
            if(color < 0) color = 0;
            if(color > 16777215) color = 16777215;
            var offset = charY * 16 + charX;
            tile_data[offset] = char;
            if(!properties.color) {
                properties.color = Array(128).fill(0)
            }
            properties.color[charY*16 + charX] = color;

            if(properties.cell_props) {
                if(properties.cell_props[charY]) {
                    if(properties.cell_props[charY][charX]) {
                        properties.cell_props[charY][charX] = {};
                    }
                }
            }
        }
        tile_data = tile_data.join("").slice(0, 128);
        if(tile) { // tile exists, update
            await db.run("UPDATE tile SET (content, properties)=(?, ?) WHERE world_id=? AND tileY=? AND tileX=?",
                [tile_data, JSON.stringify(properties), world.id, tileY, tileX])
        } else { // tile doesn't exist, insert
            await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)",
                [world.id, tile_data, tileY, tileX, JSON.stringify(properties), date])
        }
        await db.run("INSERT INTO edit VALUES(null, ?, null, ?, ?, ?, ?, ?)", // log the edit
            [user.id, world.id, tileY, tileX, date, JSON.stringify(changes)])
    }
    await transaction.end();

    return accepted;
}