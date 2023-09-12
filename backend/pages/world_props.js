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

	var perm = await canViewWorld(world, user);
	if(!perm) {
		return write(null, 403);
	}

	var pathname = world.name;
	if(pathname != "") {
		pathname = "/" + pathname;
	}

	// not all props are included for security reasons
	var props = {
		name: world.name,
		feature: {
			goToCoord: world.feature.goToCoord,
			memberTilesAddRemove: world.feature.memberTilesAddRemove,
			paste: world.feature.paste,
			coordLink: world.feature.coordLink,
			urlLink: world.feature.urlLink,
			chat: world.feature.chat,
			showCursor: world.feature.showCursor,
			colorText: world.feature.colorText,
			colorCell: world.feature.colorCell,
			quickErase: world.feature.quickErase
		},
		theme: {
			bg: world.theme.bg,
			cursor: world.theme.cursor,
			guestCursor: world.theme.guestCursor,
			color: world.theme.color,
			tileOwner: world.theme.tileOwner,
			tileMember: world.theme.tileMember,
			menu: world.theme.menu,
			publicText: world.theme.publicText,
			memberText: world.theme.memberText,
			ownerText: world.theme.ownerText
		},
		opts: {
			nsfw: world.opts.nsfw,
			squareChars: world.opts.squareChars,
			halfChars: world.opts.halfChars,
			charRate: world.opts.charRate,
			writeInt: world.opts.writeInt,
			desc: world.opts.desc,
			noChatGlobal: world.opts.noChatGlobal,
			noCopy: world.opts.noCopy,
			defaultScriptPath: world.opts.defaultScriptPath
		},
		background: {
			url: world.background.url,
			x: world.background.x,
			y: world.background.y,
			w: world.background.w,
			h: world.background.h,
			rmod: world.background.rmod,
			alpha: world.background.alpha
		},
		writability: world.writability,
		readability: world.readability,
		layout: {
			tileRows: 8,
			tileCols: 16
		}
	};

	if(CONST.tileRows != 8) {
		props.layout.tileRows = CONST.tileRows;
	}
	if(CONST.tileCols != 16) {
		props.layout.tileCols = CONST.tileCols;
	}

	write(JSON.stringify(props), null, {
		mime: "application/json"
	});
}