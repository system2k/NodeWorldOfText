// write url links and coordinate links
// this module implies the user has access to the world and that the world exists
module.exports = async function(data, vars, evars) {
	var user = evars.user;
	var channel = evars.channel;
	var world = evars.world;

	var db = vars.db;
	var san_nbr = vars.san_nbr;
	var san_dp = vars.san_dp;
	var decodeCharProt = vars.decodeCharProt;
	var tile_database = vars.tile_database;

	var is_owner = user.id == world.owner_id || (user.superuser && world.name == "");
	var is_member = user.stats.member || (user.superuser && world.name == "");

	var type = data.type;

	var tileX = san_nbr(data.tileX);
	var tileY = san_nbr(data.tileY);
	var charX = san_nbr(data.charX);
	var charY = san_nbr(data.charY);

	var url = data.url
	var link_tileX = san_dp(data.link_tileX);
	var link_tileY = san_dp(data.link_tileY);

	var properties = JSON.parse(world.properties);
	var no_log_edits = !!properties.no_log_edits;

	var can_link = false;
	var feature_mode;

	if(type == "url") {
		feature_mode = world.feature_url_link;
	} else if(type == "coord") {
		feature_mode = world.feature_coord_link;
	} else {
		return [true, "PARAM"];
	}

	if(feature_mode == 2 && is_owner) {
		can_link = true;
	}
	if(feature_mode == 1 && is_member) {
		can_link = true;
	}
	if(feature_mode == 0) { // if everybody has link permission
		can_link = true;
	}

	if(!can_link) {
		return [true, "PERM"];
	}

	// the x position going from 0 - 127 may be used at times
	var charIdx = charY * CONST.tileCols + charX;
	charX = charIdx % CONST.tileCols;
	charY = Math.floor(charIdx / CONST.tileCols);

	if(charIdx < 0 || charIdx >= CONST.tileArea) { // out of range coords
		return [true, "PARAM"];
	}

	var call_id = tile_database.newCallId();
	tile_database.reserveCallId(call_id);

	tile_database.write(call_id, tile_database.types.link, {
		tileX, tileY, charX, charY,
		user, world, is_member, is_owner,
		type, url, link_tileX, link_tileY,
		channel, no_log_edits,
		no_update: false
	});

	var resp = await tile_database.editResponse(call_id);

	return resp;
}