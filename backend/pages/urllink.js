module.exports = {};

function is_number(x) {
    return typeof x == "number" && isFinite(x) && !isNaN(x);
}

function all_numbers(ar) {
    for(var i = 0; i < ar.length; i++) {
        if(!is_number(ar[i])) {
            return false;
        }
    }
    return true;
}

// includes support for coord links too
module.exports.POST = async function(req, serve, vars, params) {
    var db = vars.db;
    var user = vars.user;
    var post_data = vars.post_data;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    var tile_signal_update = vars.tile_signal_update;
    var san_nbr = vars.san_nbr;
    var decodeCharProt = vars.decodeCharProt;

    var world = await world_get_or_create(post_data.world);
    if(!world) {
        return serve(null, 404);
    }

    var can_read = await can_view_world(world, user);
    if(!can_read) {
        return serve(null, 403)
    }

    var link_type = 0;
    if(params.coordlink) {
        link_type = 1;
    }

    var can_link = false;
    var feature_mode;

    if(link_type == 0) {
        feature_mode = world.feature_url_link;
    } else if(link_type == 1) {
        feature_mode = world.feature_coord_link;
    }

    if(feature_mode == 2 && can_read.owner) {
        can_link = true;
    }
    if(feature_mode == 1 && can_read.member && can_read.can_write) {
        can_link = true;
    }
    if(feature_mode == 0) { // if everybody has link permission
        can_link = true;
    }

    var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
        [world.id, post_data.tileY, post_data.tileX])

    var tile_props = {};
    if(tile) {
        tile_props = JSON.parse(tile.properties);
    }
    
    var tileX = parseInt(post_data.tileX);
    var tileY = parseInt(post_data.tileY);
    var charX = parseInt(post_data.charX);
    var charY = parseInt(post_data.charY);
    if(link_type == 1) {
        var link_tileY = parseInt(post_data.link_tileY);
        var link_tileX = parseInt(post_data.link_tileX);
    }

    var numb_check = [tileX, tileY, charX, charY]; // check if the arguments are not numbers
    if(link_type == 1) { // extra arguments for coord links
        numb_check.push(link_tileY, link_tileX);
    }
    if(!all_numbers(numb_check)) { // one of args isn't number
        return serve(null, 400);
    }
    tileX = san_nbr(tileX);
    tileY = san_nbr(tileY);
    charX = san_nbr(charX);
    charY = san_nbr(charY);

    if(!(charX < 16 && charY < 8 && charX >= 0 && charY >= 0)) { // out of range coords
        return serve(null, 400);
    }

    var charProt = new Array(128).fill(tile.writability);
    properties = JSON.parse(tile.properties);
    if(tile_props.char) {
        charProt = decodeCharProt(tile_props.char);
    }

    var char_writability = charProt[charY * 16 + charX];
    if(char_writability == null) char_writability = tile.writability; // inherit from tile
    if(char_writability == null) char_writability = world.writability; // inherit from world

    if(char_writability == 2 && !can_read.owner) {
        can_link = false;
    }
    if(char_writability == 1 && !can_read.member && !can_read.owner) {
        can_link = false;
    }
    if(char_writability == 0 && feature_mode != 0 && !(can_read.member || can_read.owner)) {
        can_link = false;
    }

    if(!can_link) {
        return serve(null, 403)
    }

    if(!tile_props.cell_props) tile_props.cell_props = {};
    if(!tile_props.cell_props[charY]) tile_props.cell_props[charY] = {};
    if(!tile_props.cell_props[charY][charX]) tile_props.cell_props[charY][charX] = {};

    if(link_type == 0) {
        tile_props.cell_props[charY][charX].link = {
            type: "url",
            url: post_data.url.slice(0, 10000) // size limit of urls
        }
    } else if(link_type == 1) {
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
        await db.run("UPDATE tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?",
            [JSON.stringify(tile_props), world.id, tileY, tileX])
    } else {
        await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
            [world.id, " ".repeat(128), tileY, tileX, JSON.stringify(tile_props), Date.now()])
    }

    tile_signal_update(world.name, tileX, tileY, content, tile_props, actual_writability)

    serve();
}