module.exports = async function(ws, data, send, vars, evars) {
	var modules = vars.modules;
	var do_write = await modules.write_data(data, vars, evars);
	if(typeof do_write == "string") {
		return do_write;
	} else {
		send({
			accepted: do_write.accepted,
			rejected: do_write.rejected
		});
	}
}