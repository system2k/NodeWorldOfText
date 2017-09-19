module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var db = vars.db;
    var user = vars.user;

    var data = {
        user_is_authenticated: user.authenticated,
        user: user.username,
        block_super: "Node World Of Text",
        url_home: "/home/",
        url_profile: "/accounts/profile/",
        url_logout: "/accounts/logout",
        url_auth_login: "/accounts/login/",
        url_registration_register: "/accounts/register/"
    };

    serve(template_data["home.html"](data))
}