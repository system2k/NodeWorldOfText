module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var modules = server.modules;
	var do_write = await modules.write_data(data, server, {
		user: ctx.user,
		channel: ctx.channel,
		world: ctx.world,
		keyQuery: ctx.keyQuery,
		ws: ws
	});
	if(typeof do_write == "string") {
		return do_write;
	} else {
		send({
			accepted: do_write.accepted,
			rejected: do_write.rejected
		});
	}
}