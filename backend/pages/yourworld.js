module.exports = {};

/*
    is any variable null/nan?
    [vars]:
        list of variables
    [types]: (optional)
        0: check for null
        1: check for NaN
        2: check for null and NaN
*/
function null_or_nan(vars, types) {
    if(!types) types = 0;
    for(var i = 0; i < vars.length; i++) {
        if((vars[i] == null && types == 0) ||
           (isNaN(vars[i]) && types == 1) ||
           (vars[i] == null || isNaN(vars[i]) && types == 2)) {
            return true;
        }
    }
    return false;
}

// from: http://stackoverflow.com/questions/8273047/javascript-function-similar-to-python-range
function xrange(start, stop, step) {
    if (typeof stop == 'undefined') {
        stop = start;
        start = 0;
    }
    if (typeof step == 'undefined') {
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
        return [];
    }
    var result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
        result.push(i);
    }
    return result;
};

function tile_coord(coord) {
    coord = coord.split(",")
    return [parseInt(coord[0]), parseInt(coord[1])];
}

async function world_get_or_create(name, req, serve, vars) {
    var db = vars.db;
    var dispage = vars.dispage;

    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", name);
    if(!world) { // world doesn't exist
        if(name.match(/^(\w*)$/g)) {
            var date = Date.now();
            await db.run("INSERT INTO world VALUES(null, ?, null, ?, ?, 1, 1, '{}')",
                [name, date, date])
            world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", name)
        } else { // special worlds (like: /beta/test) are not found and must not be created
            return await dispage("404", null, req, serve, vars)
        }
    }
    return world;
}

async function can_view_world(world, user, db) {
    var permissions = {
        member: false,
        owner: false
    };
    var whitelist = await db.get("SELECT * FROM whitelist WHERE world_id=? AND user_id=?",
        [world.id, user.id])
    if(!world.public_readable && world.owner_id != user.id) { // is it set to members/owners only?
        if(!whitelist) { // not a member (nor owner)
            return false;
        } else {
            permissions.member = true;
        }
    }
    if(world.owner_id == user.id) {
        permissions.owner = true;
    }
    permissions.member = !!whitelist;
    return permissions;
}

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var query_data = vars.query_data;
    var path = vars.path;
    var db = vars.db;
    var redirect = vars.redirect;
    var user = vars.user;

    var world_name = path;
    if(params.timemachine) {
        world_name = params.world;
    }

    var world = await world_get_or_create(world_name, req, serve, vars)
    if(!world) return;

    var world_properties = JSON.parse(world.properties)

    var read_permission = await can_view_world(world, user, db);
    if(!read_permission) {
        return redirect("/accounts/private/")
    }

    if(query_data.fetch == 1) { // fetch request
        var min_tileY = parseInt(query_data.min_tileY)
        var min_tileX = parseInt(query_data.min_tileX)
        var max_tileY = parseInt(query_data.max_tileY)
        var max_tileX = parseInt(query_data.max_tileX)
        if(null_or_nan([min_tileY, min_tileX, max_tileY, max_tileX], 2)) {
            return serve("Invalid querydata")
        }
        if(!(min_tileY < max_tileY && min_tileX < max_tileX)) {
            return serve("Invalid range")
        }
        if(!((max_tileY - min_tileY) * (max_tileX - min_tileX) <= 400)) {
            return serve("Too many tiles")
        }
        var YTileRange = xrange(min_tileY, max_tileY + 1);
        var XTileRange = xrange(min_tileX, max_tileX + 1);
        var tiles = {};
        for (var ty in YTileRange) { // fill in null values
            for (var tx in XTileRange) {
                tiles[YTileRange[ty] + "," + XTileRange[tx]] = null
            }
        }
        if(params.timemachine) {
            var dr1 = await db.get("select time from edit where world_id=? limit 1",
                world.id);
            var dr2 = await db.get("select time from edit where world_id=? order by id desc limit 1",
                world.id);

            if(!dr1 || !dr2) {
                // diagonal text...
                var e_str = "Cannot view timemachine: There are no edits yet. | ";
                for (var ty in YTileRange) { // fill in null values
                    for (var tx in XTileRange) {
                        var str = "";
                        for(var y = 0; y < 8; y++) {
                            for(var x = 0; x < 16; x++) {
                                var posX = tx*16 + x;
                                var posY = ty*8 + y;
                                var ind = posX + posY;
                                var len = e_str.length;
                                var charPos = ind - Math.floor(ind / len) * len
                                str += e_str.charAt(charPos);
                            }
                        }
                        tiles[YTileRange[ty] + "," + XTileRange[tx]] = {
                            content: str,
                            properties: {}
                        };
                    }
                }
                return serve(JSON.stringify(tiles));
            }

            dr1 = dr1.time;
            dr2 = dr2.time;

            var time = params.time;
            if(!time) {
                time = Date.now();
            } else {
                var range = dr2 - dr1;
                var div = range / 1000000;
                time = Math.floor(div * params.time) + dr1
            }

            await db.each("SELECT * FROM edit WHERE world_id=? AND time<=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?",
                [world.id, time, min_tileY, min_tileX, max_tileY, max_tileX], function(e, data) {
                var con = JSON.parse(data.content);
                for(var i in con) {
                    var z = con[i]
                    if(!tiles[z[0] + "," + z[1]]) {
                        tiles[z[0] + "," + z[1]] = {
                            content: " ".repeat(128).split(""),
                            properties: {}
                        };
                    };
                    tiles[z[0] + "," + z[1]].content[z[2]*16+z[3]] = z[5]
                }
            })

            for(var i in tiles) {
                if(tiles[i]) {
                    tiles[i].content = tiles[i].content.join("");
                }
            }
        } else {
            await db.each("SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", 
                [world.id, min_tileY, min_tileX, max_tileY, max_tileX], function(e, data) {
                tiles[data.tileY + "," + data.tileX] = {
                    content: data.content,
                    properties: JSON.parse(data.properties)
                }
            })
        }
        serve(JSON.stringify(tiles))
    } else { // html page
        if(!world_properties.views) {
            world_properties.views = 0;
        }
        world_properties.views++;
        await db.run("UPDATE world SET properties=? WHERE id=?", [JSON.stringify(world_properties), world.id])

        var canWrite = !!world.public_writable;
        var canAdmin = false;
        var coordLink = false;
        var urlLink = false;
        var go_to_coord = false;
        if(world_properties.features) {
            if(world_properties.features.coordLink) {
                coordLink = true;
            }
            if(world_properties.features.go_to_coord) {
                go_to_coord = true;
            }
            if(world_properties.features.urlLink) {
                urlLink = true;
            }
        }
        if(read_permission.member) {
            canWrite = true;
            coordLink = true;
            urlLink = true;
            go_to_coord = true;
        }

        if(read_permission.owner) {
            canWrite = true;
            canAdmin = true;
            coordLink = true;
            urlLink = true;
            go_to_coord = true;
        }

        var state = {
            canWrite: canWrite,
            canAdmin: canAdmin,
            worldName: world.name,
            features: {
                coordLink: coordLink,
                urlLink: urlLink,
                go_to_coord: go_to_coord
            }
        }
        if(req.headers["user-agent"].indexOf("MSIE") >= 0) {
            state.announce = "Sorry, your World of Text doesn't work well with Internet Explorer."
        }
        var css_timemachine = "";
        if(params.timemachine) {
            css_timemachine = "<style>.tilecont {position: absolute;background-color: #ddd;}</style>";
            state.canWrite = false;
        }
        var data = {
            state: JSON.stringify(state),
            css_timemachine
        }
        serve(template_data["yourworld.html"](data))
    }
}

module.exports.POST = async function(req, serve, vars) {
    var cookies = vars.cookies;
    var path = vars.path;
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;

    var edits_limit = 1000;

    var world = await world_get_or_create(path, req, serve, vars)
    if(!world) return;

    var read_permission = await can_view_world(world, user, db);
    if(!read_permission) {
        // no permission to view world?
        return serve(null, 403);
    }
    var is_owner = user.id == world.owner_id;
    if(!world.public_writable) {
        if(!(read_permission.owner || read_permission.member)) {
            // no permission to write anywhere?
            return serve(null, 403)
        }
    }

    var edits = JSON.parse(post_data.edits);
    var total_edits = 0;
    var tiles = {};
    // organize edits into tile coordinates
    for(var i = 0; i < edits.length; i++) {
        if (!tiles[edits[i][0] + "," + edits[i][1]]) {
            tiles[edits[i][0] + "," + edits[i][1]] = []
        }
        if (edits[i][5] == "\n" || edits[i][5] == "\r") edits[i][5] = " ";
        tiles[edits[i][0] + "," + edits[i][1]].push(edits[i])
        total_edits++;
        if(total_edits >= edits_limit) { // edit limit reached
            break;
        }
    }

    var accepted = [];

    // begin writing the edits
    await db.run("BEGIN TRANSACTION")
    for(var i in tiles) {
        var tile_data = " ".repeat(128).split("");

        var properties = {
            color: Array(128).fill(0)
        };
        var date = Date.now();

        var pos = tile_coord(i)
        var tileY = pos[0];
        var tileX = pos[1];
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
            var charY = Math.floor(changes[e][2]);
            var charX = Math.floor(changes[e][3]);
            var char = changes[e][5];
            var color = Math.floor(changes[e][6]);
            if(typeof char !== "string") {
                char = "?";
            }
            if(!color) {
                color = 0;
            }
            if(color < 0) color = 0;
            if(color > 16777215) color = 16777215;
            var offset = charY * 16 + charX;
            tile_data[offset] = char;
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
    await db.run("COMMIT")

    serve(JSON.stringify(accepted))
}