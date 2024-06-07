module.exports.GET = async function(req, write, server, ctx, params) {
	var render = ctx.render;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var db = server.db;
	var createCSRF = server.createCSRF;

	// not staff
	if(!user.staff) {
		return await callPage("404");
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

	write(render("script_manager.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var db = server.db;
	var checkCSRF = server.checkCSRF;

	if(!user.staff) {
		return;
	}

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	var name = post_data.scriptname;

	var exists = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, name]);

	if(exists) {
		return await callPage("script_manager", {
			message: "The script already exists"
		});
	}

	await db.run("INSERT INTO scripts VALUES(null, ?, ?, '', ?, 0)",
		[user.id, name, Date.now()]);

	await callPage("script_manager", {
		message: "Script created successfully"
	});
}