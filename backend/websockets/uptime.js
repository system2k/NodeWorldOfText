module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var getServerUptime = server.getServerUptime;

	send({
		uptime: getServerUptime()
	});
}
