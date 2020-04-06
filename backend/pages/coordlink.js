module.exports.POST = async function(req, serve, vars, evars) {
    var dispage = vars.dispage;
    await dispage("urllink", {
        coordlink: true
    }, req, serve, vars, evars, "POST");
}