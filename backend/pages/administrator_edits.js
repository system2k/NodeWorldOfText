module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var split_limit = vars.split_limit;
    var path = vars.path;
    var db = vars.db;

    // not a superuser...
    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    var world_name = split_limit(path, "administrator/edits/", 1)[1]
    if(world_name.charAt(world_name.length - 1) === "/") {
        world_name = world_name.substring(0, world_name.length - 1);
    }

    var world = await db.get("SELECT * FROM world WHERE name=?", world_name);

    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    var edits = [];
    await db.each("SELECT * FROM edit WHERE world_id=?", world.id, function(e, data) {
        edits.push(data);
    })

    serve(JSON.stringify(edits))
}