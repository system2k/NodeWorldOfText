module.exports.GET = async function(req, serve, vars, evars) {
	var cookies = evars.cookies;
	var HTML = evars.HTML;
	var user = evars.user;

	if(!user.authenticated) return;

	serve(HTML("password_change_done.html"));
}