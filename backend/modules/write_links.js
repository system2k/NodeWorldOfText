// write url links and coordinate links
// this module implies the user has access to the world and that the world exists
module.exports = async function(data, vars) {
    var db = vars.db;
    var user = vars.user;
    var tile_signal_update = vars.tile_signal_update;
    var san_nbr = vars.san_nbr;
    var decodeCharProt = vars.decodeCharProt;
    var world = vars.world;

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

    var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
        [world.id, tileY, tileX]);

    var tile_props = {};
    if(tile) {
        tile_props = JSON.parse(tile.properties);
    }
    
    if(!(charX < 16 && charY < 8 && charX >= 0 && charY >= 0)) { // out of range coords
        return [true, "PARAM"];
    }

    var charProt = new Array(128).fill(tile ? tile.writability : null);
    if(tile_props.char) {
        charProt = decodeCharProt(tile_props.char);
    }

    var char_writability = charProt[charY * 16 + charX];
    if(char_writability == null) char_writability = tile ? tile.writability : null; // inherit from tile
    if(char_writability == null) char_writability = world.writability; // inherit from world

    // if the areas are protected and the user's perms do not match
    if(char_writability == 2 && !is_owner) {
        can_link = false;
    }
    if(char_writability == 1 && !is_member) {
        can_link = false;
    }

    if(!can_link) {
        return [true, "PERM"];
    }

    if(!tile_props.cell_props) tile_props.cell_props = {};
    if(!tile_props.cell_props[charY]) tile_props.cell_props[charY] = {};
    if(!tile_props.cell_props[charY][charX]) tile_props.cell_props[charY][charX] = {};

    if(typeof url != "string") url = "";
    if(type == "url") {
        tile_props.cell_props[charY][charX].link = {
            type: "url",
            url: url.slice(0, 10064) // size limit of urls
        }
    } else if(type == "coord") {
        tile_props.cell_props[charY][charX].link = {
            type: "coord",
            link_tileY: link_tileY,
            link_tileX: link_tileX
        }
    }

    var content = " ".repeat(128);
    var actual_writability = null;
    if(tile) {
        content = tile.content;
        actual_writability = tile.writability;
        await db.run("UPDATE tile SET properties=? WHERE id=?",
            [JSON.stringify(tile_props), tile.id]);
    } else {
        await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
            [world.id, " ".repeat(128), tileY, tileX, JSON.stringify(tile_props), Date.now()]);
    }

    tile_signal_update(world.name, tileX, tileY, content, tile_props, actual_writability);

    // [error, success/success data/error data];
    return [false, true];
}