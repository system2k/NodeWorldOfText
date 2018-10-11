module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;
    var new_token = vars.new_token;

    var data = {
        form_errors: params.errors, // "Your username and password didn't match. Please try again."
        csrftoken: new_token(32),
        message: params.message,
        username: params.username
    };

    serve(HTML("registration/login.html", data));
}

module.exports.POST = async function(req, serve, vars, params) {
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;
    var checkHash = vars.checkHash;
    var new_token = vars.new_token;
    var cookie_expire = vars.cookie_expire;
    var ms = vars.ms;
    var querystring = vars.querystring;
    var referer = vars.referer;
    var url = vars.url;
    var dispage = vars.dispage;

    var username = post_data.username;
    var password = post_data.password;
    if(params.registered) {
        username = params.username;
        password = params.password;
    }

    var loginuser = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username)
    if(!loginuser) {
        return await dispage("login", {errors: true, username}, req, serve, vars)
    }
    var valid = checkHash(loginuser.password, password)
    if(!valid) { // wrong password
        return await dispage("login", {errors: true, username}, req, serve, vars)
    }

    if(!loginuser.is_active) {
        return await dispage("login", {
            errors: true, message: "User is not activated yet", username
        }, req, serve, vars)
    }

    var date_now = Date.now();
    var expires = date_now + ms.Month;

    var sessionid = new_token(32);
    var new_cookie = "sessionid=" + sessionid + "; expires=" +
        cookie_expire(expires) + "; path=/;";

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
    var check_next = querystring.parse(url.parse(referer).query)
    if(check_next.next) {
        next = check_next.next;
    }

    serve(null, null, {
        cookie: new_cookie,
        redirect: next
    })
}