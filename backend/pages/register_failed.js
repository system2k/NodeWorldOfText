module.exports.GET = async function(req, serve, vars, evars) {
	var HTML = evars.HTML;
	serve(HTML("registration/registration_failed.html"));
}