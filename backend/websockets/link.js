module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var modules = server.modules;
	var sData = data.data;
	if(!sData) return;
	var type = data.type;
	
	var tileX = sData.tileX;
	var tileY = sData.tileY;
	var charX = sData.charX;
	var charY = sData.charY;
	var url = sData.url;
	var link_tileX = sData.link_tileX;
	var link_tileY = sData.link_tileY;

	var do_link = await modules.write_links({
		type,
		tileX, tileY,
		charX, charY,
		url,
		link_tileX, link_tileY
	}, server, {
		user: ctx.user,
		channel: ctx.channel,
		world: ctx.world,
		keyQuery: ctx.keyQuery,
		ws: ws
	});
}