module.exports.POST = async function(req, write, server, ctx) {
	var callPage = server.callPage;
	await callPage("protect", {
		char: true
	}, req, write, server, ctx, "POST");
}