module.exports = async function(ws, data, send, vars, evars) {
	ws.sdata.handleCmdSockets = true;
	send({
		kind: "cmd_opt",
		enabled: true
	});
}