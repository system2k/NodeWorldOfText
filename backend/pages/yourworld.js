var intv;
var handle_error;
var db;
var worldViews;
module.exports.startup_internal = function(vars) {
    intv = vars.intv;
    handle_error = vars.handle_error;
    db = vars.db;
    worldViews = vars.worldViews;

    // wait at least 5 minutes and then allow user to download again
    worldViewCommit();
}

module.exports.server_exit = async function() {
    await worldViewCommit(true);
}

async function worldViewCommit(no_interval) {
    try {
        for(var i in worldViews) {
            var world_id = parseInt(i);
    
            var world = await db.get("SELECT properties FROM world WHERE id=?", world_id);
            
            var props = JSON.parse(world.properties);

            if(!props.views) props.views = 0;
            props.views += worldViews[i];

            await db.run("UPDATE world SET properties=? WHERE id=?", [JSON.stringify(props), world_id]);

            delete worldViews[i];
        }
    } catch(e) {
        handle_error(e);
    }
    if(!no_interval) intv.worldViewCommitTimeout = setTimeout(worldViewCommit, 1000 * 5);
}

module.exports.GET = async function(req, serve, vars, params) {
    var query_data = vars.query_data;
    var path = vars.path;
    var db = vars.db;
    var redirect = vars.redirect;
    var user = vars.user;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    var modules = vars.modules;
    var announcement = vars.announcement();
    var HTML = vars.HTML;

    var world_name = path;
    if(params.timemachine) {
        world_name = params.world;
    }

    var world = await world_get_or_create(world_name);
    if(!world) return;

    var world_properties = JSON.parse(world.properties);

    var read_permission = await can_view_world(world, user, db);
    if(!read_permission) {
        return redirect("/accounts/private/");
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
        serve(JSON.stringify(tiles), null, {
            mime: "text/plain; charset=utf-8"
        })
    } else { // the HTML page
        if(!worldViews[world.id]) worldViews[world.id] = 0;
        worldViews[world.id]++;

        var pathname = world.name;
        if(pathname != "") {
            pathname = "/" + pathname;
        }
		if(params.timemachine) {
            pathname = "/" + path;
            if(pathname.charAt(pathname.length - 1) == "/") pathname = pathname.slice(0, -1);
        }
        var chat_permission = world_properties.chat_permission;
        if(!chat_permission) chat_permission = 0;
        var color_text = world_properties.color_text;
        if(!color_text) color_text = 0;
        var state = {
            userModel: {
                username: user.username,
                is_superuser: user.superuser, // Admin of OWOT?
                authenticated: user.authenticated,
                is_member: read_permission.member, // Member of world?
                is_owner: read_permission.owner, // Owner of world?
                is_staff: user.staff, // Staff of OWOT?
                is_operator: user.operator // Operator of OWOT?
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
                feature_coord_link: world.feature_coord_link,
                pathname,
                chat_permission,
                color_text
            }
        }
        if(world_properties.page_is_nsfw) {
            state.worldModel.nsfw = world_properties.page_is_nsfw;
        }
        if(world_properties.square_chars) {
            state.worldModel.square_chars = true;
        }
        if(world_properties.half_chars) {
            state.worldModel.half_chars = true;
        }
        if(announcement) {
            state.announce = announcement;
        }
        if(params.timemachine) {
            state.worldModel.writability = 0;
        }
        if(world_properties.background) {
            state.background = world_properties.background;
        }
        var page_title = "Our World of Text";
        if(world.name) {
            page_title = "/" + world.name;
        }
        var data = {
            state: JSON.stringify(state),
            world,
            page_title,
            nsfw: world_properties.page_is_nsfw
        }
        serve(HTML("yourworld.html", data), null, {
            mime: "text/html; charset=utf-8"
        });
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

    var world = await world_get_or_create(path)
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