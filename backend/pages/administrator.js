module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var user = vars.user;
    var dispage = vars.dispage;
    var db = vars.db;

    // not a superuser...
    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    var data = {
        user,
        user_ranks: await db.all("SELECT * FROM auth_user WHERE level > 0")
    }

    serve(template_data["administrator.html"](data))
}