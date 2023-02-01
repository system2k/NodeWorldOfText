module.exports = async function(ws, data, send, server, ctx) {
	var modules = server.modules;
	var do_write = await modules.write_data(data, server, ctx);
	if(typeof do_write == "string") {
		return do_write;
	} else {
		send({
			accepted: do_write.accepted,
			rejected: do_write.rejected
		});
	}
}