module.exports.GET = async function(req, serve, vars, evars, params) {
	var path = evars.path;
	var HTML = evars.HTML;
	var user = evars.user;

	var dispage = vars.dispage;
	var db = vars.db;
	var get_third = vars.get_third;

	// not staff
	if(!user.staff) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var script_name = get_third(path, "script_manager", "edit")

	var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, script_name])
	
	if(!script) {
		return;
	}

	var data = {
		message: params.message,
		name: script.name,
		content: script.content,
		enabled: script.enabled
	}

	serve(HTML("script_edit.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var path = evars.path;
	var user = evars.user;

	var db = vars.db;
	var dispage = vars.dispage;
	var get_third = vars.get_third;

	if(!user.staff) {
		return;
	}

	var script_name = get_third(path, "script_manager", "edit")

	var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
		[user.id, script_name])

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
			[title, content, user.id, script_name])
	} else if(post_data.form == "enable_disable_script") {
		await db.run("UPDATE scripts SET enabled=? WHERE owner_id=? AND name=?",
			[!!post_data.enabled, user.id, script_name])
	}
	if(title_changed) {
		serve(null, null, {
			redirect: "/script_manager/edit/" + new_title + "/"
		});
	}
	return await dispage("script_edit", {
		message
	}, req, serve, vars, evars);
}