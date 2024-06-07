var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;

module.exports.GET = async function(req, write, server, ctx, params) {
	var path = ctx.path;
	var render = ctx.render;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var db = server.db;
	var uvias = server.uvias;
	var db_misc = server.db_misc;
	var accountSystem = server.accountSystem;

	if(!user.superuser) {
		return await callPage("404");
	}

	var username = checkURLParam("/administrator/users/by_username/:username", path).username;
	
	var user_info;
	if(accountSystem == "uvias") {
		var d_user = await uvias.get("SELECT uid as rawuid, to_hex(uid) as uid, username, created, last_login FROM accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!d_user) {
			return write("This user does not exist.");
		}

		var d_inf = await uvias.get("SELECT login_name, email_verified FROM accounts.links_local WHERE uid=$1::bigint", d_user.rawuid);

		var login_name = "< none >";
		var email_verified = false;

		if(d_inf) {
			login_name = d_inf.login_name;
			email_verified = d_inf.email_verified;
		}

		user_info = {
			id: "x" + d_user.uid,
			username: login_name,
			date_joined: d_user.created,
			last_login: d_user.last_login,
			level: 0,
			is_active: email_verified,
			display_name: d_user.username
		};

		var level = await db_misc.get("SELECT level FROM admin_ranks WHERE id=?", [user_info.id]);
		if(level) {
			user_info.level = level.level;
		}
	} else if(accountSystem == "local") {
		user_info = await db.get("SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", username);
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

	write(render("administrator_users_template.html", data));
}