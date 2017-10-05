module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;
    var plural = vars.plural;

    if(!user.authenticated) {
        return serve(null, null, {
            redirect: "/accounts/login/?next=/accounts/profile/"
        })
    }

    var world_list = [];
    var memberships = [];

    var owned = await db.all("SELECT * FROM world WHERE owner_id=?", user.id)
    for(var i = 0; i < owned.length; i++) {
        var world = owned[i];
        var member_total = await db.get("select world_id, count(world_id) as count from whitelist where world_id=?", world.id);
        member_total = member_total.count;
        
        var world_url = world.name;
        if(world_url == "") {
            world_url = "/" + world_url;
        }
        var properties = JSON.parse(world.properties)
        world_list.push({
            public_writable: world.writability == 0,
            public_readable: world.readability == 0,
            whitelist_set_count: member_total,
            conf_url: "/accounts/configure/" + world.name + "/",
            get_absolute_url: "/" + world.name,
            url: world_url,
            member_plural: plural(member_total),
            views_plural: plural(properties.views),
            views: properties.views
        })
    }

    var whitelists = await db.all("SELECT * FROM whitelist WHERE user_id=?", user.id)

    for(var i = 0; i < whitelists.length; i++) {
        var world_reference = whitelists[i];
        var name = (await db.get("SELECT name from world where id=?", world_reference.world_id)).name;
        var display_name = name;
        if(display_name == "") {
            display_name = "/" + display_name;
        }
        memberships.push({
            get_absolute_url: "/" + name,
            url: display_name
        })
    }

    var message = null;
    if(params.message) {
        message = params.message;
    }

    // do not display areas if they are empty
    if(world_list.length == 0) world_list = null;
    if(memberships.length == 0) memberships = null;

    var data = {
        user,

        message: message,
        csrftoken: cookies.csrftoken,
        worlds_owned: world_list,
        memberships: memberships
    };

    serve(template_data["profile.html"](data))
}

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var world_get_or_create = vars.world_get_or_create;

    if(!user.authenticated) {
        return serve(null, 403);
    }

    var message = null;

    var worldname = post_data.worldname;
    if(worldname.match(/^(\w*)$/g) && (worldname.length > 0 || user.superuser)) {
        var world = await world_get_or_create(worldname);
        if(world.owner_id == null) {
            await db.run("UPDATE world SET owner_id=? WHERE name=?", [user.id, worldname])
        } else {
            message = "World already has an owner";
        }
    } else {
        message = "Invalid world name";
    }
    await dispage("profile", {
        message: message
    }, req, serve, vars)
}