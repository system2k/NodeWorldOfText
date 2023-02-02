module.exports.GET = async function(req, write, server, ctx, params) {
	var render = ctx.render;
	write(render("private.html", {
		privateWorldMsg: params.privateWorldMsg
	}), 403);
}