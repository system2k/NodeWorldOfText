module.exports.GET = async function(req, serve, vars, evars) {
	var cookies = evars.cookies;
	var query_data = evars.query_data;

	var db = vars.db;
	var http_time = vars.http_time;
	var accountSystem = vars.accountSystem;
	var uvias = vars.uvias;
	var checkDuplicateCookie = vars.checkDuplicateCookie;
	
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

			return serve(null, null, {
				cookie: logoutCookies,
				redirect: logoutReturn
			});
		}
		return serve(null, null, {
			redirect: uvias.logoutPath
		});
	}

	if(cookies.sessionid) {
		await db.run("DELETE FROM auth_session WHERE session_key=?", cookies.sessionid);
	}

	serve(null, null, {
		cookie: "sessionid=; expires=" + http_time(0) + "; path=/",
		redirect: "/home/"
	});
}