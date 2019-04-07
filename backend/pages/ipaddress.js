module.exports.GET = async function(req, serve, vars) {
    serve(vars.ipAddress);
}