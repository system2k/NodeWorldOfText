var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;

module.exports.GET = async function(req, write, server, ctx) {
	var path = ctx.path;

	var db_img = server.db_img;

	var img_name = checkURLParam("/other/backgrounds/:img", path).img;

	var data = await db_img.get("SELECT data, mime FROM images WHERE name=?", img_name);

	if(!data) return write("Image not found", 404);

	write(data.data, 200, { mime: data.mime_type });
}