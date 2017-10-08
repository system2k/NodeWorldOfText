module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;
    var path = vars.path;
    var get_third = vars.get_third;
    var db = vars.db;
    var dispage = vars.dispage;

    if(!user.operator) {
        return await dispage("404", null, req, serve, vars)
    }

    var username = get_third(path, "administrator", "user")
    var user_edit = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);

    if(!user_edit) {
        return await dispage("404", null, req, serve, vars)
    }

    var data = {
        user,
        user_edit,
        message: params.message
    };

    serve(template_data["administrator_user.html"](data))
}

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;
    var get_third = vars.get_third;
    var path = vars.path;
    var dispage = vars.dispage;
    var url = vars.url;

    if(!user.operator) {
        return;
    }

    var username = get_third(path, "administrator", "user")
    var user_edit = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);
    if(!user_edit) {
        return;
    }

    if(user_edit.id == user.id) {
        return await dispage("administrator_user", {
            message: "You cannot set your own rank"
        }, req, serve, vars)
    }

    if(post_data.form == "rank") {
        var rank = -1;
        if(post_data.rank == "operator") rank = 3;
        if(post_data.rank == "superuser") rank = 2;
        if(post_data.rank == "staff") rank = 1;
        if(post_data.rank == "default") rank = 0;
        if(rank > -1) {
            await db.run("UPDATE auth_user SET level=? WHERE id=?", [rank, user_edit.id])
        } else {
            return serve("Invalid rank")
        }
        return await dispage("administrator_user", {
            message: "Successfully set " + user_edit.username + "'s rank to " + ["Default", "Staff", "Superuser", "Operator"][rank]
        }, req, serve, vars)
    }

    serve(null, null, {
        redirect: url.parse(req.url).pathname
    });
}