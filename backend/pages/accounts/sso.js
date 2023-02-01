var utils = require("../../utils/utils.js");
var checkDuplicateCookie = utils.checkDuplicateCookie;
var http_time = utils.http_time;

module.exports.GET = async function(req, write, server, ctx) {
	var query_data = ctx.query_data;

	var uvias = server.uvias;
	var accountSystem = server.accountSystem;
	var ms = server.ms;

	if(accountSystem == "local") return -1;

	var token = query_data.ssotoken;

	if(!token || typeof token != "string") {
		return write("No token specified");
	}

	var cookieResponse = [];

	if(token.length > 1000) {
		return write("Token is too long.");
	}
	
	var dat = await uvias.get("SELECT uid, to_hex(uid) as uid_hex, session_id, accounts.build_token(uid, session_id) as token FROM accounts.get_and_del_sso_token(decode($1::CHAR(32), 'hex'), $2::text)", [token, uvias.id]);

	if(!dat) {
		return write("Token not found. If you are seeing this message in error, please report this to the developers.");
	}
		
	var token = dat.token;
	var session_id = dat.session_id;
	
	var session = await uvias.get("SELECT uid, to_hex(uid) as uidhex, session_id, created, expires, creator_ip, creator_ua, creator_lang FROM accounts.sessions WHERE session_id=$1::BYTEA", session_id);
	if(!session) {
		return write("Session not found. If you are seeing this message in error, please report this to the developers.");
	}
	var expires = session.expires.getTime();
	
	cookieResponse.push("token=" + token + "; expires=" + http_time(expires + ms.year) + "; path=/; HttpOnly;");
	write(null, null, {
		cookie: cookieResponse,
		redirect: "/accounts/profile/"
	});
}