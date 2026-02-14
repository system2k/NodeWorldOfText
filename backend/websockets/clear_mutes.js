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

	send({
		success: true,
		count: chat_mgr.clearMutes(location == "global" ? 0 : world.id)
	});
}
