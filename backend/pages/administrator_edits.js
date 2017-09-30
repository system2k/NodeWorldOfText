module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var get_third = vars.get_third;
    var path = vars.path;
    var db = vars.db;
    var filename_sanitize = vars.filename_sanitize;

    // not a superuser...
    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    var world_name = get_third(path, "administrator", "edits")

    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", world_name);

    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    var edits = [];
    await db.each("SELECT * FROM edit WHERE world_id=?", world.id, function(data) {
        edits.push(data);
    })

    serve(JSON.stringify(edits), null, {
        mime: "application/force-download; charset=utf-8",
        download_file: filename_sanitize("EditHistory_" + world_name + ".txt")
    })
}