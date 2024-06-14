var world_mgr = require("../../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var fetchWorldMembershipsByUserId = world_mgr.fetchWorldMembershipsByUserId;
var fetchOwnedWorldsByUserId = world_mgr.fetchOwnedWorldsByUserId;
var claimWorldByName = world_mgr.claimWorldByName;
var revokeMembershipByWorldName = world_mgr.revokeMembershipByWorldName;

function sendWorldStatusUpdate(server, worldId, userId) {
	var wss = server.wss;
	var wsSend = server.wsSend;
	wss.clients.forEach(function(client) {
		if(!client.sdata) return;
		if(!client.sdata.userClient) return;
		if(client.sdata.world.id != worldId) return;
		if(client.sdata.user.id != userId) return;

		// TODO: overhaul this entire system
		var world = client.sdata.world;
		var memKeyAccess = world.opts.memKey && world.opts.memKey == client.sdata.keyQuery;
		var isOwner = world.ownerId == userId;
		var isMember = Boolean(world.members.map[userId]) || isOwner || memKeyAccess;

		wsSend(client, JSON.stringify({
			kind: "propUpdate",
			props: [
				{
					type: "isOwner",
					value: isOwner
				},
				{
					type: "isMember",
					value: isMember
				}
			]
		}));
	});
}

module.exports.GET = async function(req, write, server, ctx, params) {
	var cookies = ctx.cookies;
	var user = ctx.user;
	var render = ctx.render;

	var db = server.db;
	var createCSRF = server.createCSRF;

	if(!user.authenticated) {
		return write(null, null, {
			redirect: "/accounts/login/?next=/accounts/profile/"
		});
	}

	var world_list = [];
	var html_memberships = [];

	var ownedList = await fetchOwnedWorldsByUserId(user.id);
	for(var i = 0; i < ownedList.length; i++) {
		var owned = ownedList[i];
		var member_total = Object.keys(owned.members.map).length;
		var world_url = owned.name;
		if(world_url == "") {
			world_url = "/" + world_url;
		}
		var views = owned.views;
		world_list.push({
			public_writable: owned.writability == 0,
			public_readable: owned.readability == 0,
			whitelist_set_count: member_total,
			conf_url: "/accounts/configure/" + owned.name + "/",
			get_absolute_url: "/" + owned.name,
			url: world_url,
			member_count: member_total,
			views_count: views,
			views,
			name: owned.name,
			mem_key: owned.opts.memKey
		});
	}

	world_list.sort(function(v1, v2) {
		return v1.name.localeCompare(v2.name, "en", { numeric: true, sensitivity: "base" });
	});

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

	for(var i = 0; i < memberships.length; i++) {
		var wname = memberships[i];
		var display_name = wname;
		if(display_name == "") {
			display_name = "/" + display_name;
		}
		html_memberships.push({
			get_absolute_url: "/" + wname,
			url: display_name,
			name: wname
		});
	}

	var message = null;
	if(params.message) {
		message = params.message;
	}

	// do not display areas if they are empty
	if(world_list.length == 0) world_list = null;
	if(html_memberships.length == 0) html_memberships = null;

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		message: message,
		csrftoken,
		classic_csrftoken: user.csrftoken,
		worlds_owned: world_list,
		memberships: html_memberships,
		email_verified: user.is_active
	};

	write(render("profile.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var db = server.db;
	var wss = server.wss;
	var checkCSRF = server.checkCSRF;
	var uvias = server.uvias;
	var accountSystem = server.accountSystem;

	if(!user.authenticated) {
		return write(null, 403);
	}

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	var message = null;
	if(post_data.form == "claim") {
		if(accountSystem == "uvias" && user.uv_rank == uvias.getRankIdByName("guests")) {
			// if this is a Uvias guest account, prevent it from claiming worlds
			return await callPage("accounts/profile", {
				message: "Guests cannot claim worlds"
			});
		} else {
			var worldname = post_data.worldname;
			if(typeof worldname != "string") {
				message = "No world name provided";
			} else {
				worldname = worldname.trim();
				var status = await claimWorldByName(worldname, user);
				message = status.message;
				// TODO: what about isMember?
				if(status.success) {
					sendWorldStatusUpdate(server, status.world.id, user.id);
					releaseWorld(status.world);
				}
			}
		}
	} else if(post_data.form == "leave") { // user is leaving the world (terminating own membership)
		for(var key in post_data) {
			if(key.startsWith("leave_")) {
				var worldName = key.substr("leave_".length);
				var revoke = await revokeMembershipByWorldName(worldName, user.id);
				if(revoke && revoke[0]) {
					sendWorldStatusUpdate(server, revoke[1], user.id);
				}
				break;
			}
		}
	}
	await callPage("accounts/profile", {
		message
	});
}