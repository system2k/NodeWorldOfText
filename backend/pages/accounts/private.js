module.exports.GET = async function(req, write, server, ctx, params) {
	var HTML = ctx.HTML;
	write(HTML("private.html", {
		privateWorldMsg: params.privateWorldMsg
	}), 403);
}