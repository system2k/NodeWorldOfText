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
	var getUserIdFromUsername = server.getUserIdFromUsername;
	var getUsernameFromUserId = server.getUsernameFromUserId;

	if(!user.superuser) {
		return write(null, 403);
	}

	let username = query_data.username;
	let uid = query_data.uid;

	if(username) {
		let r_uid = await getUserIdFromUsername(username);
		if(!r_uid) {
			return write(null, 404);
		}
		return write(String(r_uid));
	} else if(uid) {
		let r_username = await getUsernameFromUserId(uid);
		if(!r_username) {
			return write(null, 404);
		}
		return write(String(r_username));
	}

	write(null, 400);
}
