module.exports.GET = async function(req, serve, vars) {
    var HTML = vars.HTML;

    serve(HTML("other_chat.html"));
}