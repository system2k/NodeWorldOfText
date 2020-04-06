module.exports.POST = async function(req, serve, vars, evars) {
    var dispage = vars.dispage;
    await dispage("protect", {
        char: true
    }, req, serve, vars, evars, "POST");
}