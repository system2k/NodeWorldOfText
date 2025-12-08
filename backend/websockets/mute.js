var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;
var getClientIPByChatID = utils.getClientIPByChatID;

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var world = ctx.world;
	var chat_mgr = server.chat_mgr;
	var is_owner = world.ownerId == user.id;

	if(!is_owner && !user.staff) {
		send({
			success: false,
			error: "no_perm"
		});
		return;
	}

	var id = san_nbr(data.id);
	var time = san_nbr(data.time); // in seconds

	var location = "";
	if(!(data.location == "global" || data.location == "page")) data.location = "page";
	location = data.location;

	if(location == "global" && !user.staff) {
		send({
			success: false,
			error: "no_perm"
		});
		return;
	}

	var muted_ip = getClientIPByChatID(server, world.id, id, location == "global");

	if(muted_ip) {
		var muteDate = Date.now() + (time * 1000);
		var mute_wid = location == "global" ? 0 : world.id;

		chat_mgr.mute(mute_wid, muted_ip, muteDate);

		send({
			success: true,
			until: muteDate
		});
	} else {
		send({
			success: false,
			error: "not_found"
		});
	}
}
