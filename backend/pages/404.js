module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;

    var data = {
        user_is_authenticated: user.authenticated,
        user: user.username
    };

    serve(template_data["404.html"](data))
}