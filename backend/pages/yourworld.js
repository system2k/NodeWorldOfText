module.exports = {};

/*
    is any variable null/nan?
    [vars]:
        list of variables
    [types]: (optional)
        0: check for null
        1: check for NaN
        2: check for null and NaN
*/
function null_or_nan(vars, types) {
    if(!types) types = 0;
    for(var i = 0; i < vars.length; i++) {
        if((vars[i] == null && types == 0) ||
           (isNaN(vars[i]) && types == 1) ||
           (vars[i] == null || isNaN(vars[i]) && types == 2)) {
            return true;
        }
    }
    return false;
}

// from: http://stackoverflow.com/questions/8273047/javascript-function-similar-to-python-range
function xrange(start, stop, step) {
    if (typeof stop == 'undefined') {
        stop = start;
        start = 0;
    }
    if (typeof step == 'undefined') {
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
        return [];
    }
    var result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
        result.push(i);
    }
    return result;
};

function tile_coord(coord) {
    coord = coord.split(",")
    return [parseInt(coord[0]), parseInt(coord[1])];
}

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var query_data = vars.query_data;
    var path = vars.path;
    var db = vars.db;
    var redirect = vars.redirect;
    var user = vars.user;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;

    var world_name = path;
    if(params.timemachine) {
        world_name = params.world;
    }

    var world = await world_get_or_create(world_name, req, serve)
    if(!world) return;

    var world_properties = JSON.parse(world.properties)

    var read_permission = await can_view_world(world, user, db);
    if(!read_permission) {
        return redirect("/accounts/private/")
    }

    if(!world_properties.views) {
        world_properties.views = 0;
    }
    world_properties.views++;
    await db.run("UPDATE world SET properties=? WHERE id=?",
        [JSON.stringify(world_properties), world.id])

    var canWrite = !!world.public_writable;
    var canAdmin = false;
    var coordLink = false;
    var urlLink = false;
    var go_to_coord = false;
    if(world_properties.features) {
        if(world_properties.features.coordLink) {
            coordLink = true;
        }
        if(world_properties.features.go_to_coord) {
            go_to_coord = true;
        }
        if(world_properties.features.urlLink) {
            urlLink = true;
        }
    }
    if(read_permission.member) {
        canWrite = true;
        coordLink = true;
        urlLink = true;
        go_to_coord = true;
    }

    if(read_permission.owner) {
        canWrite = true;
        canAdmin = true;
        coordLink = true;
        urlLink = true;
        go_to_coord = true;
    }

    var state = {
        canWrite: canWrite,
        canAdmin: canAdmin,
        worldName: world.name,
        features: {
            coordLink: coordLink,
            urlLink: urlLink,
            go_to_coord: go_to_coord
        }
    }
    if(req.headers["user-agent"].indexOf("MSIE") >= 0) {
        state.announce = "Sorry, node World of Text doesn't work well with Internet Explorer."
    }
    var css_timemachine = "";
    if(params.timemachine) {
        css_timemachine = "<style>.tilecont {position: absolute;background-color: #ddd;}</style>";
        state.canWrite = false;
    }
    var data = {
        state: JSON.stringify(state),
        css_timemachine,
        user
    }
    serve(template_data["yourworld.html"](data))
}