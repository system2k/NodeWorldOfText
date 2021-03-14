module.exports.GET = async function(req, serve, vars, evars) {
	var HTML = evars.HTML;
	
	var website = vars.website;

	var data = {
		website
	};

	serve(HTML("home.html", data));
}