module.exports = {};

module.exports.POST = async function(req, serve, vars, params) {
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    var tile_signal_update = vars.tile_signal_update;

    var world = await world_get_or_create(post_data.world);
    if(!world) {
        return serve(null, 404);
    }

    var can_read = await can_view_world(world, user);
    if(!can_read) {
        return serve(null, 403)
    }

    var protect_type = void 0;
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

    var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
        [world.id, post_data.tileY, post_data.tileX])

    var writability = null;
    if(tile) {
        writability = tile.writability;
    } else {
        writability = world.writability;
    }

    var can_owner = can_read.owner;
    var can_member = can_owner || (can_read.member &&
        world.feature_membertiles_addremove && writability < 2);

    if(!(can_owner || can_member)) {
        return serve("No permission")
    }

    if(protect_type == 2 && can_owner) { // only owner can make owner-only tiles
        writability = 2; // owner-only tile;
    }

    // only owners/members can make member-only tiles. members cannot overwrite
    // owner-only tiles
    if(protect_type == 1 && can_member) {
        writability = 1;
    }

    // only owners/members can make public tiles. members cannot overwrite owner-tiles
    if(protect_type == 0 && can_member) {
        writability = 0;
    }

    if(protect_type == null && can_member) {
        writability = null;
    }
    var content = " ".repeat();
    var properties = "{}";
    if(tile) { // tile exists, update
        content = tile.content;
        properties = tile.properties;
        await db.run("UPDATE tile SET writability=? WHERE world_id=? AND tileY=? AND tileX=?",
            [writability, world.id, post_data.tileY, post_data.tileX])
    } else { // tile doesn't exist, insert
        var date = Date.now();
        await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, '{}', ?, ?)",
            [world.id, " ".repeat(128), post_data.tileY, post_data.tileX, writability, date])
    }

    tile_signal_update(world.name, post_data.tileX, post_data.tileY, content,
        JSON.parse(properties), protect_type)

    serve();
}