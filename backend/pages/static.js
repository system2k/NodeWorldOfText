var url = require("url");
var mime = require("../utils/mime.js");

var utils = require("../utils/utils.js");
var removeLastSlash = utils.removeLastSlash;

module.exports.GET = async function(req, serve, vars, evars) {
	var query_data = evars.query_data;
	var HTML = evars.HTML;

	var static_data = vars.static_data;

	var parse = url.parse(req.url).pathname.substr(1);
	var segmentCount = parse.split("/").length;
	if(segmentCount == 1) {
		return -1; // world "/static"
	}
	parse = removeLastSlash(parse).toLowerCase();
	var mime_type = mime(parse.replace(/.*[\.\/\\]/, "").toLowerCase());
	if(static_data.hasOwnProperty(parse)) {
		serve(static_data[parse], 200, { mime: mime_type });
	} else {
		return;
	}
}