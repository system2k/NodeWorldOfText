module.exports = async function(ws, data, send, broadcast, server, ctx) {
	if(data.updates === true) {
		ws.sdata.receiveContentUpdates = true;
	} else if(data.updates === false) {
		ws.sdata.receiveContentUpdates = false;
	}
	if(data.descriptiveCmd === true) {
		ws.sdata.descriptiveCmd = true;
	} else if(data.descriptiveCmd === false) {
		ws.sdata.descriptiveCmd = false;
	}
	if(data.localFilter === true) {
		ws.sdata.localFilter = true;
	} else if(data.localFilter === false) {
		ws.sdata.localFilter = false;
	}
}