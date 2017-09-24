module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var user = vars.user;

    var data = {
        user_is_authenticated: user.authenticated,
        user: user.username
    };

    serve(template_data["registration/activate.html"](data))
}