function escape_control(str) {
	str += "";
	str = str.replace(/\\/g, "\\\\");
	str = str.replace(/%/g, "\\%");
	str = str.replace(/_/g, "\\_");
	return str;
}

module.exports.GET = async function(req, serve, vars, evars) {
	var query_data = evars.query_data;

	var db = vars.db;
	var uvias = vars.uvias;
	var accountSystem = vars.accountSystem;

	var input = query_data.q;

	if(!input) input = "";
	input += "";
	input = input.trim();
	if(!input) return serve("");
	if(input.length < 4) return serve("");

	var list;
	if(accountSystem == "uvias") {
		list = await uvias.all("SELECT username FROM accounts.users WHERE username ILIKE $1::text || '%' ESCAPE '\\' ORDER BY username LIMIT 10", escape_control(input));
	} else if(accountSystem == "local") {
		list = await db.all("SELECT username FROM auth_user WHERE username LIKE ? || '%' ESCAPE '\\' ORDER BY username LIMIT 10", escape_control(input));
	}

	var users = [];
	for(var i = 0; i < list.length; i++){
		users.push(list[i].username);
	}
	serve(users.join("\n"));
}