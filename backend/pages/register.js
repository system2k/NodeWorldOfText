var emailFormatRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

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

    if(post_data.csrfmiddlewaretoken != user.csrftoken) { // csrftokens not matching?
        return serve();
    }

    var username = post_data.username;
    var email = post_data.email.trim();
    var password1 = post_data.password1;
    var password2 = post_data.password2;

    var form_username_errors = [];
    var form_email_errors = [];
    var form_password1_errors = [];
    var form_password2_errors = [];

    if(password1 != password2) {
        form_password2_errors.push("Passwords do not match");
    } else if(password1.length > 128) {
        form_password1_errors.push("The password is too long. It must be 128 characters or less");
    } else if(password1.length < 5) {
        form_password1_errors.push("The password is too short. It must be 5 characters or more");
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
    
    if(email.length > 75) {
        form_email_errors.push("The email must be 75 characters or less")
    } else if(!email.match(emailFormatRegex) && email != "") {
        form_email_errors.push("Invalid email address.");
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
         }, req, serve, vars)
    }

    var date = Date.now();
    var password_hash = encryptHash(password1);
    var ins = await db.run("INSERT INTO auth_user VALUES(null, ?, ?, ?, 0, 0, ?, ?)",
        [username, email, password_hash, date, date]);
    var user_id = ins.lastID;

    var token = crypto.randomBytes(20).toString("hex");

    if(email) {
        await db.run("INSERT INTO registration_registrationprofile VALUES(null, ?, ?)",
            [user_id, token]);

        var subject = template_data["registration/activation_email_subject.txt"]();
        try {
            var email_send = await send_email(email, subject, template_data["registration/activation_email.txt"]({
                website,
                reg_key: "accounts/activate/" + token + "/"
            }));
        } catch(e) {
            handle_error(e);
            return await dispage("register", {
                form_email_errors: ["An internal error occured while sending the verification email"]
            }, req, serve, vars);
        }

        if(email_send === false) {
            form_email_errors.push("The verification email cannot be sent. Try registering without an email.");
        } else if(email_send == "error") {
            form_email_errors.push("Invalid email address.");
        }

        if(form_email_errors.length > 0) {
            // remove user if failed
            await db.run("DELETE FROM auth_user WHERE id=?", user_id)
            return await dispage("register", {
                form_email_errors
            }, req, serve, vars)
        }

        serve(null, null, {
            redirect: "/accounts/register/complete/"
        })
    } else {
        await db.run("UPDATE auth_user SET is_active=1 WHERE id=?", user_id)
        await dispage("login", {
            username: username,
            password: password1,
            registered: true
        }, req, serve, vars, "POST");
    }
}