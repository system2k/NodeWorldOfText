var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;

module.exports.GET = async function(req, serve, vars, evars) {
	var path = evars.path;

	var db_img = vars.db_img;

	var img_name = checkURLParam("/other/backgrounds/:img", path).img;

	var data = await db_img.get("SELECT data, mime FROM images WHERE name=?", img_name);

	if(!data) return serve("Image not found", 404);

	serve(data.data, 200, { mime: data.mime_type });
}