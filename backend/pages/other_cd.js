var url = require("url");

module.exports.GET = function(req, serve, vars, props) {
    var path = req.url;
    path = url.parse(path).pathname;
    if(path.charAt(0) == "/") { path = path.substr(1); }
    try { path = decodeURIComponent(path); } catch (e) {};

    serve("FS-Based file server: " + path);
}