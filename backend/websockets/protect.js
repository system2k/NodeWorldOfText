module.exports = async function(ws, data, send, vars, evars) {
	var modules = vars.modules;

	var sData = data.data;
	if(!sData) return;
	var action = data.action;

	var tileX = sData.tileX;
	var tileY = sData.tileY;
	var charX = sData.charX;
	var charY = sData.charY;
	var precise = sData.precise;
	var type = sData.type;

	var do_protect = await modules.protect_areas({
		action,
		tileX, tileY,
		charX, charY,
		precise,
		type
	}, vars, evars);
}