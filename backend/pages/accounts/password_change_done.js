module.exports.GET = async function(req, write, server, ctx) {
	var cookies = ctx.cookies;
	var render = ctx.render;
	var user = ctx.user;

	if(!user.authenticated) return;

	write(render("password_change_done.html"));
}