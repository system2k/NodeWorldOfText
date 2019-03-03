var emailFormatRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;

    var data = {
        csrftoken: user.csrftoken,
        form_username_errors    : params.form_username_errors  || [],
        form_email_errors       : params.form_email_errors     || [],
        form_password1_errors   : params.form_password1_errors || [],
        form_password2_errors   : params.form_password2_errors || [],

        // refill form for inputs that passed
        username: params.username,
        email: params.email,
        password1: params.password
    };

    serve(HTML("registration/registration_form.html", data));
}

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var encryptHash = vars.encryptHash;
    var send_email = vars.send_email;
    var crypto = vars.crypto;
    var website = vars.website;
    var template_data = vars.template_data;
    var handle_error = vars.handle_error;
    var ms = vars.ms;
    var new_token = vars.new_token;
    var cookie_expire = vars.cookie_expire;
    var cookies = vars.cookies;
    var testEmailAddress = vars.testEmailAddress;

    if(post_data.csrfmiddlewaretoken != user.csrftoken) { // csrftokens not matching?
        return serve();
    }

    if(typeof post_data.username != "string") post_data.username = "";
    if(typeof post_data.email != "string") post_data.email = "";
    if(typeof post_data.password1 != "string") post_data.password1 = "";
    if(typeof post_data.password2 != "string") post_data.password2 = "";

    var username = post_data.username;
    var email = post_data.email.trim().replace(/\0/g, "");
    var password1 = post_data.password1;
    var password2 = post_data.password2;

    var checkEmailFormat = true;
    if(email.toLowerCase() == testEmailAddress) {
        checkEmailFormat = false;
    }

    var form_username_errors = [];
    var form_email_errors = [];
    var form_password1_errors = [];
    var form_password2_errors = [];

    if(password1 != password2) {
        form_password2_errors.push("Passwords do not match");
    } else if(password1.length > 128) {
        form_password1_errors.push("The password is too long. It must be 128 characters or less");
    } else if(password1.length < 3) {
        form_password1_errors.push("The password is too short. It must be 3 characters or more");
    }

    if(password1 == "") {
        form_password1_errors.push("Password cannot be blank");
    }

    if(username.length > 30) {
        form_username_errors.push("The username must be 30 characters or less.");
    } else if(username.length < 1) {
        form_username_errors.push("The username is too short.");
    } else if(!username.match(/^([\w\.\-]*)$/g)) {
        form_username_errors.push("The username must contain the following characters: a-z A-Z 0-9 _ . -");
    }
    
    if(email.length > 256) {
        form_email_errors.push("The email must be 256 characters or less.");
    } else if(!email.match(emailFormatRegex) && email != "" && checkEmailFormat) {
        form_email_errors.push("Invalid email.");
    }

    var reg = await db.get("SELECT username FROM auth_user WHERE username=? COLLATE NOCASE",
        username);

    if(reg) {
        form_username_errors.push("The user already exists.");
    }

    if(form_username_errors.length  ||
       form_email_errors.length     ||
       form_password1_errors.length ||
       form_password2_errors.length) {
         return await dispage("register", {
             form_username_errors,
             form_email_errors,
             form_password1_errors,
             form_password2_errors,

             username: form_username_errors.length > 0 ? "" : username,
             email: form_email_errors.length > 0 ? "" : email,
             password: form_password1_errors.length > 0 ? "" : password1
         }, req, serve, vars);
    }

    var date = Date.now();
    var password_hash = encryptHash(password1);
    var ins = await db.run("INSERT INTO auth_user VALUES(null, ?, ?, ?, 0, 0, ?, ?)",
        [username, email, password_hash, date, date]);
    var user_id = ins.lastID;

    if(!email) {
        await db.run("UPDATE auth_user SET is_active=1 WHERE id=?", user_id);
    }
    await dispage("login", {
        username: username,
        password: password1,
        registered: true
    }, req, serve, vars, "POST");
}