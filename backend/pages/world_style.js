var world_mgr = require("../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var getOrCreateWorld = world_mgr.getOrCreateWorld;
var canViewWorld = world_mgr.canViewWorld;

module.exports.GET = async function(req, serve, vars, evars) {
	var query_data = evars.query_data;
	var user = evars.user;
	var setCallback = evars.setCallback;

	var db = vars.db;
	
	if(typeof query_data.world != "string") return serve(null, 400);
	var world = await getOrCreateWorld(query_data.world);
	if(!world) {
		return serve(null, 404);
	}
	
	setCallback(function() {
		releaseWorld(world);
	});

	var memkeyAccess = (query_data.key && query_data.key == world.opts.memKey);

	var perm = await canViewWorld(world, user, { memkeyAccess });
	if(!perm) {
		return serve(null, 403);
	}

	var backgroundColor = world.theme.color || "#000";
	var ownerTileColor = world.theme.tileOwner || "#ddd";
	var memberTileColor = world.theme.tileMember || "#eee";
	var publicTileColor = world.theme.bg || "#fff";
	var cursorColor = world.theme.cursor || "#ff0";
	var guestCursorColor = world.theme.guestCursor || "#ffa";
	var menuColor = world.theme.menu || "#e5e5ff";
	var publicTextColor = world.theme.publicText || "#000";
	var memberTextColor = world.theme.memberText || "#000";
	var ownerTextColor = world.theme.ownerText || "#000";

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
	});
}