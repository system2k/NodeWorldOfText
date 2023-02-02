module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	write(render("registration/verify.html"));
}