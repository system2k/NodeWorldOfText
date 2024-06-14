var utils = require("../utils/utils.js");
var checkURLParam = utils.checkURLParam;

module.exports.GET = async function(req, write, server, ctx, params) {
	var path = ctx.path;
	var render = ctx.render;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var db = server.db;
	var createCSRF = server.createCSRF;

	// not staff
	if(!user.staff) {
		return await callPage("404");
	}

	var script_name = checkURLParam("/script_manager/edit/:script", path).script;

	var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, script_name]);
	
	if(!script) {
		return;
	}

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		message: params.message,
		name: script.name,
		content: script.content,
		enabled: script.enabled,
		csrftoken
	};

	write(render("script_edit.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var path = ctx.path;
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

	var script_name = checkURLParam("/script_manager/edit/:script", path).script;

	var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, script_name]);

	if(!script) {
		return;
	}

	var message = ""
	var title_changed = false;
	var new_title = "";

	if(post_data.form == "modify_script") {
		var title = post_data.title;
		var content = post_data.content;
		content = JSON.parse(content); // example: "test\\n123" -> test\n123
		if(typeof content !== "string") { // instead of receiving "string", we received {object}
			content = "";
		}
		if(title != script_name) {
			if(await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?", [user.id, title])) {
				message = "Script name already exists";
				title = script_name;
			} else {
				title_changed = true;
				new_title = title;
			}
		}
		await db.run("UPDATE scripts SET name=?, content=? WHERE owner_id=? AND name=?",
			[title, content, user.id, script_name]);
	} else if(post_data.form == "enable_disable_script") {
		await db.run("UPDATE scripts SET enabled=? WHERE owner_id=? AND name=?",
			[!!post_data.enabled, user.id, script_name]);
	}
	if(title_changed) {
		write(null, null, {
			redirect: "/script_manager/edit/" + new_title + "/"
		});
	}
	return await callPage("script_edit", {
		message
	});
}