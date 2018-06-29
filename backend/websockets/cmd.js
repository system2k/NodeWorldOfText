module.exports = async function(ws, data, send, vars) {
    var broadcast = vars.broadcast; // broadcast to current world
    var data_rec = data.data;
    var wss = vars.wss;
    var NCaseCompare = vars.NCaseCompare;
    var world = vars.world;

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

    data = JSON.stringify({
        kind: "cmd",
        data: (data_rec + "").slice(0, 2048),
        sender: vars.channel,
        source: "cmd"
    })
    
    wss.clients.forEach(function(client) {
        try {
            if(client.readyState == 1 && NCaseCompare(client.world_name, world.name)) {
                if(!client.handleCmdSockets) return;
                client.send(data);
            }
        } catch(e) {}
    });
}