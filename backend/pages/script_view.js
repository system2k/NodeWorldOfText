module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var db = vars.db;
    var path = vars.path;
    var split_limit = vars.split_limit;

    // not staff
    if(!user.staff) {
        return serve();
    }

    var script_name = split_limit(path, "script_manager/view/", 1)[1]
    if(script_name.charAt(script_name.length - 1) === "/") {
        script_name = script_name.substring(0, script_name.length - 1);
    }

    var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
        [user.id, script_name])
    
    if(!script) {
        return serve();
    }

    serve(script.content)
}