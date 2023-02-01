module.exports.POST = async function(req, write, server, ctx) {
	var dispage = server.dispage;
	await dispage("protect", {
		unprotect: true
	}, req, write, server, ctx, "POST");
}