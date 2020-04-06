module.exports.GET = async function(req, serve, vars, evars) {
    var HTML = evars.HTML;
    serve(HTML("404.html"), 404);
}