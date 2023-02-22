module.exports = async function(ws, data, send, broadcast, server, ctx) {
	ws.sdata.handleCmdSockets = true;
	send({
		kind: "cmd_opt",
		enabled: true
	});
}