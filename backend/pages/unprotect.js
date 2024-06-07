module.exports.POST = async function(req, write, server, ctx) {
	var callPage = ctx.callPage;
	await callPage("protect", {
		unprotect: true
	}, "POST");
}