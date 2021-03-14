module.exports.GET = async function(req, serve, vars, evars) {
	var cookies = evars.cookies;
	var query_data = evars.query_data;

	var db = vars.db;
	var new_token = vars.new_token;
	var http_time = vars.http_time;
	var accountSystem = vars.accountSystem;
	var uvias = vars.uvias;
	
	var logoutReturn = query_data.return;
	if(accountSystem == "uvias") {
		if(logoutReturn) {
			return serve(null, null, {
				cookie: "token=; expires=" + http_time(0) + "; path=/; HttpOnly;",
				redirect: logoutReturn
			});
		}
		return serve(null, null, {
			redirect: uvias.logoutPath
		});
	}

	if(cookies.sessionid) {
		await db.run("DELETE FROM auth_session WHERE session_key=?", cookies.sessionid)
	}

	serve(null, null, {
		cookie: "sessionid=; expires=" + http_time(0) + "; path=/",
		redirect: "/home/"
	});
}