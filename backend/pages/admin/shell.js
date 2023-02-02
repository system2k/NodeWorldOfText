module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	var user = ctx.user;

	var loadShellFile = server.loadShellFile;
	var shellEnabled = server.shellEnabled;
	var createCSRF = server.createCSRF;

	if(!user.superuser) return;
	if(!shellEnabled) return write("Shell is not enabled");

	/*
	shell.js template:

	shell.main = async function() {
		return "response message";
	}
	*/

	var query_data = ctx.query_data;

	if(query_data.command == "load") {
		var data = loadShellFile();
		if(data) {
			return write(data);
		} else {
			return write(null, 404);
		}
	}

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		csrftoken
	};

	write(render("administrator_shell.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;

	var runShellScript = server.runShellScript;
	var shellEnabled = server.shellEnabled;
	var checkCSRF = server.checkCSRF;

	if(!user.superuser) return;
	if(!shellEnabled) return write("Shell is not enabled");

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	if(post_data.command == "exec") {
		var result = await runShellScript(post_data.colors === "true");
		return write(result);
	} else {
		return write(null, 400);
	}
}