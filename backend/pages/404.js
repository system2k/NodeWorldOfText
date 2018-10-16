module.exports.GET = async function(req, serve, vars) {
    var HTML = vars.HTML;
    serve(HTML("404.html"), 404);
}