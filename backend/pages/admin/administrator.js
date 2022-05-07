module.exports.GET = async function(req, serve, vars, evars, params) {
	var HTML = evars.HTML;
	var user = evars.user;

	var dispage = vars.dispage;
	var db = vars.db;
	var announcement = vars.announcement;
	var uptime = vars.uptime;
	var wss = vars.wss;
	var get_bypass_key = vars.get_bypass_key;
	var ranks_cache = vars.ranks_cache;
	var db_misc = vars.db_misc;
	var uvias = vars.uvias;
	var accountSystem = vars.accountSystem;
	var acme = vars.acme;
	var createCSRF = vars.createCSRF;

	// not a superuser...
	if(!user.superuser) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var client_num = 0;
	wss.clients.forEach(function(client) {
		if(!client.sdata) return;
		if(!client.sdata.userClient) return;
		client_num++;
	});

	var custom_ranks = [
		{ level: 0, name: "Default" },
		{ level: 1, name: "Staff" },
		{ level: 2, name: "Superuser" },
		{ level: 3, name: "Operator" }
	];
	var custom_count = ranks_cache.count;
	var custom_ids = ranks_cache.ids;
	for(var i = 0; i < custom_count; i++) {
		var level = i + 4;
		for(var x = 0; x < custom_ids.length; x++) {
			var cid = custom_ids[x];
			if(ranks_cache[cid].level == level) {
				custom_ranks.push({ level, name: ranks_cache[cid].name });
				break;
			}
		}
	}

	var user_ranks;
	if(accountSystem == "uvias") {
		var admin_ranks = await db_misc.all("SELECT * FROM admin_ranks ORDER BY level DESC");
		user_ranks = [];
		for(var i = 0; i < admin_ranks.length; i++) {
			var adr = admin_ranks[i];
			var uid = adr.id.substr(1);
			var level = adr.level;
	
			var username = "deleted~" + uid;
	
			var usr_data = await uvias.get("SELECT * FROM accounts.users WHERE uid=('x'||lpad($1::text,16,'0'))::bit(64)::bigint", uid);
			if(usr_data) {
				username = usr_data.username;
			}
	
			user_ranks.push({
				level,
				username
			});
		}
	} else if(accountSystem == "local") {
		user_ranks = await db.all("SELECT * FROM auth_user WHERE level > 0 ORDER BY level DESC");
	}

	var csrftoken = createCSRF(user.id, 0);

	var data = {
		user_ranks,
		announcement: announcement(),
		announcement_update_msg: params.announcement_update_msg,
		cons_update_msg: params.cons_update_msg,
		acme_update_msg: params.acme_update_msg,
		uptime: uptime(),
		machine_uptime: uptime(process.hrtime()[0] * 1000),
		client_num,
		bypass_key: get_bypass_key(),
		custom_ranks,
		acme_enabled: acme.enabled,
		acme_pass: acme.enabled ? (acme.pass ? acme.pass : "") : "",
		csrftoken
	};

	serve(HTML("administrator.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var user = evars.user;

	var dispage = vars.dispage;
	var announce = vars.announce;
	var db = vars.db;
	var db_misc = vars.db_misc;
	var db_edits = vars.db_edits;
	var modify_bypass_key = vars.modify_bypass_key;
	var stopServer = vars.stopServer;
	var acme = vars.acme;
	var checkCSRF = vars.checkCSRF;

	if(!user.superuser) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return serve("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	if("set_acme_pass" in post_data) {
		var new_acme_pass = post_data.set_acme_pass;
		var acme_update_msg = "";
		if(post_data.acme_enable) {
			if(typeof new_acme_pass == "string" && new_acme_pass.length >= 1) {
				acme.pass = new_acme_pass;
				acme.enabled = true;
				acme_update_msg = "Updated ACME password and enabled ACME";
			} else {
				acme_update_msg = "Invalid ACME password";
			}
		} else if(post_data.acme_disable) {
			acme.pass = null;
			acme.enabled = false;
			acme_update_msg = "ACME disabled";
		}
		return await dispage("admin/administrator", {
			acme_update_msg
		}, req, serve, vars, evars);
	}
	if("set_bypass_key" in post_data) {
		var new_bypass_key = post_data.set_bypass_key;
		modify_bypass_key(new_bypass_key);
		return await dispage("admin/administrator", {
			cons_update_msg: "Bypass key updated successfully"
		}, req, serve, vars, evars);
	}
	if("announcement" in post_data) {
		var new_announcement = post_data.announcement;
		await announce(new_announcement);
	
		await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)",
			[user.id, 0, 0, 0, Date.now(), "@" + JSON.stringify({
				kind: "administrator_announce",
				post_data: {
					announcement: post_data.announcement,
				},
				user: {
					id: user.id,
					username: user.username
				}
			})]);
	
		return await dispage("admin/administrator", {
			announcement_update_msg: "Announcement updated"
		}, req, serve, vars, evars);
	}
	if("manage_server" in post_data) {
		if(!user.operator) return;
		var cmd = post_data.manage_server;
		if(cmd == "restart") {
			serve("SUCCESS");
			stopServer(true);
		}
		if(cmd == "close") {
			serve("SUCCESS");
			stopServer();
		}
		if(cmd == "maintenance") {
			serve("SUCCESS");
			stopServer(false, true);
		}
		return;
	}
}