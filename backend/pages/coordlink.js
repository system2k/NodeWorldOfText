module.exports.POST = async function(req, serve, vars) {
    var dispage = vars.dispage;
    await dispage("urllink", {
        coordlink: true
    }, req, serve, vars, "POST")
}