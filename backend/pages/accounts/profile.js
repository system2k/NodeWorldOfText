module.exports.GET = async function(req, serve, vars, evars, params) {
	var cookies = evars.cookies;
	var user = evars.user;
	var HTML = evars.HTML;

	var db = vars.db;
	var plural = vars.plural;
	var worldViews = vars.worldViews;
	var fetchWorldMembershipsByUserId = vars.fetchWorldMembershipsByUserId;

	if(!user.authenticated) {
		return serve(null, null, {
			redirect: "/accounts/login/?next=/accounts/profile/"
		});
	}

	var world_list = [];
	var html_memberships = [];

	// TODO: just fix
	var owned = await db.all("SELECT * FROM world WHERE owner_id=? LIMIT 10000", user.id);
	for(var i = 0; i < owned.length; i++) {
		var world = owned[i];
		var member_total = await db.get("select world_id, count(world_id) as count from whitelist where world_id=?", world.id);
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
			public_writable: world.writability == 0,
			public_readable: world.readability == 0,
			whitelist_set_count: member_total,
			conf_url: "/accounts/configure/" + world.name + "/",
			get_absolute_url: "/" + world.name,
			url: world_url,
			member_plural: plural(member_total),
			views_plural: plural(properties.views),
			views,
			name: world.name
		});
	}

	world_list.sort(function(v1, v2) {
		return v1.name.localeCompare(v2.name, "en", { sensitivity: "base" })
	});

	// TODO: test this
	var memberships = await fetchWorldMembershipsByUserId(user.id);
	for(var i = 0; i < memberships.length; i++) {
		var wid = memberships[i];
		var name = await db.get("SELECT name from world where id=?", wid);
		if(name) {
			name = name.name;
		} else {
			name = "Error~" + wid;
		}
		memberships[i] = name;
	}
	memberships.sort();

	for(var i = 0; i < memberships.length; i++) {
		var wname = memberships[i];
		var display_name = wname;
		if(display_name == "") {
			display_name = "/" + display_name;
		}
		html_memberships.push({
			get_absolute_url: "/" + wname,
			url: display_name,
			wname
		});
	}

	var message = null;
	if(params.message) {
		message = params.message;
	}

	// do not display areas if they are empty
	if(world_list.length == 0) world_list = null;
	if(html_memberships.length == 0) html_memberships = null;

	var data = {
		message: message,
		csrftoken: cookies.csrftoken,
		worlds_owned: world_list,
		memberships: html_memberships,
		email_verified: user.is_active
	};

	serve(HTML("profile.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var user = evars.user;

	var db = vars.db;
	var dispage = vars.dispage;
	var world_get_or_create = vars.world_get_or_create;
	var validate_claim_worldname = vars.validate_claim_worldname;
	var modifyWorldProp = vars.modifyWorldProp;

	if(!user.authenticated) {
		return serve(null, 403);
	}

	var message = null;
	if(post_data.form == "claim") {
		if(user.uv_rank == 3) {
			return await dispage("accounts/profile", {
				message: "Guests cannot claim worlds"
			}, req, serve, vars, evars);
		} else {
			var worldname = post_data.worldname + "";

			// TODO: still a race condition here
			var validate = await validate_claim_worldname(worldname, vars, evars);
			if(validate.error) { // an error occurred while claiming
				return await dispage("accounts/profile", {
					message: validate.message
				}, req, serve, vars, evars);
			}
			console.log(validate)
			var world = validate.world;
			world.ownerId = user.id;
			modifyWorldProp(world, "ownerId");

			//await db.run("UPDATE world SET owner_id=? WHERE id=?", [user.id, validate.world_id]);



			message = validate.message;
		}
	} else if(post_data.form == "leave") { // user is leaving the world (terminating own membership)
		for(var key in post_data) {
			if(key.startsWith("leave_")) {
				var worldName = key.substr("leave_".length);
				var world = await world_get_or_create(worldName);
				if(world) {
					var userId = user.id;
					if(world.members.map[userId]) {
						delete world.members.map[userId];
					}
					if(world.members.updates[userId]) {
						var type = world.members.updates[userId];
						if(type == "ADD") {
							delete world.members.updates[userId];
						}
					} else {
						world.members.updates[userId] = "REMOVE";
					}
				}
				break;
			}
		}
	}
	await dispage("accounts/profile", {
		message
	}, req, serve, vars, evars);
}