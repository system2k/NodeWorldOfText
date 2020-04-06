module.exports.GET = async function(req, serve, vars, evars) {
    var query_data = evars.query_data;
    var user = evars.user;

    var db = vars.db;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    
    var world = await world_get_or_create(query_data.world);
    if(!world) {
        return serve(null, 404);
    }
    var perm = await can_view_world(world, user);
    if(!perm) {
        return serve(null, 403);
    }

    var properties = JSON.parse(world.properties);

    var pathname = world.name;
    if(pathname != "") {
        pathname = "/" + pathname;
    }

    var props = {
        feature_membertiles_addremove: !!world.feature_membertiles_addremove,
        writability: world.writability,
        feature_url_link: world.feature_url_link,
        feature_go_to_coord: world.feature_go_to_coord,
        name: world.name,
        feature_paste: world.feature_paste,
        namespace: world.name.split("/")[0],
        readability: world.readability,
        feature_coord_link: world.feature_coord_link,
        pathname,
        chat_permission: properties.chat_permission ? properties.chat_permission : 0,
        color_text: properties.color_text ? properties.color_text : 0
    }

    serve(JSON.stringify(props), null, {
        mime: "application/json"
    });
}