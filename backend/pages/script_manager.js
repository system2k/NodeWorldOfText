module.exports.GET = async function(req, serve, vars, evars, params) {
	var HTML = evars.HTML;
	var user = evars.user;

	var dispage = vars.dispage;
	var db = vars.db;
	var createCSRF = vars.createCSRF;

	// not staff
	if(!user.staff) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var scripts = [];

	await db.each("SELECT * FROM scripts WHERE owner_id=?", user.id, function(data) {
		scripts.push({
			name: data.name,
			enabled: data.enabled
		});
	});

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		message: params.message,
		scripts,
		csrftoken
	}

	serve(HTML("script_manager.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var user = evars.user;

	var db = vars.db;
	var dispage = vars.dispage;
	var checkCSRF = vars.checkCSRF;

	if(!user.staff) {
		return;
	}

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return serve("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	var name = post_data.scriptname;

	var exists = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, name]);

	if(exists) {
		return await dispage("script_manager", {
			message: "The script already exists"
		}, req, serve, vars, evars);
	}

	await db.run("INSERT INTO scripts VALUES(null, ?, ?, '', ?, 0)",
		[user.id, name, Date.now()]);

	await dispage("script_manager", {
		message: "Script created successfully"
	}, req, serve, vars, evars);
}