module.exports = async function(ws, data, send, vars) {
    var tiles = await vars.modules.fetch_tiles(data, vars);
    if(typeof tiles == "string") {
        return tiles;
    } else {
        send({ tiles })
    }
}