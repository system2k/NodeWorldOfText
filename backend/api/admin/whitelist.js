var utils = require("../../utils/utils.js");
var san_nbr = utils.san_nbr;

// var restrictions = require("../../../utils/restrictions.js");
// var ipaddress = require("../../../framework/ipaddress.js");

// var reconIP = ipaddress.reconIP;

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