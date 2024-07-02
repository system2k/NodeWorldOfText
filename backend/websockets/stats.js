var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var world = ctx.world;

	var res = {
		kind: "stats",
		creationDate: world.creationDate,
		views: world.views
	};

	if(data.id != void 0) {
		res.id = san_nbr(data.id);
	}

	send(res);
}