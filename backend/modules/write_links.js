// write url links and coordinate links
// this module implies the user has access to the world and that the world exists
module.exports = async function(data, vars) {
    var db = vars.db;
    var user = vars.user;
    var tile_signal_update = vars.tile_signal_update;
    var san_nbr = vars.san_nbr;
    var decodeCharProt = vars.decodeCharProt;
    var world = vars.world;
    var tile_database = vars.tile_database;

    var is_owner = user.id == world.owner_id;
    var is_member = user.stats.member;

    var type = data.type;

    var tileX = san_nbr(data.tileX);
    var tileY = san_nbr(data.tileY);
    var charX = san_nbr(data.charX);
    var charY = san_nbr(data.charY);

    var url = data.url
    var link_tileX = san_nbr(data.link_tileX);
    var link_tileY = san_nbr(data.link_tileY);

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
        return[true, "PERM"];
    }

    // the x position going from 0 - 127 may be used at times
    var charIdx = charY * 16 + charX;
    charX = charIdx % 16;
    charY = Math.floor(charIdx / 16);

    if(charIdx < 0 || charIdx >= 128) { // out of range coords
        return [true, "PARAM"];
    }

    var call_id = tile_database.newCallId();
    tile_database.reserveCallId(call_id);

    tile_database.write(call_id, tile_database.types.link, {
        tileX, tileY, charX, charY,
        user, world, is_member, is_owner,
        type, url, link_tileX, link_tileY
    });

    var resp = await tile_database.editResponse(call_id);

    return resp;
}