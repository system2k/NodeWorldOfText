module.exports.GET = async function(req, write, server, ctx) {
	var HTML = ctx.HTML;
	write(HTML("registration/verify.html"));
}