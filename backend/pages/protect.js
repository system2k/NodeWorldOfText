var world_mgr = require("../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var getOrCreateWorld = world_mgr.getOrCreateWorld;
var canViewWorld = world_mgr.canViewWorld;

module.exports.POST = async function(req, serve, vars, evars, params) {
	var post_data = evars.post_data;
	var user = evars.user;
	var setCallback = evars.setCallback;

	var modules = vars.modules;

	var world = await getOrCreateWorld(post_data.world);
	if(!world) {
		return serve(null, 404);
	}

	setCallback(function() {
		releaseWorld(world);
	});

	var can_read = await canViewWorld(world, user);
	if(!can_read) {
		return serve(null, 403);
	}

	var action = "protect";
	if(params.unprotect) action = "unprotect";

	evars.world = world;

	var do_protect = await modules.protect_areas({
		action,
		tileX: post_data.tileX,
		tileY: post_data.tileY,
		charX: post_data.charX,
		charY: post_data.charY,
		precise: !!params.char,
		type: post_data.type
	}, vars, evars);

	if(do_protect[0]) {
		var msg = do_protect[1];
		if(msg == "PERM") {
			return serve("No permission", 403);
		} else if(msg == "PARAM") {
			return serve("Invalid parameters", 400);
		} else {
			return serve("Undefined error", 400);
		}
	} else {
		serve(null, null, {
			mime: "text/html; charset=utf-8"
		});
	}
}