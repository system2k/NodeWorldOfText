var utils = require("../utils/utils.js");
var checkURLParam = utils.checkURLParam;

module.exports.GET = async function(req, write, server, ctx) {
	var path = ctx.path;
	var user = ctx.user;

	var dispage = server.dispage;
	var db = server.db;

	// not staff
	if(!user.staff) {
		return write();
	}

	var script_name = checkURLParam("/script_manager/view/:script", path).script;

	var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, script_name]);
	
	if(!script) {
		return write();
	}

	write(script.content);
}