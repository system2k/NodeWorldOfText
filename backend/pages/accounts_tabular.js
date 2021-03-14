module.exports.GET = async function(req, serve, vars, evars, params) {
	var cookies = evars.cookies;
	var user = evars.user;
	var HTML = evars.HTML;

	var db = vars.db;
	var plural = vars.plural;
	var worldViews = vars.worldViews;

	if(!user.authenticated) {
		return serve(null, null, {
			redirect: "/accounts/login/?next=/accounts/tabular/"
		});
	}

	var world_list = [];

	var owned = await db.all("SELECT * FROM world WHERE owner_id=?", user.id);
	for(var i = 0; i < owned.length; i++) {
		var world = owned[i];
		var member_total = await db.get("SELECT COUNT(world_id) AS count FROM whitelist WHERE world_id=?", world.id);
		member_total = member_total.count;
		
		var world_url = world.name;
		if(world_url == "") {
			world_url = "/" + world_url;
		}
		var properties = JSON.parse(world.properties)
		var views = properties.views;
		if(!views) views = 0;
		if(worldViews[world.id]) views += worldViews[world.id];
		world_list.push({
			writability: world.writability,
			readability: world.readability,
			members: member_total,
			name: world.name,
			views
		});
	}

	world_list.sort(function(a, b) {
		return a.name.localeCompare(b.name, "en", {
			sensitivity: "base"
		});
	});

	var data = {
		csrftoken: cookies.csrftoken,
		worlds_owned: world_list
	};

	serve(HTML("accounts_tabular.html", data));
}