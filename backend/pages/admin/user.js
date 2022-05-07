module.exports.GET = async function(req, serve, vars, evars, params) {
	var path = evars.path;
	var HTML = evars.HTML;
	var user = evars.user;

	var checkURLParam = vars.checkURLParam;
	var db = vars.db;
	var dispage = vars.dispage;
	var db_misc = vars.db_misc;
	var uvias = vars.uvias;
	var accountSystem = vars.accountSystem;
	var createCSRF = vars.createCSRF;

	if(!user.operator) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var username = checkURLParam("/administrator/user/:username", path).username;
	
	var user_edit;
	if(accountSystem == "uvias") {
		var db_user = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!db_user) {
			return await dispage("404", null, req, serve, vars, evars);
		}
		var uid = db_user.uid;
		uid = "x" + uid;
		var user_rank = await db_misc.get("SELECT level FROM admin_ranks WHERE id=?", [uid]);
		if(user_rank) {
			user_rank = user_rank.level;
		} else {
			user_rank = 0;
		}
		user_edit = {
			username: db_user.username,
			level: user_rank
		};
	} else if(accountSystem == "local") {
		user_edit = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);
		if(!user_edit) {
			return await dispage("404", null, req, serve, vars, evars);
		}
	}

	var csrftoken = createCSRF(user.id, 0);

	var data = {
		user_edit,
		message: params.message,
		csrftoken
	};

	serve(HTML("administrator_user.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var path = evars.path;
	var user = evars.user;

	var db = vars.db;
	var db_edits = vars.db_edits;
	var checkURLParam = vars.checkURLParam;
	var dispage = vars.dispage;
	var url = vars.url;
	var uvias = vars.uvias;
	var db_misc = vars.db_misc;
	var accountSystem = vars.accountSystem;
	var checkCSRF = vars.checkCSRF;

	if(!user.operator) {
		return;
	}

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return serve("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	var username = checkURLParam("/administrator/user/:username", path).username;

	var user_edit;
	if(accountSystem == "uvias") {
		var db_user = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!db_user) {
			return;
		}
		var uid = db_user.uid;
		var edit_username = db_user.username;
		uid = "x" + uid;
		var db_rank = await db_misc.get("SELECT level FROM admin_ranks WHERE id=?", [uid]);
		user_edit = {
			id: uid,
			username: edit_username
		};
	} else if(accountSystem == "local") {
		user_edit = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);
		if(!user_edit) {
			return;
		}
	}

	if(user_edit.id == user.id) {
		return await dispage("admin/user", {
			message: "You cannot set your own rank"
		}, req, serve, vars, evars);
	}

	if(post_data.form == "rank") {
		var rank = -1;
		if(post_data.rank == "operator") rank = 3;
		if(post_data.rank == "superuser") rank = 2;
		if(post_data.rank == "staff") rank = 1;
		if(post_data.rank == "default") rank = 0;
		if(rank > -1) {
			if(accountSystem == "uvias") {
				if(db_rank) {
					if(rank) {
						await db_misc.run("UPDATE admin_ranks SET level=? WHERE id=?", [rank, uid]);
					} else {
						await db_misc.run("DELETE FROM admin_ranks WHERE id=?", [uid]);
					}
				} else {
					if(rank) {
						await db_misc.run("INSERT INTO admin_ranks VALUES(?, ?)", [uid, rank]);
					}
				}
			} else if(accountSystem == "local") {
				await db.run("UPDATE auth_user SET level=? WHERE id=?", [rank, user_edit.id]);
			}
			await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)",
				[user.id, 0, 0, 0, Date.now(), "@" + JSON.stringify({
					kind: "administrator_user",
					user_edit: {
						id: user_edit.id,
						username: user_edit.username
					},
					rank: rank
				})]);
		} else {
			return serve("Invalid rank");
		}
		return await dispage("admin/user", {
			message: "Successfully set " + user_edit.username + "'s rank to " + ["Default", "Staff", "Superuser", "Operator"][rank]
		}, req, serve, vars, evars);
	}

	serve(null, null, {
		redirect: url.parse(req.url).pathname
	});
}