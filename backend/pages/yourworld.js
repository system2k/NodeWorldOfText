module.exports = function(req, dispatch, vars) {
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
    dispatch(vars.template_data["yourworld.html"](data))
}