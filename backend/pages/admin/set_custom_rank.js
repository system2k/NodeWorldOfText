var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;
var san_nbr = utils.san_nbr;

module.exports.GET = async function(req, serve, vars, evars, params) {
	var path = evars.path;
	var HTML = evars.HTML;
	var user = evars.user;

	var db = vars.db;
	var dispage = vars.dispage;
	var ranks_cache = vars.ranks_cache;
	var uvias = vars.uvias;
	var accountSystem = vars.accountSystem;
	var createCSRF = vars.createCSRF;

	if(!user.superuser) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var username = checkURLParam("/administrator/set_custom_rank/:username", path).username;

	var user_edit;
	if(accountSystem == "uvias") {
		var duser = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!duser) {
			return await dispage("404", null, req, serve, vars, evars);
		}
		user_edit = {
			id: "x" + duser.uid,
			username: duser.username
		};
	} else if(accountSystem == "local") {
		user_edit = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);
		if(!user_edit) {
			return await dispage("404", null, req, serve, vars, evars);
		}
	}

	var custom_ranks = [];
	
	var custom_count = ranks_cache.count;
	var custom_ids = ranks_cache.ids;
	for(var i = 0; i < custom_count; i++) {
		var level = i + 4;
		for(var x = 0; x < custom_ids.length; x++) {
			var cid = custom_ids[x];
			if(ranks_cache[cid].level == level) {
				custom_ranks.push({ level, name: ranks_cache[cid].name, id: cid });
				break;
			}
		}
	}

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		user_edit,
		message: params.message,
		ranks: custom_ranks,
		current_rank: user_edit.id in ranks_cache.users ? ranks_cache.users[user_edit.id] : "none",
		csrftoken
	};

	serve(HTML("administrator_set_custom_rank.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var path = evars.path;
	var user = evars.user;

	var db = vars.db;
	var dispage = vars.dispage;
	var url = vars.url;
	var ranks_cache = vars.ranks_cache;
	var db_misc = vars.db_misc;
	var uvias = vars.uvias;
	var accountSystem = vars.accountSystem;
	var checkCSRF = vars.checkCSRF;

	if(!user.superuser) {
		return;
	}

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return serve("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	var username = checkURLParam("/administrator/set_custom_rank/:username", path).username;
	
	var user_edit;
	if(accountSystem == "uvias") {
		var duser = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!duser) {
			return;
		}
		user_edit = {
			id: "x" + duser.uid,
			username: duser.username
		};
	} else if(accountSystem == "local") {
		user_edit = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);
		if(!user_edit) {
			return;
		}
	}

	var rank = san_nbr(post_data.rank);

	var ids = ranks_cache.ids;
	if(ids.indexOf(rank) == -1 && rank != -1) return;

	var rankName = "(No custom rank)";
	if(rank > -1) {
		rankName = ranks_cache[rank].name;
	}

	var user_rank_row = await db_misc.get("SELECT * FROM user_ranks WHERE userid=?", user_edit.id);
	if(user_rank_row) {
		if(rank > -1) {
			await db_misc.run("UPDATE user_ranks SET rank=? WHERE userid=?", [rank, user_edit.id]);
		} else {
			await db_misc.run("DELETE FROM user_ranks WHERE userid=?", user_edit.id);
		}
	} else {
		if(rank > -1) {
			await db_misc.run("INSERT INTO user_ranks VALUES(?, ?)", [user_edit.id, rank]);
		}
	}
	if(rank > -1) {
		ranks_cache.users[user_edit.id] = rank;
	} else {
		delete ranks_cache.users[user_edit.id];
	}

	return await dispage("admin/set_custom_rank", {
		message: "Successfully set " + user_edit.username + "'s rank to " + rankName
	}, req, serve, vars, evars);
}