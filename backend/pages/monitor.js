module.exports.GET = async function(req, serve, vars, evars) {
    var HTML = evars.HTML;
    var user = evars.user;

    if(!user.superuser) return;

    var memTileCache = vars.memTileCache;

    var tc_worlds = 0;
    var tc_tiles = 0;

    for(var w in memTileCache) {
        tc_worlds++;
        for(var y in memTileCache[w]) {
            for(var x in memTileCache[w][y]) {
                tc_tiles++;
            }
        }
    }

    serve(HTML("monitor.html", {
        tc_worlds,
        tc_tiles
    }));
}