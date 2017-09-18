module.exports = {};

module.exports.GET = async function(req, serve, vars) {
    var template_data = vars.template_data;
    var cookies = vars.cookies;
    var query_data = vars.query_data;

    var state = {
        canWrite: false,
        canAdmin: false,
        worldName: "name",
        features: {
            coordLink: false,
            urlLink: false,
            go_to_coord: false
        }
    }
    var data = {
        urlhome: "/home/",
        state: JSON.stringify(state)
    }
    serve(template_data["yourworld.html"](data))
}

module.exports.POST = async function(req, serve, vars) {
    serve("This is only a test.")
}