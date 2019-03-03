module.exports.GET = async function(req, serve, vars) {
    var HTML = vars.HTML;
    serve(HTML("registration/verify.html"));
}