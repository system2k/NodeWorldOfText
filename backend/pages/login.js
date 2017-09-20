module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;
    var new_token = vars.new_token;

    var data = {
        user_is_authenticated: user.authenticated,
        user: user.username,
        form_errors: false, // "your passwords didn't match",
        csrftoken: new_token(32)
    };

    serve(template_data["registration/login.html"](data))
}

module.exports.POST = async function(req, serve, vars) {
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;
    var checkHash = vars.checkHash;
    var new_token = vars.new_token;
    var cookie_expire = vars.cookie_expire;
    var ms = vars.ms;

    var username = post_data.username;
    var password = post_data.password;

    var user = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username)
    if(!user) {
        return serve("User does not exist")
    }
    var valid = checkHash(user.password, password)
    if(!valid) { // wrong password
        return serve("Wrong password")
    }

    var date_now = Date.now();
    var expires = date_now + ms.Month;

    var sessionid = new_token(32);
    var new_cookie = "sessionid=" + sessionid + "; expires=" +
        cookie_expire(expires) + "; path=/";

    var data = {
        type: "sessionid_auth",
        date: date_now,
        csrftoken: cookies.csrftoken,
        id: user.id,
        username: user.username
    }

    db.run("INSERT INTO auth_session VALUES(?, ?, ?)", [sessionid, JSON.stringify(data), expires])
    db.run("UPDATE auth_user SET last_login=? WHERE id=?", [date_now, user.id])

    serve("Success", null, {
        cookie: new_cookie,
        redirect: "/accounts/profile/"
    })
}