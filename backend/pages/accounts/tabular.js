var world_mgr = require("../../subsystems/world_mgr.js");
var fetchOwnedWorldsByUserId = world_mgr.fetchOwnedWorldsByUserId;

module.exports.GET = async function(req, write, server, ctx, params) {
	var cookies = ctx.cookies;
	var user = ctx.user;
	var render = ctx.render;

	if(!user.authenticated) {
		return write(null, null, {
			// TODO: don't browsers have the ability to do this client-side?
			redirect: "/accounts/login/?next=/accounts/tabular/"
		});
	}

	var world_list = [];

	var ownedList = await fetchOwnedWorldsByUserId(user.id);
	for(var i = 0; i < ownedList.length; i++) {
		var world = ownedList[i];
		var member_total = Object.keys(world.members.map).length;
		
		var world_url = world.name;
		if(world_url == "") {
			world_url = "/" + world_url;
		}
		var views = world.views;
		world_list.push({
			writability: world.writability,
			readability: world.readability,
			members: member_total,
			name: world.name,
			views,
			created: world.creationDate,
			claimed: world.ownershipChangeDate
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

	write(render("accounts_tabular.html", data));
}