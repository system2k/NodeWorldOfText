module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;

    if(!user.superuser) return;

    serve(HTML("monitor.html"));
}