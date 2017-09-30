module.exports = {};

function fjoin(ar, str, len) {
	var s = ""
	for(var i = 0; i < len; i++) {
		s += ar[0]
		if(i < len - 1) {
			s += str
		}
		ar.shift();
	}
	return [s, ar.join("")];
}

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;
    var url = vars.url;
    var path = vars.path;
    var get_third = vars.get_third;
    var db = vars.db;
    var dispage = vars.dispage;

    if(!user.authenticated) {
        return serve(null, null, {
            redirect: "/accounts/login/?next=" + url.parse(req.url).pathname
        })
    }

    // gets world name from /accounts/configure/{world}/
    var world_name = get_third(path, "accounts", "timemachine")

    var sp = world_name.split("/");
    if(sp.length > 1) {
        var int = fjoin(sp, "/", sp.length - 1);
        world_name = int[0];
    }

    var world = await db.get("SELECT * FROM world WHERE name=?", world_name);

    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    if(world.owner_id != user.id && !user.superuser) {
        return serve("Access denied", 403)
    }

    return await dispage("yourworld", {
        timemachine: true,
        world: world.name
    }, req, serve, vars)
    
    serve()
}