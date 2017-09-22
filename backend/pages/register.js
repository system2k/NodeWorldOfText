module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;

    var data = {
        user_is_authenticated: user.authenticated,
        user: user.username,

        csrftoken: user.csrftoken,
        form_username_errors    : params.form_username_errors  || [],
        form_email_errors       : params.form_email_errors     || [],
        form_password1_errors   : params.form_password1_errors || [],
        form_password2_errors   : params.form_password2_errors || []
    };

    serve(template_data["registration/registration_form.html"](data))
}

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var encryptHash = vars.encryptHash;

    if(post_data.csrfmiddlewaretoken != user.csrftoken) { // csrftokens not matching?
        serve();
    }

    var username = post_data.username;
    var email = post_data.email;
    var password1 = post_data.password1;
    var password2 = post_data.password2;

    var form_username_errors = [];
    var form_email_errors = [];
    var form_password1_errors = [];
    var form_password2_errors = [];

    if(password1 != password2) {
        form_password2_errors.push("Passwords do not match")
    } else if(password1.length > 128) {
        form_password1_errors.push("The password is too long. It must be 128 characters or less")
    } else if(password1.length < 5) {
        form_password1_errors.push("The password is too short. It must be 5 characters or more.")
    }

    if(password1 == "") {
        form_password1_errors.push("Enter a password")
    }

    if(username.length > 30) {
        form_username_errors.push("The username must be 30 characters or less")
    } else if(username.length < 1) {
        form_username_errors.push("The username is too short")
    } else if(!username.match(/^(\w*)$/g)) {
        form_username_errors.push("The username must contain the following characters: a-z A-Z 0-9 _")
    }
    
    if(email.length > 75) {
        form_email_errors.push("The email must be 75 characters or less")
    }

    var reg = await db.get("SELECT username FROM auth_user WHERE username=? COLLATE NOCASE", username);

    if(reg) {
        form_username_errors.push("The user already exists")
    }

    if(form_username_errors.length  > 0 || // is there a better way to format this?
        form_email_errors.length     > 0 ||
        form_password1_errors.length > 0 ||
        form_password2_errors.length > 0) {
         return await dispage("register", {
             form_username_errors,
             form_email_errors,
             form_password1_errors,
             form_password2_errors
         }, req, serve, vars)
    }

    var date = Date.now();
    var password_hash = encryptHash(password1);
    await db.run("INSERT INTO auth_user VALUES(null, ?, '', '', ?, ?, 0, 1, 0, ?, ?)",
        [username, email, password_hash, date, date])

    await dispage("login", {
        username: username,
        password: password1,
        registered: true
    }, req, serve, vars, "POST")
}