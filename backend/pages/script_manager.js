module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var db = vars.db;

    // not staff
    if(!user.staff) {
        return await dispage("404", null, req, serve, vars)
    }

    var scripts = [];

    await db.each("SELECT * FROM scripts WHERE owner_id=?", user.id, function(data) {
        scripts.push({
            name: data.name,
            enabled: data.enabled
        })
    })

    var data = {
        user,
        message: params.message,
        scripts
    }

    serve(template_data["script_manager.html"](data))
}

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;
    var dispage = vars.dispage;

    if(!user.staff) {
        return;
    }

    var name = post_data.scriptname;

    var exists = await db.get("SELECT * FROM scripts WHERE owner_id=? AND name=?",
        [user.id, name])

    if(exists) {
        return await dispage("script_manager", {
            message: "The script already exists"
        }, req, serve, vars)
    }

    await db.run("INSERT INTO scripts VALUES(null, ?, ?, '', ?, 0)",
        [user.id, name, Date.now()])

    await dispage("script_manager", {
        message: "Script created successfully"
    }, req, serve, vars)
}