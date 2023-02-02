var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;

module.exports.GET = async function(req, write, server, ctx) {
	var path = ctx.path;
	var render = ctx.render;


	var world_name = checkURLParam("/accounts/nsfw/*world", path).world;
	var data = {
		world_name
	};

	write(render("accounts_nsfw.html", data));
}