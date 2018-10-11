module.exports.POST = async function(req, serve, vars) {
    var dispage = vars.dispage;
    await dispage("protect", {
        char: true
    }, req, serve, vars, "POST")
}