module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var db = vars.db;
    var user = vars.user;
    var query_data = vars.query_data;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    
    var world = await world_get_or_create(query_data.world);
    if(!world) {
        return serve(null, 404);
    }
    var perm = await can_view_world(world, user);
    if(!perm) {
        return serve(null, 403);
    }

    var backgroundColor = world.custom_color || "#000";
    var ownerTileColor = world.custom_tile_owner || "#ddd";
    var memberTileColor = world.custom_tile_member || "#eee";
    var publicTileColor = world.custom_bg || "#fff";
    var cursorColor = world.custom_cursor || "#ff0";
    var guestCursorColor = world.custom_guest_cursor || "#ffffee";

    var CSS = "";

    CSS += `#yourworld{color:${backgroundColor};}`
    CSS += `div.world-container.writability-ADMIN .tilecont{background-color:${ownerTileColor};}`
    CSS += `div.world-container.writability-MEMBERS .tilecont{background-color:${memberTileColor};}`
    CSS += `div.world-container.writability-PUBLIC .tilecont{background-color:${publicTileColor};}`
    CSS += `div.world-container .tilecont.protected-admin{background-color:${ownerTileColor};}`
    CSS += `div.world-container .tilecont.protected-members{background-color:${memberTileColor};}`
    CSS += `div.world-container .tilecont.protected-public{background-color:${publicTileColor};}`
    CSS += `div.world-container .active-cursor{background-color:${cursorColor}!important;}`
    CSS += `div.world-container .active-guest-cursor{background-color:${guestCursorColor};}`

    serve(CSS, null, {
        mime: "text/css"
    })
}