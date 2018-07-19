module.exports = {};

var intv;
module.exports.startup_internal = function(vars) {
    intv = vars.intv;

    // wait at least 5 minutes and then allow user to download again
    intv.accountTimeCheck = setInterval(function() {
        var date = Date.now();
        for(var i in time_limits) {
            if(time_limits[i] + wait_ms >= date) {
                delete time_limits[i];
            }
        }
    }, 1000 * 30) // check every 30 seconds if the time is up
}

var wait_ms = 1000 * 60 * 5;
var time_limits = {};

module.exports.GET = async function(req, serve, vars) {
    var user = vars.user;
    var dispage = vars.dispage;
    var get_third = vars.get_third;
    var path = vars.path;
    var db = vars.db;
    var filename_sanitize = vars.filename_sanitize;
    var world_get_or_create = vars.world_get_or_create;

    var world_name = get_third(path, "accounts", "download")

    var world = await world_get_or_create(world_name)
    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    // not a superuser nor owner
    var is_owner = world.owner_id == user.id
    if(!(user.superuser || is_owner)) {
        return await dispage("404", null, req, serve, vars)
    }

    if(is_owner && !user.superuser) {
        if(time_limits[user.id]) {
            return serve("Wait about 5 minutes before downloading again.")
        } else {
            time_limits[user.id] = Date.now();
        }
    }

    var count = (await db.get("SELECT count(*) AS cnt FROM tile WHERE world_id=?", world.id)).cnt;
    if(count >= 2000) {
        return serve("World is too large to download, email OWOT");
    }

    var tiles = [];
    await db.each("SELECT * FROM tile WHERE world_id=?", world.id, function(data) {
        tiles.push({
            content: data.content,
            tileX: data.tileX,
            tileY: data.tileY,
            properties: data.properties,
            writability: data.writability,
            created_at: data.created_at
        })
    })

    serve(JSON.stringify(tiles), null, {
        mime: "application/force-download; charset=utf-8",
        download_file: filename_sanitize("World_" + world_name + ".txt")
    })
}