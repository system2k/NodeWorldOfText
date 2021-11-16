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

module.exports.GET = async function(req, serve, vars, evars) {
	var path = evars.path;
	var user = evars.user;

	var url = vars.url;
	var checkURLParam = vars.checkURLParam;
	var db = vars.db;
	var dispage = vars.dispage;
	var world_get_or_create = vars.world_get_or_create;

	if(!user.authenticated) {
		return serve(null, null, {
			redirect: "/accounts/login/?next=" + url.parse(req.url).pathname
		});
	}

	var world_name = checkURLParam("/accounts/timemachine/*world", path).world;

	var sp = world_name.split("/");
	if(sp.length > 1) {
		var int = fjoin(sp, "/", sp.length - 1);
		world_name = int[0];
	}

	var world = await world_get_or_create(world_name)
	if(!world) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	if(world.ownerId != user.id && !user.superuser) {
		return serve("Access denied", 403)
	}

	return await dispage("yourworld", {
		timemachine: true,
		world: world.name
	}, req, serve, vars, evars);
}