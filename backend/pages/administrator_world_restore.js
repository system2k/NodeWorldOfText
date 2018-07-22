module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var user = vars.user;
    var dispage = vars.dispage;
    var get_third = vars.get_third;
    var path = vars.path;
    var db = vars.db;
    var filename_sanitize = vars.filename_sanitize;
    var world_get_or_create = vars.world_get_or_create;
    var HTML = vars.HTML;

    // not a superuser...
    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    serve(HTML("administrator_world_restore.html"));
}