module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var topActiveWorlds = server.topActiveWorlds;

	if (!user.superuser) return;

	var topCount = 1000;
	var list = topActiveWorlds(topCount);

	send({
		topCount,
		list
	});
}
