module.exports.GET = async function(req, serve, vars, evars, params) {
	var cookies = evars.cookies;
	var HTML = evars.HTML;

	var db = vars.db;
	var new_token = vars.new_token;
	var accountSystem = vars.accountSystem;
	var uvias = vars.uvias;
	
	if(accountSystem == "uvias") {
		return serve(null, null, {
			redirect: uvias.loginPath
		});
	}

	var data = {
		form_errors: params.errors, // "Your username and password didn't match. Please try again."
		csrftoken: new_token(32),
		message: params.message,
		username: params.username
	};

	serve(HTML("registration/login.html", data));
}

module.exports.POST = async function(req, serve, vars, evars, params) {
	var cookies = evars.cookies;
	var post_data = evars.post_data;
	var referer = evars.referer;

	var db = vars.db;
	var checkHash = vars.checkHash;
	var new_token = vars.new_token;
	var http_time = vars.http_time;
	var ms = vars.ms;
	var querystring = vars.querystring;
	var url = vars.url;
	var dispage = vars.dispage;
	var accountSystem = vars.accountSystem;
	
	if(accountSystem == "uvias") return;

	var username = post_data.username;
	var password = post_data.password;
	if(params.registered) {
		username = params.username;
		password = params.password;
	}

	var loginuser = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username)
	if(!loginuser) {
		return await dispage("login", {errors: true, username}, req, serve, vars, evars);
	}
	var valid = checkHash(loginuser.password, password)
	if(!valid) { // wrong password
		return await dispage("login", {errors: true, username}, req, serve, vars, evars);
	}

	var date_now = Date.now();
	var expires = date_now + ms.month;

	var sessionid = new_token(32);
	var new_cookie = "sessionid=" + sessionid + "; expires=" + http_time(expires) + "; path=/;";

	var data = {
		type: "sessionid_auth",
		date: date_now,
		csrftoken: cookies.csrftoken,
		id: loginuser.id,
		username: loginuser.username
	}

	await db.run("INSERT INTO auth_session VALUES(?, ?, ?)", [sessionid, JSON.stringify(data), expires])
	await db.run("UPDATE auth_user SET last_login=? WHERE id=?", [date_now, loginuser.id])

	var next = "/accounts/profile/";
	var check_next = querystring.parse(url.parse(referer).query);
	if(check_next.next) {
		next = check_next.next;
	}

	serve(null, null, {
		cookie: new_cookie,
		redirect: next
	});
}