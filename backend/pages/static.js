var url = require("url");
var mime = require("../utils/mime.js");

var utils = require("../utils/utils.js");
var removeLastSlash = utils.removeLastSlash;

module.exports.GET = async function(req, serve, vars, evars) {
	var query_data = evars.query_data;
	var HTML = evars.HTML;

	var static_data = vars.static_data;
	var staticShortcuts = vars.staticShortcuts;

	var file = query_data.file;
	if(file) {
		file = parseFloat(file, 10);
		if(isNaN(file) || !Number.isInteger(file)) return serve(null, 404);
		if(staticShortcuts.hasOwnProperty(file)) {
			return serve(null, null, {
				redirect: "/static/files/" + staticShortcuts[file]
			});
		}
		return serve(null, 404);
	}

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