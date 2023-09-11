module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var modules = server.modules;

	var sData = data.data;
	if(!sData) return;

	var tileX = sData.tileX;
	var tileY = sData.tileY;
	var charX = sData.charX;
	var charY = sData.charY;
	var charWidth = sData.charWidth;
	var charHeight = sData.charHeight;

	await modules.clear_areas({
		tileX, tileY,
		charX, charY,
		charWidth, charHeight
	}, server, {
		user: ctx.user,
		channel: ctx.channel,
		world: ctx.world,
		keyQuery: ctx.keyQuery,
		ws: ws
	});
}