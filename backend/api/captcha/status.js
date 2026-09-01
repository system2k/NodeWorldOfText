var captcha = require("../../subsystems/captcha.js");

var world_mgr = require("../../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var getWorld = world_mgr.getWorld;
var canViewWorld = world_mgr.canViewWorld;

module.exports.GET = async function(req, write, server, ctx) {
	var user = ctx.user;
	var ipAddress = ctx.ipAddress;
	var query_data = ctx.query_data;
	var setCallback = ctx.setCallback;

	var getServerSetting = server.getServerSetting;

	var captchaEnabledGlobally = getServerSetting("captchaEnabled") == "1";
	if(!captchaEnabledGlobally) {
		return write(JSON.stringify({
			required: false
		}));
	}

	var worldIncluded = query_data.world != void 0;
	var worldName = null;

	if(worldIncluded) {
		if(typeof query_data.world != "string") return write(null, 400);
		let world = await getWorld(query_data.world);
		if(!world) {
			return write(null, 404);
		}
		
		setCallback(function() {
			releaseWorld(world);
		});

		let perm = await canViewWorld(world, user, {
			memKey: query_data.key
		});
		if(!perm) {
			return write(null, 403);
		}
		worldName = world.name.toUpperCase();
	}

	let isRequired = await captcha.isRequired(server, user, ipAddress, worldName);

	return write(JSON.stringify({
		required: isRequired
	}));
}
