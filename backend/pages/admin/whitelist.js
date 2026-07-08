var restrictions = require("../../utils/restrictions.js");
var procRest = restrictions.procRest;
var procCoal = restrictions.procCoal;
var setRestrictions = restrictions.setRestrictions;
var setRestrictionsFlatList = restrictions.setRestrictionsFlatList;
var setRestrictionsFlatListStr = restrictions.setRestrictionsFlatListStr;
var setCoalition = restrictions.setCoalition;

module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	var user = ctx.user;
	var createCSRF = server.createCSRF;
	var db_misc = server.db_misc;

	if(!user.superuser) return;

	var siteWhitelistCache = server.siteWhitelistCache;
	var siteWhitelistStatus = server.siteWhitelistStatus;

	console.log(siteWhitelistCache)
	console.log(siteWhitelistStatus)

	var csrftoken = createCSRF(user.id.toString(), 0);

	write(render("administrator_whitelist.html", {
		csrftoken,
		status: JSON.stringify(Object.fromEntries(siteWhitelistStatus.entries())),
		cache: JSON.stringify({
			ip: Object.fromEntries(siteWhitelistCache.ip.entries()),
			user: Object.fromEntries(siteWhitelistCache.user.entries()),
			world: Object.fromEntries(siteWhitelistCache.world.entries())
		})
	}));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	var query_data = ctx.query_data;

	var checkCSRF = server.checkCSRF;
	var saveRestrictions = server.saveRestrictions;

	if(!user.superuser) return;
	var csrftoken = req.headers["x-csrf-token"];
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed");
	}

	var db_misc = server.db_misc;
	var accountSystem = server.accountSystem;
	var uvias = server.uvias;

	/*// Check if action is save_status
	if(query_data.action === 'save_status') {
		// Expect JSON payload with { status: { code: 'public'|'authenticated'|'whitelisted' } }
		var body = null;
		try {
			body = JSON.parse(post_data.toString("utf8"));
		} catch(e) {
			return write("Invalid JSON");
		}

		if(!body || !body.status) return write("No status submitted");

		// Map string status to numeric: 'public' -> 0, 'authenticated' -> 1, 'whitelisted' -> 2
		var statusMap = { 'public': 0, 'authenticated': 1, 'whitelisted': 2 };

		for(var code in body.status) {
			var statusVal = body.status[code];
			var numStatus = statusMap[statusVal] != null ? statusMap[statusVal] : 0;
			
			// Update or insert
			await db_misc.run("UPDATE site_whitelist_status SET status=? WHERE code=?", [numStatus, code]);
		}

		// refresh cache
		let statusRows = await db_misc.all("SELECT code, status FROM site_whitelist_status");
		let status = {};
		statusRows.forEach(row => {
			var statusMap = { 0: 'public', 1: 'authenticated', 2: 'whitelisted' };
			status[row.code] = statusMap[row.status] || 'public';
		});
		server.siteWhitelistStatus = status;

		return write("SUCCESS");
	}*/


	/*// helper to resolve username to uid string if needed
	async function resolveUsernameToUid(username) {
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
	}*/

	

	write("SUCCESS");
}