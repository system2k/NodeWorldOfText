module.exports = async function(ws, data, send, vars, evars) {
    var broadcast = evars.broadcast; // broadcast to current world

    var data_rec = data.data;
    var wss = vars.wss;
    var NCaseCompare = vars.NCaseCompare;
    var world = vars.world;
    var user = vars.user;
    var accountSystem = vars.accountSystem;

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
        sender: vars.channel,
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
        if(!client.sdata.userClient) return;
        try {
            if(client.readyState == 1 && NCaseCompare(client.sdata.world_name, world.name)) {
                if(!client.sdata.handleCmdSockets) return;
                client.send(data);
            }
        } catch(e) {}
    });
}