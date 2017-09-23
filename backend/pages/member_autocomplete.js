module.exports = {};

function escape_control(str) {
	return str.replace(/%/g, "\\%").replace(/\\/g, "\\\\");
}

module.exports.GET = async function(req, serve, vars, props) {
    var db = vars.db;
    var query_data = vars.query_data;

    var list = await db.all("SELECT username FROM auth_user WHERE username LIKE ? || '%' ESCAPE '\\' ORDER BY username LIMIT 10", [escape_control(query_data.q)])

    var users = [];
    for(var i = 0; i < list.length; i++){
        users.push(list[i].username)
    }
    serve(users.join("\n"));
}