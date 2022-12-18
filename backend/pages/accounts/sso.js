var utils = require("../../utils/utils.js");
var checkDuplicateCookie = utils.checkDuplicateCookie;
var http_time = utils.http_time;

module.exports.GET = async function(req, serve, vars, evars) {
	var query_data = evars.query_data;

	var uvias = vars.uvias;
	var accountSystem = vars.accountSystem;
	var ms = vars.ms;

	if(accountSystem == "local") return -1;

	var token = query_data.ssotoken;

	if(!token || typeof token != "string") {
		return serve("No token specified");
	}

	var cookieResponse = [];
	var hostnameAvailable = false;

	// uvias redirects you to ourworldoftext.com, preventing users from being able
	// to access their accounts on www.ourworldoftext.com
	var host = req.headers.host;
	if(typeof host == "string") {
		if(host[0] == ".") host = host.substr(1);
		if(host[host.length - 1] == ".") host = host.slice(0, -1);
		host = host.toLowerCase().split(".");
		// ".ourworldoftext.com"
		var wildcardHost = "." + host.join(".");
		// there are duplicate cookie instances from the botched July 2021 deployment
		var tokenCorrupted = checkDuplicateCookie(req.headers.cookie, "token");
		// delete cookie for ".ourworldoftext.com"
		if(tokenCorrupted) {
			cookieResponse.push("token=; expires=" + http_time(0) + "; path=/; domain=" + wildcardHost + "; HttpOnly;");
		}
		hostnameAvailable = true;
	}

	if(token.length > 1000) {
		return serve("Token is too long.");
	}
	
	var dat = await uvias.get("SELECT uid, to_hex(uid) as uid_hex, session_id, accounts.build_token(uid, session_id) as token FROM accounts.get_and_del_sso_token(decode($1::CHAR(32), 'hex'), $2::text)", [token, uvias.id]);

	if(!dat) {
		return serve("Token not found. If you are seeing this message in error, please report this to the developers.");
	}
		
	var token = dat.token;
	var session_id = dat.session_id;
	
	var session = await uvias.get("SELECT uid, to_hex(uid) as uidhex, session_id, created, expires, creator_ip, creator_ua, creator_lang FROM accounts.sessions WHERE session_id=$1::BYTEA", session_id);
	if(!session) {
		return serve("Session not found. If you are seeing this message in error, please report this to the developers.");
	}
	var expires = session.expires.getTime();
	
	cookieResponse.push("token=" + token + "; expires=" + http_time(expires + ms.year) + "; path=/; HttpOnly;");
	if(hostnameAvailable && host.length == 2 && host[0] == "ourworldoftext") {
		cookieResponse.push("token=" + token + "; expires=" + http_time(expires + ms.year) + "; path=/; domain=www.ourworldoftext.com; HttpOnly;");
	}
	serve(null, null, {
		cookie: cookieResponse,
		redirect: "/accounts/profile/"
	});
}