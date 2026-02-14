var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var world = ctx.world;
	var is_owner = world.ownerId == user.id;
	var chat_mgr = server.chat_mgr;
	var remove_from_chatlog = chat_mgr.remove_from_chatlog;

	if(!is_owner && !user.staff) {
		send({
			success: false,
			error: "no_perm"
		});
		return;
	}

	var id = san_nbr(data.id);
	var timestamp = san_nbr(data.timestamp);
	var wid = world.id;

	var location = "";
	if(!(data.location == "global" || data.location == "page")) data.location = "page";
	location = data.location;

	if(location == "global") {
		if(!user.staff) {
			send({
				success: false,
				error: "no_perm"
			});
			return;
		}

		wid = 0;
	}

	var res = await remove_from_chatlog(wid, id, timestamp);

	send({
		success: true,
		count: res
	});

	if(res == 0) {
		return;
	}

	broadcast({
		kind: "chatdelete",
		id: id,
		time: timestamp
	});
}
