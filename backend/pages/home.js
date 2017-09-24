module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var user = vars.user;
    var website = vars.website;

    var data = {
        user,
        website
    };

    serve(template_data["home.html"](data))
}