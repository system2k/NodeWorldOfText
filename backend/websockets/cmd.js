module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var channel = ctx.channel;
	var world = ctx.world;

	var data_rec = data.data;
	var wss = server.wss;
	var accountSystem = server.accountSystem;
	var wsSend = server.wsSend;

	// rate limit commands
	var msNow = Date.now();

	var second = Math.floor(msNow / 1000);
	var commandsEverySecond = 192;

	if(ws.sdata.lastCmdSecond != second) {
		ws.sdata.lastCmdSecond = second;
		ws.sdata.cmdsSentInSecond = 0;
	} else {
		if(ws.sdata.cmdsSentInSecond >= commandsEverySecond) {
			if(!user.operator) {
				return;
			}
		} else {
			ws.sdata.cmdsSentInSecond++;
		}
	}

	var cdata = {
		kind: "cmd",
		data: (data_rec + "").slice(0, 2048),
		sender: channel,
		source: "cmd"
	};

	if(data.include_username && user.authenticated) {
		var username = user.username;
		if(accountSystem == "uvias") {
			username = user.display_username;
		}
		cdata.username = username;
		cdata.id = user.id;
		if(accountSystem == "uvias") {
			cdata.id = cdata.id.substr(1).toUpperCase().padStart(16, "0");
		}
	}

	data = JSON.stringify(cdata);
	
	wss.clients.forEach(function(client) {
		if(!client.sdata) return;
		if(!client.sdata.userClient) return;
		if(client.readyState == 1 && client.sdata.world.id == world.id) {
			if(!client.sdata.handleCmdSockets) return;
			if(client.sdata.user && client.sdata.user.superuser && client.sdata.descriptiveCmd) {
				wsSend(client, JSON.stringify(Object.assign(cdata, {
					username: accountSystem == "uvias" ? user.display_username : user.username,
					id: user.authenticated ? (accountSystem == "uvias" ? user.id.substr(1).toUpperCase().padStart(16, "0") : user.id) : void 0,
					ip: ws.sdata.ipAddress
				})));
			} else {
				wsSend(client, data);
			}
		}
	});
}