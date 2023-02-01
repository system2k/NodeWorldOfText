var world_mgr = require("../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var getOrCreateWorld = world_mgr.getOrCreateWorld;
var canViewWorld = world_mgr.canViewWorld;

// both url links and coordinate links
module.exports.POST = async function(req, write, server, ctx, params) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	var setCallback = ctx.setCallback;

	var modules = server.modules;

	var world = await getOrCreateWorld(post_data.world);
	if(!world) {
		return write(null, 404);
	}

	setCallback(function() {
		releaseWorld(world);
	});

	var can_read = await canViewWorld(world, user);
	if(!can_read) {
		return write(null, 403);
	}

	var type = "url";
	if(params.coordlink) {
		type = "coord";
	}

	ctx.world = world;

	var do_link = await modules.write_links({
		type: type,
		tileX: post_data.tileX,
		tileY: post_data.tileY,
		charX: post_data.charX,
		charY: post_data.charY,
		url: post_data.url,
		link_tileX: post_data.link_tileX,
		link_tileY: post_data.link_tileY
	}, server, ctx);

	if(do_link[0]) {
		var msg = do_link[1];
		if(msg == "PERM") {
			return write("No permission", 403);
		} else if(msg == "PARAM") {
			return write("Invalid parameters", 400);
		} else {
			return write("Undefined error", 400);
		}
	} else {
		write(null, null, {
			mime: "text/html; charset=utf-8"
		});
	}
}