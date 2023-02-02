module.exports.POST = async function(req, write, server, ctx) {
	var callPage = server.callPage;
	await callPage("protect", {
		unprotect: true,
		char: true
	}, req, write, server, ctx, "POST");
}