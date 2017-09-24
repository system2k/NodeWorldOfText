module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var user = vars.user;

    var data = {
        user
    };

    serve(template_data["private.html"](data))
}