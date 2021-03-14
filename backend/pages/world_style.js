module.exports.GET = async function(req, serve, vars, evars) {
	var query_data = evars.query_data;
	var user = evars.user;

	var db = vars.db;
	var world_get_or_create = vars.world_get_or_create;
	var can_view_world = vars.can_view_world;
	
	if(typeof query_data.world != "string") return serve(null, 400);
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
	var guestCursorColor = world.custom_guest_cursor || "#ffe";
	var menuColor = properties.custom_menu_color || "#e5e5ff";
	var publicTextColor = properties.custom_public_text_color || "#000";
	var memberTextColor = properties.custom_member_text_color || "#000";
	var ownerTextColor = properties.custom_owner_text_color || "#000";

	var style = {
		owner: ownerTileColor,
		member: memberTileColor,
		public: publicTileColor,
		cursor: cursorColor,
		guestCursor: guestCursorColor,
		text: backgroundColor,
		menu: menuColor,
		public_text: publicTextColor,
		member_text: memberTextColor,
		owner_text: ownerTextColor
	}

	serve(JSON.stringify(style), null, {
		mime: "application/json"
	})
}