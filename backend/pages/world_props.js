module.exports.GET = async function(req, serve, vars, evars) {
	var query_data = evars.query_data;
	var user = evars.user;
	var setCallback = evars.setCallback;

	var getOrCreateWorld = vars.getOrCreateWorld;
	var canViewWorld = vars.canViewWorld;
	var releaseWorld = vars.releaseWorld;
	
	if(typeof query_data.world != "string") return serve(null, 400);
	var world = await getOrCreateWorld(query_data.world);
	if(!world) {
		return serve(null, 404);
	}

	setCallback(function() {
		releaseWorld(world);
	});

	var perm = await canViewWorld(world, user);
	if(!perm) {
		return serve(null, 403);
	}

	var pathname = world.name;
	if(pathname != "") {
		pathname = "/" + pathname;
	}

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
			colorCell: world.feature.colorCell
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
			desc: world.opts.desc
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

	serve(JSON.stringify(props), null, {
		mime: "application/json"
	});
}