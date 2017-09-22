module.exports = {};

module.exports.POST = async function(req, serve, vars) {
    var dispage = vars.dispage;
    await dispage("protect", {
        unprotect: true
    }, req, serve, vars, "POST")
}