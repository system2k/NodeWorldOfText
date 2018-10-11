module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;
    var path = vars.path;
    var get_fourth = vars.get_fourth;
    var db = vars.db;
    var dispage = vars.dispage;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    var user_id = get_fourth(path, "administrator", "users", "by_id")
    var user_info = await db.get("SELECT * FROM auth_user WHERE id=?", user_id);

    if(!user_info) {
        return "This user does not exist.";
    }

    var data = {
        user_info,
        date_joined: new Date(user_info.date_joined).toString(),
        last_login: new Date(user_info.last_login).toString(),
        worlds_owned: (await db.get("SELECT count(*) AS cnt FROM world WHERE owner_id=?", [user_info.id])).cnt,
        level: user_info.level,
        is_active: !!user_info.is_active
    };

    serve(HTML("administrator_users_template.html", data));
}