module.exports.GET = async function(req, serve, vars) {
    var HTML = vars.HTML;
    serve(HTML("private.html"));
}