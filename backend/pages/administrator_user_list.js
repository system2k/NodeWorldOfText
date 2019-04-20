module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;
    var db = vars.db;
    var dispage = vars.dispage;
    var create_date = vars.create_date;
    var uvias = vars.uvias;
    var db_misc = vars.db_misc;
    var accountSystem = vars.accountSystem;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars);
    }
    
    var users = [];
    if(accountSystem == "uvias") {
        var d_users = await uvias.all("SELECT uid as rawuid, to_hex(uid) as uid, username, created, last_login FROM accounts.users");
        users = [];
        for(var i = 0; i < d_users.length; i++) {
            var dusr = d_users[i];
            var id = "x" + dusr.uid;
            var username = dusr.username;
            var login_name = "< none >";
            var is_active = false;
            var level = await db_misc.get("SELECT level FROM admin_ranks WHERE id=?", [id]);
            if(level) {
                level = level.level;
            } else {
                level = 0;
            }
            var last_login = dusr.last_login.getTime();
            var date_joined = dusr.created.getTime();
            var dinf = await uvias.get("SELECT email_verified, login_name FROM accounts.links_local WHERE uid=$1::bigint", dusr.rawuid);
            if(dinf) {
                if(dinf.email_verified) is_active = dinf.email_verified;
                if(dinf.login_name) login_name = dinf.login_name;
            }
            users.push({
                id,
                username,
                login_name,
                is_active,
                level,
                last_login,
                date_joined
            });
        }
        
        users.sort(function(a, b) {
            return a.date_joined - b.date_joined;
        });
    } else if(accountSystem == "local") {
        users = await db.all("SELECT * FROM auth_user");
    }

    for(var i = 0; i < users.length; i++) {
        users[i].last_login = create_date(users[i].last_login).replace(/ /g, "&nbsp");
        users[i].date_joined = create_date(users[i].date_joined).replace(/ /g, "&nbsp");
    }

    var data = {
        users
    };

    serve(HTML("administrator_user_list.html", data));
}