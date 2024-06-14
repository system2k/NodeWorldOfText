var utils = require("../../utils/utils.js");
var http_time = utils.http_time;

module.exports.GET = async function(req, write, server, ctx, params) {
	var cookies = ctx.cookies;
	var render = ctx.render;

	var db = server.db;
	var new_token = server.new_token;
	var accountSystem = server.accountSystem;
	var uvias = server.uvias;
	
	if(accountSystem == "uvias") {
		return write(null, null, {
			redirect: uvias.loginPath
		});
	}

	var data = {
		form_errors: params.errors, // "Your username and password didn't match. Please try again."
		csrftoken: new_token(32),
		message: params.message,
		username: params.username
	};

	write(render("registration/login.html", data));
}

module.exports.POST = async function(req, write, server, ctx, params) {
	var cookies = ctx.cookies;
	var post_data = ctx.post_data;
	var referer = ctx.referer;
	var callPage = ctx.callPage;

	var db = server.db;
	var checkHash = server.checkHash;
	var new_token = server.new_token;
	var ms = server.ms;
	var querystring = server.querystring;
	var url = server.url;
	var accountSystem = server.accountSystem;
	
	if(accountSystem == "uvias") return;

	var username = post_data.username;
	var password = post_data.password;
	if(params.registered) {
		username = params.username;
		password = params.password;
	}

	var loginuser = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);
	if(!loginuser) {
		return await callPage("accounts/login", {errors: true, username});
	}
	var valid = checkHash(loginuser.password, password);
	if(!valid) { // wrong password
		return await callPage("accounts/login", {errors: true, username});
	}

	var date_now = Date.now();
	var expires = date_now + ms.month;

	var sessionid = new_token(32);
	var new_cookie = "sessionid=" + sessionid + "; expires=" + http_time(expires) + "; path=/; HttpOnly;";

	var data = {
		type: "sessionid_auth",
		date: date_now,
		csrftoken: cookies.csrftoken,
		id: loginuser.id,
		username: loginuser.username
	}

	await db.run("INSERT INTO auth_session VALUES(?, ?, ?)", [sessionid, JSON.stringify(data), expires]);
	await db.run("UPDATE auth_user SET last_login=? WHERE id=?", [date_now, loginuser.id]);

	var next = "/accounts/profile/";
	var check_next = querystring.parse(url.parse(referer).query);
	if(check_next.next) {
		next = check_next.next;
	}

	write(null, null, {
		cookie: new_cookie,
		redirect: next
	});
}