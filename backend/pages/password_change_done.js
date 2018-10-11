module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var cookies = vars.cookies;
    var user = vars.user;

    if(!user.authenticated) return;

    serve(HTML("password_change_done.html"));
}