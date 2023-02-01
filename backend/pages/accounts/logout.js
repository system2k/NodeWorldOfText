var utils = require("../../utils/utils.js");
var checkDuplicateCookie = utils.checkDuplicateCookie;
var http_time = utils.http_time;

module.exports.GET = async function(req, write, server, ctx) {
	var cookies = ctx.cookies;
	var query_data = ctx.query_data;

	var db = server.db;
	var accountSystem = server.accountSystem;
	var uvias = server.uvias;
	
	var logoutReturn = query_data.return;
	if(accountSystem == "uvias") {
		if(logoutReturn) {
			var logoutCookies = [];

			var hostnameAvailable = false;
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
					logoutCookies.push("token=; expires=" + http_time(0) + "; path=/; domain=" + wildcardHost + "; HttpOnly;");
				}
				hostnameAvailable = true;
			}

			logoutCookies.push("token=; expires=" + http_time(0) + "; path=/; HttpOnly;");
			if(hostnameAvailable && host.length == 2 && host[0] == "ourworldoftext") {
				logoutCookies.push("token=; expires=" + http_time(0) + "; path=/; domain=www.ourworldoftext.com; HttpOnly;");
			}

			return write(null, null, {
				cookie: logoutCookies,
				redirect: logoutReturn
			});
		}
		return write(null, null, {
			redirect: uvias.logoutPath
		});
	}

	if(cookies.sessionid) {
		await db.run("DELETE FROM auth_session WHERE session_key=?", cookies.sessionid);
	}

	write(null, null, {
		cookie: "sessionid=; expires=" + http_time(0) + "; path=/",
		redirect: "/home/"
	});
}