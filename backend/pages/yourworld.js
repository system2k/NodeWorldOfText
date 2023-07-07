var utils = require("../utils/utils.js");
var world_mgr = require("../subsystems/world_mgr.js");
var getOrCreateWorld = world_mgr.getOrCreateWorld;
var modifyWorldProp = world_mgr.modifyWorldProp;
var releaseWorld = world_mgr.releaseWorld;
var canViewWorld = world_mgr.canViewWorld;

function isMainPage(name) {
	return name == "" || name.toLowerCase() == "main" || name.toLowerCase() == "owot";
}

module.exports.GET = async function(req, write, server, ctx, params) {
	var query_data = ctx.query_data;
	var path = ctx.path;
	var user = ctx.user;
	var render = ctx.render;
	var setCallback = ctx.setCallback;

	var callPage = server.callPage;
	var db = server.db;
	var modules = server.modules;
	var loadString = server.loadString;
	var accountSystem = server.accountSystem;
	var createCSRF = server.createCSRF;

	var world_name = path;

	var world = await getOrCreateWorld(world_name);
	if(!world) return await callPage("404", null, req, write, server, ctx);
	
	setCallback(function() {
		releaseWorld(world);
	});

	var read_permission = await canViewWorld(world, user, {
		memKey: query_data.key
	});
	if(!read_permission) {
		var privNote = world.opts.privNote;
		return await callPage("accounts/private", {
			privateWorldMsg: privNote
		}, req, write, server, ctx);
	}

	if(query_data.fetch == 1) { // fetch request
		ctx.world = world;
		var tiles = await modules.fetch_tiles({
			fetchRectangles: [{
				minY: query_data.min_tileY,
				minX: query_data.min_tileX,
				maxY: query_data.max_tileY,
				maxX: query_data.max_tileX
			}],
			utf16: query_data.utf16,
			array: query_data.array,
			content_only: query_data.content_only,
			concat: query_data.concat
		}, server, ctx);
		if(typeof tiles == "string") {
			return write(tiles);
		}
		if("data" in tiles) tiles = tiles.data;
		var tData;
		if(typeof tiles == "string") {
			tData = tiles;
		} else {
			tData = JSON.stringify(tiles);
		}
		return write(tData, null, {
			mime: "application/json; charset=utf-8",
			headers: {
				"Cache-Control": "no-store"
			}
		});
	} else { // the HTML page
		if(!query_data.hide) {
			modifyWorldProp(world, "views", world.views + 1);
		}
		var pathname = world.name;
		if(pathname != "") {
			pathname = "/" + pathname;
		}
		var username = user.username;
		if(accountSystem == "uvias") {
			username = user.display_username;
		}
		var char_rate = world.opts.charRate;
		if(char_rate) {
			char_rate = char_rate.split("/").map(Number);
		} else {
			char_rate = [20480, 1000];
		}
		var write_int = world.opts.writeInt;
		if(write_int == -1) write_int = 1000;

		var announcement = loadString("announcement");

		var state = {
			userModel: {
				username: username,
				is_superuser: user.superuser,
				authenticated: user.authenticated,
				is_member: read_permission.member || (user.superuser && isMainPage(world.name)),
				is_owner: read_permission.owner || (user.superuser && isMainPage(world.name)),
				is_staff: user.staff,
				is_operator: user.operator
			},
			worldModel: {
				feature_membertiles_addremove: world.feature.memberTilesAddRemove,
				writability: world.writability,
				feature_url_link: world.feature.urlLink,
				feature_go_to_coord: world.feature.goToCoord,
				name: world.name,
				feature_paste: world.feature.paste,
				readability: world.readability,
				feature_coord_link: world.feature.coordLink,
				pathname,
				chat_permission: world.feature.chat,
				color_text: world.feature.colorText,
				color_cell: world.feature.colorCell,
				show_cursor: world.feature.showCursor,
				char_rate: char_rate,
				write_interval: write_int,
				no_chat_global: world.opts.noChatGlobal
			}
		};
		if(CONST.tileRows != 8) {
			state.worldModel.tileRows = CONST.tileRows;
		}
		if(CONST.tileCols != 16) {
			state.worldModel.tileCols = CONST.tileCols;
		}
		if(world.opts.nsfw) {
			state.worldModel.nsfw = true;
		}
		if(world.opts.squareChars) {
			state.worldModel.square_chars = true;
		}
		if(world.opts.halfChars) {
			state.worldModel.half_chars = true;
		}
		if(announcement) {
			state.announce = announcement;
		}
		if(world.background.url) {
			state.background = {
				path: world.background.url
			};
			if(world.background.x) {
				state.background.x = world.background.x;
			}
			if(world.background.y) {
				state.background.y = world.background.y;
			}
			if(world.background.w) {
				state.background.w = world.background.w;
			}
			if(world.background.h) {
				state.background.h = world.background.h;
			}
			if(world.background.rmod) {
				state.background.rmod = world.background.rmod;
			}
			if(world.background.alpha) {
				state.background.alpha = world.background.alpha;
			}
		}
		var page_title = "Our World of Text";
		if(!isMainPage(world.name)) {
			page_title = "/" + world.name;
		}
		var meta_desc = world.opts.desc;
		if(!world.name) {
			meta_desc = "";
		}
		var csrftoken = createCSRF(user.id, 0);
		var data = {
			state: JSON.stringify(state),
			page_title,
			nsfw: world.opts.nsfw,
			meta_desc,
			csrftoken
		};
		return write(render("yourworld.html", data), null, {
			mime: "text/html; charset=utf-8"
		});
	}
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var path = ctx.path;
	var user = ctx.user;
	var setCallback = ctx.setCallback;

	var db = server.db;
	var modules = server.modules;

	var world = await getOrCreateWorld(path);
	if(!world) return write(null, 404);
	
	setCallback(function() {
		releaseWorld(world);
	});

	var read_permission = await canViewWorld(world, user);
	if(!read_permission) {
		// no permission to view world?
		return write(null, 403);
	}

	ctx.world = world;
	ctx.isHTTP = true;

	var edits_parsed;
	try {
		edits_parsed = JSON.parse(post_data.edits);
	} catch(e) {
		return write(null, 400);
	}

	var do_write = await modules.write_data({
		edits: edits_parsed
	}, server, ctx);

	write(JSON.stringify(do_write.accepted));
}