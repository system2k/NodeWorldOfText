module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;
    var db = vars.db;
    var dispage = vars.dispage;
    var create_date = vars.create_date;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars);
    }

    var users = await db.all("SELECT * FROM auth_user");

    for(var i = 0; i < users.length; i++) {
        users[i].last_login = create_date(users[i].last_login).replace(/ /g, "&nbsp");
        users[i].date_joined = create_date(users[i].date_joined).replace(/ /g, "&nbsp");
    }

    var data = {
        users
    };

    serve(HTML("administrator_user_list.html", data));
}