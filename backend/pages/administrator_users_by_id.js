module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;
    var path = vars.path;
    var get_fourth = vars.get_fourth;
    var db = vars.db;
    var dispage = vars.dispage;
    var uvias = vars.uvias;
    var db_misc = vars.db_misc;
    var accountSystem = vars.accountSystem;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars);
    }

    var user_id = get_fourth(path, "administrator", "users", "by_id");
	if(typeof user_id != "string") return;
    
    var user_info;
    if(accountSystem == "uvias") {
        user_id = user_id.toLowerCase();
        if(user_id.charAt(0) == "x") user_id = user_id.substr(1);
		
		var id_valid = true;
		var id_alpha = "0123456789abcdef";
		if(user_id.length < 1 || user_id.length > 16) id_valid = false;
		for(var i = 0; i < user_id.length; i++) {
			if(id_alpha.indexOf(user_id.charAt(i)) == -1) {
				id_valid = false;
			}
		}
		if(!id_valid) return "Invalid ID format";
        
        var d_user = await uvias.get("SELECT uid as rawuid, to_hex(uid) as uid, login_name, email_verified FROM accounts.links_local WHERE uid=('x'||lpad($1::text,16,'0'))::bit(64)::bigint", user_id);
        if(!d_user) {
            return "This user does not exist.";
        }
        
        var d_inf = await uvias.get("SELECT username, created, last_login FROM accounts.users WHERE uid=$1::bigint", d_user.rawuid);
        
        user_info = {
            id: "x" + d_user.uid,
            username: d_user.login_name,
            date_joined: 0,
            last_login: 0,
            level: 0,
            is_active: d_user.email_verified,
            display_name: "< none >"
        };
        
        if(d_inf) {
            user_info.date_joined = d_inf.created;
            user_info.last_login = d_inf.last_login;
            user_info.display_name = d_inf.username;
        }
        
        var level = await db_misc.get("SELECT level FROM admin_ranks WHERE id=?", [user_info.id]);
        if(level) {
            user_info.level = level.level;
        }
    } else if(accountSystem == "local") {
        user_info = await db.get("SELECT * FROM auth_user WHERE id=?", user_id);
        if(!user_info) {
            return "This user does not exist.";
        }
    }

    var data = {
        user_info,
        date_joined: new Date(user_info.date_joined).toString(),
        last_login: new Date(user_info.last_login).toString(),
        worlds_owned: (await db.get("SELECT count(*) AS cnt FROM world WHERE owner_id=?", [user_info.id])).cnt,
        level: user_info.level,
        is_active: !!user_info.is_active,
        display_name: user_info.display_name
    };

    serve(HTML("administrator_users_template.html", data));
}