module.exports.GET = async function(req, serve, vars, evars) {
	var path = evars.path;
	var user = evars.user;

	var dispage = vars.dispage;
	var db = vars.db;
	var checkURLParam = vars.checkURLParam;

	// not staff
	if(!user.staff) {
		return serve();
	}

	var script_name = checkURLParam("/script_manager/view/:script", path).script;

	var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, script_name]);
	
	if(!script) {
		return serve();
	}

	serve(script.content);
}