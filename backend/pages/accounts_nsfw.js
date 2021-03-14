module.exports.GET = async function(req, serve, vars, evars) {
	var path = evars.path;
	var HTML = evars.HTML;

	var get_third = vars.get_third;

	var world_name = get_third(path, "accounts", "nsfw")
	var data = {
		world_name
	}

	serve(HTML("accounts_nsfw.html", data));
}