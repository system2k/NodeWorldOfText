var world_mgr = require("../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var getWorld = world_mgr.getWorld;
var canViewWorld = world_mgr.canViewWorld;

module.exports.GET = async function(req, write, server, ctx) {
	var query_data = ctx.query_data;
	var user = ctx.user;
	var setCallback = ctx.setCallback;
	
	if(typeof query_data.world != "string") return write(null, 400);
	var world = await getWorld(query_data.world);
	if(!world) {
		return write(null, 404);
	}
	
	setCallback(function() {
		releaseWorld(world);
	});

	var perm = await canViewWorld(world, user, {
		memKey: query_data.key
	});
	if(!perm) {
		return write(null, 403);
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
	};

	write(JSON.stringify(style), null, {
		mime: "application/json"
	});
}