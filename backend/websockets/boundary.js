var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	if (
		typeof data.centerX == "number" &&
		typeof data.centerY == "number"
	) {
		let centerX = san_nbr(data.centerX);
		let centerY = san_nbr(data.centerY);
		ws.sdata.center = [centerX, centerY]
	}

	if (
		typeof data.minX == "number" &&
		typeof data.minY == "number" &&
		typeof data.maxX == "number" &&
		typeof data.maxY == "number"
	) {
		let minX = san_nbr(data.minX);
		let minY = san_nbr(data.minY);
		let maxX = san_nbr(data.maxX);
		let maxY = san_nbr(data.maxY);
		ws.sdata.boundary = [minX, minY, maxX, maxY];
	} else {
		ws.sdata.boundary = null;
	}
}