var utils = require("../../utils/utils.js");
var san_nbr = utils.san_nbr;

// var restrictions = require("../../../utils/restrictions.js");
// var ipaddress = require("../../../framework/ipaddress.js");

// var reconIP = ipaddress.reconIP;

async function resolveUsernameToUid(uvias, db, accountSystem, username) {
	if(!username) return null;
	if(accountSystem == "uvias") {
		var db_user = await uvias.get("SELECT to_hex(uid) AS uid FROM accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!db_user) return null;
		return "x" + db_user.uid;
	} else if(accountSystem == "local") {
		var db = server.db;
		var db_user = await db.get("SELECT id FROM auth_user WHERE username=? COLLATE NOCASE", username);
		if(!db_user) return null;
		return db_user.id;
	}
	return null;
}

async function resolveUidToUsername(uvias, db, accountSystem, uid) {
	if(!uid) return null;
	var user_info;
	if(accountSystem == "uvias") {
		uid = uid.toLowerCase();
		if(uid.charAt(0) == "x") uid = uid.substr(1);

		var id_valid = true;
		var id_alpha = "0123456789abcdef";
		if(uid.length < 1 || user_id.uid > 16) id_valid = false;
		for(var i = 0; i < uid.length; i++) {
			if(id_alpha.indexOf(uid.charAt(i)) == -1) {
				id_valid = false;
			}
		}
		if(!id_valid) return null;

		var d_inf = await uvias.get("SELECT username FROM accounts.users WHERE uid=('x'||lpad($1::text,16,'0'))::bit(64)::bigint", uid);
		console.log({d_inf})

		return d_inf.username;
	} else if(accountSystem == "local") {
		user_info = await db.get("SELECT * FROM auth_user WHERE id=?", uid);
		if(!user_info) {
			return null;
		}
		return user_info.username;
	}
	return null;
}

module.exports.GET = async function(req, write, server, ctx, params) {
	var user = ctx.user;
	var query_data = ctx.query_data;
	var db_misc = server.db_misc;
	var db = server.db;
	var uvias = server.uvias;
	var accountSystem = server.accountSystem;

	if(!user.superuser) {
		return write(null, 403);
	}

	let after =	query_data.after != undefined ? san_nbr(query_data.after) : 0;
	let limit = query_data.limit != undefined ? san_nbr(query_data.limit) : 50;
	let include_status = Boolean(query_data.include_status);
	limit = Math.min(Math.max(limit, 0), 50);

	var siteWhitelistStatus = server.siteWhitelistStatus;

	var whitelistRules = await db_misc.all("SELECT * FROM site_whitelist WHERE id >= ? LIMIT ?", [after, limit]);
	for(let i = 0; i < whitelistRules.length; i++) {
		let rule = whitelistRules[i];
		if(rule.id_type == "user") {
			rule.username = await resolveUidToUsername(uvias, db, accountSystem, rule.user_id);
		}
	}

	write(JSON.stringify({
		status: include_status ? Object.fromEntries(siteWhitelistStatus) : undefined,
		rules: whitelistRules
	}), null, {
		mime: "application/json"
	});
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	// var callPage = ctx.callPage;

	// var saveRestrictions = server.saveRestrictions;

	if(!user.superuser) {
		return await callPage("404");
	}

	console.log(post_data)

	write(JSON.stringify({}), null, {
		mime: "application/json"
	});

	/*let action = post_data.kind;
	let rules = JSON.parse(post_data.rules);

	let list = restrictions.getRestrictionsFlatListStr();

	if(action == "prepend") {
		let merged = [
			...rules,
			...list
		];
		let result = restrictions.procRest(merged);
		restrictions.setRestrictions(result.groups);
		restrictions.setRestrictionsFlatList(result.raw);
		restrictions.setRestrictionsFlatListStr(result.rawStr);
		saveRestrictions("main", result.rawStr.join("\n") + "\n");
	}

	write("SUCCESS");*/
}