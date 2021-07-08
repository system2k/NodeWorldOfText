module.exports.GET = async function(req, serve, vars, evars) {
	var path = evars.path;
	var HTML = evars.HTML;

	var checkURLParam = vars.checkURLParam;

	var world_name = checkURLParam("/accounts/nsfw/*world", path).world;
	var data = {
		world_name
	};

	serve(HTML("accounts_nsfw.html", data));
}