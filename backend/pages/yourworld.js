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

async function world_get_or_create(name, serve, vars) {
    var db = vars.db;
    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", name);
    if(!world) { // world doesn't exist
        if(name.match(/^(\w*)$/g)) {
            var date = Date.now();
            await db.run("INSERT INTO world VALUES(null, ?, null, ?, ?, 1, 1, '{}')",
                [name, date, date])
            world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", name)
        } else { // special worlds (like: /beta/test) are not found and must not be created
            return serve("404. world not found")
        }
    }
    return world;
}

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var query_data = vars.query_data;
    var path = vars.path;
    var db = vars.db;

    var world = await world_get_or_create(path, serve, vars)
    if(!world) return;

    var world_properties = JSON.parse(world.properties)

    if(!world.public_readable) { // set to members/owners only
        //var whitelist = await db.get("SELECT * FROM whitelist WHERE world_id=? AND user_id=?")
        return serve("redirect to /accounts/private/")
    }

    if(query_data.fetch == 1) { // fetch request
        var min_tileY = parseInt(query_data.min_tileY)
        var min_tileX = parseInt(query_data.min_tileX)
        var max_tileY = parseInt(query_data.max_tileY)
        var max_tileX = parseInt(query_data.max_tileX)
        if(null_or_nan([min_tileY, min_tileX, max_tileY, max_tileX], 2)) {
            return serve("Invalid querydata.") // might need to return 400 bad request
        }
        if(!(min_tileY < max_tileY && min_tileX < max_tileX)) {
            return serve("Invalid range.")
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
        await db.each("SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", 
            [world.id, min_tileY, min_tileX, max_tileY, max_tileX], function(e, data) {
            tiles[data.tileY + "," + data.tileX] = {
                content: data.content,
                properties: JSON.parse(data.properties)
            }
        })
        serve(JSON.stringify(tiles))
    } else { // html page
        if(!world_properties.views) {
            world_properties.views = 0;
        }
        world_properties.views++;
        await db.run("UPDATE world SET properties=? WHERE id=?", [JSON.stringify(world_properties), world.id])

        var state = {
            canWrite: true,
            canAdmin: false,
            worldName: "name",
            features: {
                coordLink: false,
                urlLink: false,
                go_to_coord: false
            }
        }
        if(req.headers["user-agent"].indexOf("MSIE") >= 0) {
            state.announce = "Sorry, your World of Text doesn't work well with Internet Explorer."
        }
        var data = {
            urlhome: "/home/",
            state: JSON.stringify(state)
        }
        serve(template_data["yourworld.html"](data))
    }
}

module.exports.POST = async function(req, serve, vars) {
    var cookies = vars.cookies;
    var path = vars.path;
    var db = vars.db;
    var post_data = vars.post_data;

    var world = await world_get_or_create(path, serve, vars)
    if(!world) return;

    var edits = JSON.parse(post_data.edits);
    var tiles = {};
    // organize edits into tile coordinates
    for(var i = 0; i < edits.length; i++) {
        if (!tiles[edits[i][0] + "," + edits[i][1]]) {
            tiles[edits[i][0] + "," + edits[i][1]] = []
        }
        if (edits[i][5] == "\n" || edits[i][5] == "\r") edits[i][5] = " ";
        tiles[edits[i][0] + "," + edits[i][1]].push(edits[i])
    }

    // begin writing the edits
    for(var i in tiles) {
        var tile_data = " ".repeat(128).split("");

        var properties = {
            color: Array(128).fill(0)
        };

        var pos = tile_coord(i)
        var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
            [world.id, pos[0], pos[1]])
        if(tile) {
            var content = tile.content.split("");
            tile_data = content;
        }
        var changes = tiles[i];
        for(var e = 0; e < changes.length; e++) {
            var charY = changes[e][2];
            var charX = changes[e][3];
            var char = changes[e][5];
            var offset = charY * 16 + charX;
            tile_data[offset] = char;
        }
        tile_data = tile_data.join("").slice(0, 128);
        if(tile) { // tile exists, update
            db.run("UPDATE tile SET content=? WHERE world_id=? AND tileY=? AND tileX=?",
                [tile_data, world.id, pos[0], pos[1]])
        } else { // tile doesn't exist, insert
            db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)",
                [world.id, tile_data, pos[0], pos[1], JSON.stringify(properties), Date.now()])
        }
    }

    serve("This is only a test.")
}