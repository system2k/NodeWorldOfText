module.exports = {};

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;

    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", post_data.namespace);
    if(!world) {
        return serve(null, 404);
    }

    if(world.owner_id != user.id) { // not an owner?
        return serve(null, 403);
    }

    var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
        [world.id, post_data.tileY, post_data.tileX])

    var properties = {}
    if(tile) {
        properties = JSON.parse(tile.properties);
    }
    properties.protected = true;

    if(tile) { // tile exists, update
        await db.run("UPDATE tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?",
            [JSON.stringify(properties), world.id, post_data.tileY, post_data.tileX])
    } else { // tile doesn't exist, insert
        var date = Date.now();
        await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)",
            [world.id, " ".repeat(128), post_data.tileY, post_data.tileX, JSON.stringify(properties), date])
    }

    serve();
}