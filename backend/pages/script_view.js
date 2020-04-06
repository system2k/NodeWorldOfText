module.exports.GET = async function(req, serve, vars, evars) {
    var path = evars.path;
    var user = evars.user;

    var dispage = vars.dispage;
    var db = vars.db;
    var get_third = vars.get_third;

    // not staff
    if(!user.staff) {
        return serve();
    }

    var script_name = get_third(path, "script_manager", "view")

    var script = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
        [user.id, script_name])
    
    if(!script) {
        return serve();
    }

    serve(script.content)
}