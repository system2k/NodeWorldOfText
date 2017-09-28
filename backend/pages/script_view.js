module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var db = vars.db;
    var path = vars.path;
    var get_third = vars.get_third;

    var script_name = get_third(path, "script_manager", "view")

    var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
        [user.id, script_name])
    
    if(!script) {
        return serve();
    }

    serve(script.content)
}