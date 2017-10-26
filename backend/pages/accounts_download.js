module.exports = {};

var wait_ms = 1000 * 60 * 5;
var time_limits = {};

// wait 5 minutes and then allow user to download again
setInterval(function() {
    var date = Date.now();
    for(var i in time_limits) {
        if(time_limits[i] + wait_ms >= date) {
            delete time_limits[i];
        }
    }
}, 1000 * 30)

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
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

    var tiles = [];
    await db.each("SELECT * FROM tile WHERE world_id=?", world.id, function(data) {
        tiles.push({
            content: data.content,
            tileX: data.tileX,
            tileY: data.tileY,
            properties: data.properties,
            created_at: data.created_at
        })
    })

    serve(JSON.stringify(tiles), null, {
        mime: "application/force-download; charset=utf-8",
        download_file: filename_sanitize("World_" + world_name + ".txt")
    })
}