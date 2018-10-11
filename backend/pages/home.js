module.exports.GET = async function(req, serve, vars) {
    var HTML = vars.HTML;
    var website = vars.website;

    var data = {
        website
    };

    serve(HTML("home.html", data));
}