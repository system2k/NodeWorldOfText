module.exports.GET = async function(req, write, server, ctx) {
	write(ctx.ipAddress);
}