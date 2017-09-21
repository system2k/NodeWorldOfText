module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;

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
        var member_total = await db.get("select world_id, count(world_id) as count from whitelist where world_id=?", world.id).count;
        
        var plural = "";
        if(member_total !== 1) {
            plural = "s"
        }
        world_list.push({
            public_writable: world.public_writable,
            public_readable: world.public_readable,
            whitelist_set_count: member_total,
            conf_url: "/accounts/configure/" + world.name + "/",
            get_absolute_url: "/" + world.name,
            url: world.name,
            pluralize: plural
        })
    }

    var whitelists = await db.all("SELECT * FROM whitelist WHERE user_id=?", user.id)

    for(var i = 0; i < whitelists.length; i++) {
        var world_reference = whitelists[i];
        var name = await db.get("SELECT name from world where id=?", world_reference.world_id);
        name = name.name;
        memberships.push({
            get_absolute_url: "/" + name,
            url: name
        })
    }

    var message = null;

    var data = {
        user_is_authenticated: user.authenticated,
        user: user.username,

        message: message,
        csrftoken: cookies.csrftoken,
        worlds_owned: world_list,
        memberships: memberships
    };

    serve(template_data["profile.html"](data))
}