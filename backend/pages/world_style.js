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

    var properties = JSON.parse(world.properties);

    var backgroundColor = world.custom_color || "#000";
    var ownerTileColor = world.custom_tile_owner || "#ddd";
    var memberTileColor = world.custom_tile_member || "#eee";
    var publicTileColor = world.custom_bg || "#fff";
    var cursorColor = world.custom_cursor || "#ff0";
    var guestCursorColor = world.custom_guest_cursor || "#ffffee";
    var menuColor = properties.custom_menu_color || "#e5e5ff";

    var style = {
        owner: ownerTileColor,
        member: memberTileColor,
        public: publicTileColor,
        cursor: cursorColor,
        guestCursor: guestCursorColor,
        text: backgroundColor,
        menu: menuColor
    }

    serve(JSON.stringify(style), null, {
        mime: "application/json"
    })
}