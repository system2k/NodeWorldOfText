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

	let username = query_data.username;
	let userObject = null;

	if(accountSystem == "uvias") {
		var db_user = await uvias.get("SELECT to_hex(uid) AS uid FROM accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!db_user) return write(null, 404);
		userObject = {
			id: "x" + db_user.uid
		};
	} else if(accountSystem == "local") {
		var db = server.db;
		var db_user = await db.get("SELECT id FROM auth_user WHERE username=? COLLATE NOCASE", username);
		if(!db_user) return write(null, 404);
		userObject = {
			id: db_user.id
		};
	}

	if(!userObject) {
		return write(null, 400);
	}

	write(JSON.stringify(userObject), null, {
		mime: "application/json"
	});
}
