module.exports = async function(ws, data, send, vars, evars) {
    var broadcast = evars.broadcast; // broadcast to current world

    var data_rec = data.data;
    var wss = vars.wss;
    var NCaseCompare = vars.NCaseCompare;
    var world = vars.world;
    var user = vars.user;

    // rate limit commands
    var msNow = Date.now();

    var second = Math.floor(msNow / 1000);
    var commandsEverySecond = 192;

    if(ws.lastCmdSecond != second) {
        ws.lastCmdSecond = second;
        ws.cmdsSentInSecond = 0;
    } else {
        if(ws.cmdsSentInSecond >= commandsEverySecond) {
            if(!user.operator) {
                return;
            }
        } else {
            ws.cmdsSentInSecond++;
        }
    }

    var cdata = {
        kind: "cmd",
        data: (data_rec + "").slice(0, 2048),
        sender: vars.channel,
        source: "cmd"
    };

    if(data.include_username && user.authenticated) {
        cdata.username = user.username;
    }

    data = JSON.stringify(cdata);
    
    wss.clients.forEach(function(client) {
        if(!client.userClient) return;
        try {
            if(client.readyState == 1 && NCaseCompare(client.world_name, world.name)) {
                if(!client.handleCmdSockets) return;
                client.send(data);
            }
        } catch(e) {}
    });
}