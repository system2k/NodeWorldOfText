var url = require("url");
var mime = require("../utils/mime.js");

var utils = require("../utils/utils.js");
var removeLastSlash = utils.removeLastSlash;

module.exports.GET = async function(req, write, server, ctx) {
	var query_data = ctx.query_data;
	var render = ctx.render;

	var static_data = server.static_data;
	var staticShortcuts = server.staticShortcuts;

	var file = query_data.file;
	if(file) {
		file = parseFloat(file, 10);
		if(isNaN(file) || !Number.isInteger(file)) return write(null, 404);
		if(staticShortcuts.hasOwnProperty(file)) {
			return write(null, null, {
				redirect: staticShortcuts[file]
			});
		}
		return write(null, 404);
	}

	var parse = url.parse(req.url).pathname.substr(1);
	var segmentCount = parse.split("/").length;
	if(segmentCount == 1) {
		return; // top-level access is not possible
	}
	parse = removeLastSlash(parse).toLowerCase();
	var mime_type = mime(parse.replace(/.*[\.\/\\]/, "").toLowerCase());
	if(static_data.hasOwnProperty(parse)) {
		write(static_data[parse], 200, { mime: mime_type });
	} else {
		return;
	}
}