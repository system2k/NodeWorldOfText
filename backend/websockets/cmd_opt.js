module.exports = async function(ws, data, send, vars, evars) {
    var data_rec = data.data;

    ws.handleCmdSockets = true;

    send({
        kind: "cmd_opt",
        enabled: true
    })
}