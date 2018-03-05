module.exports = {};

module.exports.POST = async function(req, serve, vars, params) {
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    var tile_signal_update = vars.tile_signal_update;
    var san_nbr = vars.san_nbr;
    var encodeCharProt = vars.encodeCharProt;
    var decodeCharProt = vars.decodeCharProt;

    var world = await world_get_or_create(post_data.world);
    if(!world) {
        return serve(null, 404);
    }

    var can_read = await can_view_world(world, user);
    if(!can_read) {
        return serve(null, 403)
    }

    var protect_type = void 0;
    var char_pre = false; // char precision?
    if(post_data.type == "owner-only") {
        protect_type = 2;
    }
    if(post_data.type == "member-only") {
        protect_type = 1;
    }
    if(post_data.type == "public") {
        protect_type = 0;
    }
    if(protect_type == void 0 && !params.unprotect) {
        return serve("Invalid type")
    }
    if(params.unprotect) {
        protect_type = null;
    }
    if(params.char) {
        char_pre = true;
    }
    
    var tileX = san_nbr(post_data.tileX);
    var tileY = san_nbr(post_data.tileY);
    var charX = san_nbr(post_data.charX);
    var charY = san_nbr(post_data.charY);
    if(charX < 0 || charX >= 16) charX = 0;
    if(charY < 0 || charY >= 8) charY = 0;

    var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
        [world.id, tileY, tileX])

    var properties = {};
    if(tile) {
        properties = JSON.parse(tile.properties)
    }
    var charProt = new Array(128).fill(null);
    if(properties.char) {
        charProt = decodeCharProt(properties.char);
    }

    var writability = null; // current writability of the target (tile or char)
    if(tile) {
        if(char_pre) {
            var code = charProt[charY * 16 + charX];
            if(code == null) {
                writability = tile.writability
                if(writability == null) {
                    writability = world.writability;
                }
            } else {
                writability = code;
            }
        } else {
            writability = tile.writability;
        }
    } else {
        writability = world.writability;
    }
    // this 'writability' variable cannot be null, only 0-2

    var can_owner = can_read.owner;
    var can_member = can_owner || (can_read.member &&
        world.feature_membertiles_addremove && writability < 2);

    if(!(can_owner || can_member)) {
        return serve("No permission")
    }

    var new_writability;
    if(char_pre) {
        new_writability = tile ? tile.writability : null;
    } else {
        if(can_owner) {
            new_writability = protect_type;
        } else if(can_member && protect_type < 2) {
            new_writability = protect_type;
        } else {
            new_writability = tile ? tile.writability : null;
        }
    }

    if(char_pre) {
        var idx = charY * 16 + charX;
        var char_writability = charProt[idx];
        if(char_writability == null) char_writability = writability;

        var char_can_member = can_owner || (can_member && char_writability != 2);

        if(protect_type == 2 && can_owner) {
            charProt[idx] = 2;
        }
        if(protect_type == 1 && char_can_member) {
            charProt[idx] = 1;
        }
        if(protect_type == 0 && char_can_member) {
            charProt[idx] = 0;
        }
        if(protect_type == null && char_can_member) {
            charProt[idx] = null;
        }
    } else {
        for(var i = 0; i < 128; i++) {
            var char_writability = charProt[i];
            if(char_writability == null) char_writability = writability;

            var char_can_member = can_owner || (can_member && char_writability != 2);

            if(protect_type == 2 && can_owner) {
                charProt[i] = 2;
            }
            if(protect_type == 1 && char_can_member) {
                charProt[i] = 1;
            }
            if(protect_type == 0 && char_can_member) {
                charProt[i] = 0;
            }
            if(protect_type == null && char_can_member) {
                charProt[i] = null;
            }
        }
    }
    
    // if entire array is the same, simplify it
    var mainWritability = -1;
    var consistent = true;
    for(var i = 0; i < 128; i++) {
        var writ = charProt[i];
        if(mainWritability == -1) {
            mainWritability = writ;
            continue;
        }
        if(mainWritability != writ) {
            consistent = false;
            break;
        };
    }
    if(consistent) {
        // don'y include null, because a protection will be cancelled out if the tile is full-null
        if(mainWritability != null) {
            new_writability = mainWritability;
        }
        delete properties.char;
    } else {
        properties.char = encodeCharProt(charProt);
    }

    await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)",
        [user.id, world.id, tileY, tileX, Date.now(), "@" + JSON.stringify({
            kind: "protect",
            protect_type,
            char_pre,
            charX,
            charY
        })]);

    var content = " ".repeat(128);

    properties = JSON.stringify(properties);
    if(tile) { // tile exists, update
        content = tile.content;
        await db.run("UPDATE tile SET writability=?, properties=? WHERE world_id=? AND tileY=? AND tileX=?",
            [new_writability, properties, world.id, tileY, tileX])
    } else { // tile doesn't exist, insert
        var date = Date.now();
        await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?, ?)",
            [world.id, " ".repeat(128), tileY, tileX, properties, new_writability, date])
    }

    tile_signal_update(world.name, tileX, tileY, content,
        JSON.parse(properties), new_writability)

    serve();
}