module.exports.GET = async function(req, serve, vars, evars, params) {
	var HTML = evars.HTML;
	serve(HTML("private.html", {
		privateWorldMsg: params.privateWorldMsg
	}), 403);
}