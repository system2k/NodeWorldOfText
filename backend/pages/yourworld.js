module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var query_data = vars.query_data;
    var path = vars.path;
    var db = vars.db;
    var redirect = vars.redirect;
    var user = vars.user;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    var modules = vars.modules;
    var announcement = vars.announcement();

    var world_name = path;
    if(params.timemachine) {
        world_name = params.world;
    }

    var world = await world_get_or_create(world_name, req, serve)
    if(!world) return;

    var world_properties = JSON.parse(world.properties)

    var read_permission = await can_view_world(world, user, db);
    if(!read_permission) {
        return redirect("/accounts/private/")
    }

    if(query_data.fetch == 1) { // fetch request
        vars.timemachine = { active: params.timemachine }
        vars.world = world;
        var tiles = await modules.fetch_tiles({
            fetchRectangles: [{
                minY: query_data.min_tileY,
                minX: query_data.min_tileX,
                maxY: query_data.max_tileY,
                maxX: query_data.max_tileX
            }]
        }, vars)
        serve(JSON.stringify(tiles))
    } else { // the HTML page
        if(!world_properties.views) {
            world_properties.views = 0;
        }
        world_properties.views++;
        await db.run("UPDATE world SET properties=? WHERE id=?",
            [JSON.stringify(world_properties), world.id])

        var state = {
            userModel: {
                username: user.username,
                is_superuser: user.superuser,
                authenticated: user.authenticated,
                is_member: read_permission.member,
                is_owner: read_permission.owner
            },
            worldModel: {
                feature_membertiles_addremove: !!world.feature_membertiles_addremove,
                writability: world.writability,
                feature_url_link: world.feature_url_link,
                path: world.name,
                feature_go_to_coord: world.feature_go_to_coord,
                name: world.name,
                feature_paste: world.feature_paste,
                namespace: world.name,
                readability: world.readability,
                feature_coord_link: world.feature_coord_link
            }
        }
        if(announcement) {
            state.announce = announcement;
        }
        if(params.timemachine) {
            state.worldModel.writability = 0;
        }
        var page_title = "Our World of Text";
        if(world.name) {
            page_title = "/" + world.name;
        }
        var data = {
            state: JSON.stringify(state),
            user,
            world,
            page_title
        }
        serve(template_data["yourworld.html"](data))
    }
}

module.exports.POST = async function(req, serve, vars) {
    var path = vars.path;
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;
    var modules = vars.modules;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;

    var world = await world_get_or_create(path, req, serve, vars)
    if(!world) return;

    var read_permission = await can_view_world(world, user, db);
    if(!read_permission) {
        // no permission to view world?
        return serve(null, 403);
    }

    vars.world = world;
    var edits_parsed;
    try {
        edits_parsed = JSON.parse(post_data.edits);
    } catch(e) {
        return serve(null, 418)
    }

    vars.user.stats = read_permission;
    var do_write = await modules.write_data({
        edits: edits_parsed
    }, vars);

    serve(JSON.stringify(do_write.accepted))
}