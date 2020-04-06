module.exports.GET = async function(req, serve, vars, evars, params) {
    var cookies = evars.cookies;
    var HTML = evars.HTML;
    var user = evars.user;

    if(!user.authenticated) {
        return serve(null, null, {
            redirect: "/accounts/login/?next=/accounts/password_change/"
        })
    }

    var data = {
        csrftoken: cookies.csrftoken,
        error: params.error
    };

    serve(HTML("password_change.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
    var post_data = evars.post_data;
    var user = evars.user;

    var db = vars.db;
    var dispage = vars.dispage;
    var checkHash = vars.checkHash;
    var encryptHash = vars.encryptHash;

    if(!user.authenticated) return;

    var old_pass = post_data.old_password;
    var confirm_pass_1 = post_data.new_password1;
    var confirm_pass_2 = post_data.new_password2;

    var old_hash = (await db.get("SELECT password FROM auth_user WHERE username=? COLLATE NOCASE",
        user.username)).password;

    var valid = checkHash(old_hash, old_pass);
    if(!valid) {
        return await dispage("password_change", {
            error: "Your old password was entered incorrectly. Please enter it again."
        }, req, serve, vars, evars);
    }

    if(confirm_pass_1 != confirm_pass_2) {
        return await dispage("password_change", {
            error: "The passwords do not match."
        }, req, serve, vars, evars);
    }

    if(confirm_pass_1.length < 3 || confirm_pass_1.length > 128) {
        return await dispage("password_change", {
            error: "The new password must be 3 - 128 characters."
        }, req, serve, vars, evars);
    }

    var new_hash = encryptHash(confirm_pass_1);

    await db.run("UPDATE auth_user SET password=? WHERE id=?", [new_hash, user.id]);

    serve(null, null, {
        redirect: "/accounts/password_change/done/"
    })
}