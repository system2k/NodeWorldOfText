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
            state.announce = "Sorry, node World of Text doesn't work well with Internet Explorer."
        }
        var css_timemachine = "";
        if(params.timemachine) {
            css_timemachine = "<style>.tilecont {position: absolute;background-color: #ddd;}</style>";
            state.canWrite = false;
        }
        var data = {
            state: JSON.stringify(state),
            css_timemachine,
            user
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
    var is_owner = user.id == world.owner_id;
    if(!world.public_writable) {
        if(!(read_permission.owner || read_permission.member)) {
            // no permission to write anywhere?
            return serve(null, 403)
        }
    }

    vars.world = world;
    var do_write = await modules.write_data({
        edits: JSON.parse(post_data.edits)
    }, vars);

    serve(JSON.stringify(do_write))
}