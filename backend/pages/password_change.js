module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var cookies = vars.cookies;
    var user = vars.user;

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

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;
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
        }, req, serve, vars)
    }

    if(confirm_pass_1 != confirm_pass_2) {
        return await dispage("password_change", {
            error: "The passwords do not match."
        }, req, serve, vars)
    }

    if(confirm_pass_1.length < 5 || confirm_pass_1.length > 128) {
        return await dispage("password_change", {
            error: "The new password must be 5 - 128 characters."
        }, req, serve, vars)
    }

    var new_hash = encryptHash(confirm_pass_1);

    await db.run("UPDATE auth_user SET password=? WHERE id=?", [new_hash, user.id]);

    serve(null, null, {
        redirect: "/accounts/password_change/done/"
    })
}