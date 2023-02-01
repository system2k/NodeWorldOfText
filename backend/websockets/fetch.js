module.exports = async function(ws, data, send, server, ctx) {
	var tiles = await server.modules.fetch_tiles(data, server, {
		world: ctx.world,
		ws: ctx.ws,
		channel: ctx.channel
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