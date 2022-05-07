module.exports.GET = async function(req, serve, vars, evars) {
	var HTML = evars.HTML;
	var user = evars.user;

	var loadShellFile = vars.loadShellFile;
	var shellEnabled = vars.shellEnabled;
	var createCSRF = vars.createCSRF;

	if(!user.superuser) return;
	if(!shellEnabled) return serve("Shell is not enabled");

	/*
	shell.js template:

	shell.main = async function() {
		return "response message";
	}
	*/

	var query_data = evars.query_data;

	if(query_data.command == "load") {
		var data = loadShellFile();
		if(data) {
			return serve(data);
		} else {
			return serve(null, 404);
		}
	}

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		csrftoken
	};

	serve(HTML("administrator_shell.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var user = evars.user;

	var runShellScript = vars.runShellScript;
	var shellEnabled = vars.shellEnabled;
	var checkCSRF = vars.checkCSRF;

	if(!user.superuser) return;
	if(!shellEnabled) return serve("Shell is not enabled");

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return serve("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	if(post_data.command == "exec") {
		var result = await runShellScript(post_data.colors === "true");
		return serve(result);
	} else {
		return serve(null, 400);
	}
}