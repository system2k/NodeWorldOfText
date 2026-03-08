module.exports = async function(ws, data, send, broadcast, server, ctx) {
	if(data.updates === true) {
		ws.sdata.receiveContentUpdates = true;
	} else if(data.updates === false) {
		ws.sdata.receiveContentUpdates = false;
	}
	if(data.localFilter === true) {
		ws.sdata.localFilter = true;
	} else if(data.localFilter === false) {
		ws.sdata.localFilter = false;
	}
	if(ws.sdata.user?.authenticated && ws.sdata.user?.superuser) {
		if(data.directAdminUpdates === true) {
			ws.sdata.receiveDirectAdminUpdates = true;
		} else if(data.directAdminUpdates === false) {
			ws.sdata.receiveDirectAdminUpdates = false;
		}
		if(data.descriptiveCmd === true) {
			ws.sdata.descriptiveCmd = true;
		} else if(data.descriptiveCmd === false) {
			ws.sdata.descriptiveCmd = false;
		}
	}
}