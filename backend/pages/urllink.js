// includes support for coord links
module.exports.POST = async function(req, serve, vars, params) {
    var user = vars.user;
    var post_data = vars.post_data;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    var modules = vars.modules;

    var world = await world_get_or_create(post_data.world);
    if(!world) {
        return serve(null, 404);
    }

    var can_read = await can_view_world(world, user);
    if(!can_read) {
        return serve(null, 403)
    }

    vars.world = world;
    vars.user.stats = can_read;

    var type = "url";
    if(params.coordlink) {
        type = "coord";
    } 

    var do_link = await modules.write_links({
        type: type,
        tileX: post_data.tileX,
        tileY: post_data.tileY,
        charX: post_data.charX,
        charY: post_data.charY,
        url: post_data.url,
        link_tileX: post_data.link_tileX,
        link_tileY: post_data.link_tileY
    }, vars);

    if(do_link[0]) {
        var msg = do_link[1];
        if(msg == "PERM") {
            return serve("No permission", 403);
        } else if(msg == "PARAM") {
            return serve("Invalid parameters", 400);
        } else {
            return serve("Undefined error", 400);
        }
    } else {
        serve(null, null, {
            mime: "text/html; charset=utf-8"
        });
    }
}