module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	var user = ctx.user;

	if(!user.superuser) return;

	var memTileCache = server.memTileCache;

	var tc_worlds = 0;
	var tc_tiles = 0;

	for(var w in memTileCache) {
		tc_worlds++;
		for(var y in memTileCache[w]) {
			for(var x in memTileCache[w][y]) {
				tc_tiles++;
			}
		}
	}

	write(render("monitor.html", {
		tc_worlds,
		tc_tiles
	}));
}