module.exports = async function(ws, data, send, vars, evars) {
    var tiles = await vars.modules.fetch_tiles(data, vars, evars);
    if(typeof tiles == "string") {
        return tiles;
    } else {
        if("data" in tiles) tiles = tiles.data;
        send({ tiles });
    }
}