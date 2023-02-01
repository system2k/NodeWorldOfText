module.exports.GET = async function(req, write, server, ctx) {
	var cookies = ctx.cookies;
	var HTML = ctx.HTML;
	var user = ctx.user;

	if(!user.authenticated) return;

	write(HTML("password_change_done.html"));
}