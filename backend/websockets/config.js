module.exports = async function(ws, data, send, vars, evars) {
	if(data.updates === true) {
		ws.sdata.receiveContentUpdates = true;
	} else if(data.updates === false) {
		ws.sdata.receiveContentUpdates = false;
	}
}