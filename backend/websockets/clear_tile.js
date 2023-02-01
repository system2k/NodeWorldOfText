var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

module.exports = async function(ws, data, send, server, ctx) {
	var broadcast = ctx.broadcast;
	var user = ctx.user;
	var world = ctx.world;

	var db = server.db;
	var tile_database = server.tile_database;

	if(!user.superuser) return;

	var tileX = san_nbr(data.tileX);
	var tileY = san_nbr(data.tileY);

	var no_log_edits = world.opts.noLogEdits;

	await tile_database.write(tile_database.types.clear, {
		tileX, tileY, user, world,
		date: Date.now(), no_log_edits
	});
}