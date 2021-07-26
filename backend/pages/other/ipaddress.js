module.exports.GET = async function(req, serve, vars, evars) {
	serve(evars.ipAddress);
}