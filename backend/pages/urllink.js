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

    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", post_data.namespace);
    if(!world) {
        return serve(null, 404);
    }
    var world_properties = JSON.parse(world.properties)

    var can_post_link = false;
    var is_member = false;

    if(world.owner_id == user.id) { // is owner?
        can_post_link = true;
    } else {
        var whitelist = await db.get("SELECT * FROM whitelist WHERE world_id=? AND user_id=?",
            [world.id, user.id])
        if(whitelist) { // is member?
            can_post_link = true;
            is_member = true;
        }
    }

    if(world.public_writable) { // user is probably not owner nor member
        if(world_properties.properties) {
            if(world_properties.properties.urlLink) { // links are allowed to regular users
                can_post_link = true;
            }
        }
    }

    var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
        [world.id, post_data.tileY, post_data.tileX])

    var tile_props = {};
    if(tile) {
        tile_props = JSON.parse(tile.properties);
        if(tile_props.protected) {
            if(world.owner_id != user.id) {
                can_post_link = false;
            }
        }
    }

    if(!can_post_link) {
        return serve(null, 403)
    }

    var link_type = 0;
    if(params.coordlink) {
        link_type = 1;
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

    if(!(charX < 16 && charY < 8 && charX >= 0 && charY >= 0)) { // out of range coords
        return serve(null, 400);
    }

    if(!tile_props.cell_props) tile_props.cell_props = {};
    if(!tile_props.cell_props[charY]) tile_props.cell_props[charY] = {};
    if(!tile_props.cell_props[charY][charX]) tile_props.cell_props[charY][charX] = {};

    if(link_type == 0) {
        tile_props.cell_props[charY][charX].link = {
            type: "url",
            url: post_data.url
        }
    } else if(link_type == 1) {
        tile_props.cell_props[charY][charX].link = {
            type: "coord",
            link_tileY: link_tileY,
            link_tileX: link_tileX
        }
    }

    if(tile) {
        await db.run("UPDATE tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?",
            [JSON.stringify(tile_props), world.id, tileY, tileX])
    } else {
        await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?)",
            [world.id, " ".repeat(128), tileY, tileX, JSON.stringify(tile_props), Date.now()])
    }

    serve();
}