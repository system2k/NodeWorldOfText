module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var HTML = vars.HTML;
    var get_third = vars.get_third;
    var path = vars.path;

    var world_name = get_third(path, "accounts", "nsfw")
    var data = {
        world_name
    }

    serve(HTML("accounts_nsfw.html", data));
}