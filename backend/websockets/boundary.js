var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var centerX = san_nbr(data.centerX);
	var centerY = san_nbr(data.centerY);
	var minX = san_nbr(data.minX);
	var minY = san_nbr(data.minY);
	var maxX = san_nbr(data.maxX);
	var maxY = san_nbr(data.maxY);

	var center = ws.sdata.center;
	var boundary = ws.sdata.boundary;

	center[0] = centerX;
	center[1] = centerY;

	boundary[0] = minX;
	boundary[1] = minY;
	boundary[2] = maxX;
	boundary[3] = maxY;
}