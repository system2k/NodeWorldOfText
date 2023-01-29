module.exports = async function(ws, data, send, vars, evars) {
	var tiles = await vars.modules.fetch_tiles(data, vars, {
		world: evars.world,
		ws: evars.ws,
		channel: evars.channel
	});
	// socket error
	if(tiles === null) {
		return;
	}
	if(typeof tiles == "string") {
		return tiles;
	} else {
		// special parameters
		if("data" in tiles) tiles = tiles.data;
		send({ tiles });
	}
}