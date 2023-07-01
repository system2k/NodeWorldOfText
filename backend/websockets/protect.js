module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var modules = server.modules;

	var sData = data.data;
	if(!sData) return;
	var action = data.action;

	var tileX = sData.tileX;
	var tileY = sData.tileY;
	var charX = sData.charX;
	var charY = sData.charY;
	var charWidth = sData.charWidth;
	var charHeight = sData.charHeight;
	var precise = sData.precise;
	var type = sData.type;

	var do_protect = await modules.protect_areas({
		action,
		tileX, tileY,
		charX, charY,
		charWidth, charHeight,
		precise,
		type
	}, server, {
		user: ctx.user,
		channel: ctx.channel,
		world: ctx.world,
		keyQuery: ctx.keyQuery,
		ws: ws
	});
}