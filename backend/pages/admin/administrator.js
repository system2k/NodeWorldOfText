var utils = require("../../utils/utils.js");
var uptime = utils.uptime;

module.exports.GET = async function(req, write, server, ctx, params) {
	var HTML = ctx.HTML;
	var user = ctx.user;

	var dispage = server.dispage;
	var db = server.db;
	var announcement = server.announcement;
	var wss = server.wss;
	var ranks_cache = server.ranks_cache;
	var db_misc = server.db_misc;
	var uvias = server.uvias;
	var accountSystem = server.accountSystem;
	var acme = server.acme;
	var createCSRF = server.createCSRF;
	var getClientVersion = server.getClientVersion;

	// not a superuser...
	if(!user.superuser) {
		return await dispage("404", null, req, write, server, ctx);
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
		custom_ranks,
		acme_enabled: acme.enabled,
		acme_pass: acme.enabled ? (acme.pass ? acme.pass : "") : "",
		client_version: getClientVersion(),
		csrftoken
	};

	write(HTML("administrator.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;

	var dispage = server.dispage;
	var announce = server.announce;
	var db = server.db;
	var db_misc = server.db_misc;
	var db_edits = server.db_edits;
	var stopServer = server.stopServer;
	var acme = server.acme;
	var checkCSRF = server.checkCSRF;
	var setClientVersion = server.setClientVersion;

	if(!user.superuser) {
		return await dispage("404", null, req, write, server, ctx);
	}

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
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
		}, req, write, server, ctx);
	}
	if("set_cli_version" in post_data) {
		var new_cli_version = post_data.set_cli_version;
		if(setClientVersion(new_cli_version)) {
			return await dispage("admin/administrator", {
				cons_update_msg: "Client version updated successfully"
			}, req, write, server, ctx);
		}
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
		}, req, write, server, ctx);
	}
	if("manage_server" in post_data) {
		if(!user.operator) return;
		var cmd = post_data.manage_server;
		if(cmd == "restart") {
			write("SUCCESS");
			stopServer(true);
		}
		if(cmd == "close") {
			write("SUCCESS");
			stopServer();
		}
		if(cmd == "maintenance") {
			write("SUCCESS");
			stopServer(false, true);
		}
		return;
	}
}