module.exports = async function(ws, data, send, vars) {
    var broadcast = vars.broadcast; // broadcast to current world
    broadcast({
        kind: "cmd",
        data: (data.data + "").slice(0, 1024),
        sender: vars.channel
    })
}