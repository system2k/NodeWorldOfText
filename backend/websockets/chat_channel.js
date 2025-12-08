module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var world = ctx.world;
	var db_chat = server.db_chat;

	var location = "";
	if(!(data.location == "global" || data.location == "page")) data.location = "page";
	location = data.location;

	if(!user.staff) return;

	var worldId = world.id;
	if(location == "global") worldId = 0;

	var res = {
		channels: [],
		default_channel: null
	};

	var channels = await db_chat.all("SELECT * FROM channels WHERE world_id=?", worldId);
	var count = channels.length;

	for(var i = 0; i < count; i++) {
		var ch = channels[i];

		res.channels.push({
			name: ch.name,
			description: ch.description,
			date_created: ch.date_created
		});
	}

	var def = await db_chat.get("SELECT * FROM default_channels WHERE world_id=?", worldId);
	if(def && def.channel_id) {
		res.default_channel = def.channel_id;
	}

	send(res);
}
