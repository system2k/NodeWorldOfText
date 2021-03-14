module.exports = async function(ws, data, send, vars, evars) {
	var user = evars.user;
	var world = evars.world;

	var db = vars.db;
	var san_nbr = vars.san_nbr;
	var tile_coord = vars.tile_coord;
	var modules = vars.modules;
	var tile_database = vars.tile_database;

	if(!user.superuser) {
		return;
	}

	var tileX = san_nbr(data.tileX);
	var tileY = san_nbr(data.tileY);
	var charX = san_nbr(data.charX);
	var charY = san_nbr(data.charY);
	var text = data.data;
	if(typeof text != "string") return;
	if(text.length == 0 || text.length > 1000000) return;
	if(charX < 0) charX = 0;
	if(charY < 0) charY = 0;
	if(charX > CONST.tileCols - 1) charX = CONST.tileCols - 1;
	if(charY > CONST.tileRows - 1) charY = CONST.tileRows - 1;

	var call_id = tile_database.newCallId();

	var is_owner = user.id == world.owner_id || (user.superuser && world.name == "");
	var is_member = user.stats.member || is_owner || (user.superuser && world.name == "");

	tile_database.reserveCallId(call_id);
	tile_database.write(call_id, tile_database.types.paste, {
		world, user,
		is_owner, is_member,
		tileX, tileY, charX, charY,
		can_color_text: true,
		text
	});

	await tile_database.editResponse(call_id);
}