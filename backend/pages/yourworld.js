function isMainPage(name) {
	return name == "" || name.toLowerCase() == "main";
}

module.exports.GET = async function(req, serve, vars, evars, params) {
	var query_data = evars.query_data;
	var path = evars.path;
	var user = evars.user;
	var HTML = evars.HTML;
	var setCallback = evars.setCallback;

	var dispage = vars.dispage;
	var db = vars.db;
	var getOrCreateWorld = vars.getOrCreateWorld;
	var canViewWorld = vars.canViewWorld;
	var modules = vars.modules;
	var announcement = vars.announcement();
	var san_nbr = vars.san_nbr;
	var accountSystem = vars.accountSystem;
	var releaseWorld = vars.releaseWorld;
	var modifyWorldProp = vars.modifyWorldProp;
	var createCSRF = vars.createCSRF;

	var world_name = path;

	var world = await getOrCreateWorld(world_name);
	if(!world) return await dispage("404", null, req, serve, vars, evars);
	
	setCallback(function() {
		releaseWorld(world);
	});

	var memkeyAccess = (query_data.key && query_data.key == world.opts.memKey);

	var read_permission = await canViewWorld(world, user, { memkeyAccess });
	if(!read_permission) {
		return serve(null, null, {
			redirect: "/accounts/private/"
		});
	}

	if(query_data.fetch == 1) { // fetch request
		evars.world = world;
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
		}, vars, evars);
		if(typeof tiles == "string") {
			return serve(tiles);
		}
		if("data" in tiles) tiles = tiles.data;
		var tData;
		if(typeof tiles == "string") {
			tData = tiles;
		} else {
			tData = JSON.stringify(tiles);
		}
		return serve(tData, null, {
			mime: "application/json; charset=utf-8"
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
				show_cursor: world.feature.showCursor,
				char_rate: char_rate,
				write_interval: write_int
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
		return serve(HTML("yourworld.html", data), null, {
			mime: "text/html; charset=utf-8"
		});
	}
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var path = evars.path;
	var user = evars.user;
	var setCallback = evars.setCallback;

	var db = vars.db;
	var modules = vars.modules;
	var getOrCreateWorld = vars.getOrCreateWorld;
	var canViewWorld = vars.canViewWorld;
	var releaseWorld = vars.releaseWorld;

	var world = await getOrCreateWorld(path);
	if(!world) return serve(null, 404);
	
	setCallback(function() {
		releaseWorld(world);
	});

	var read_permission = await canViewWorld(world, user);
	if(!read_permission) {
		// no permission to view world?
		return serve(null, 403);
	}

	evars.world = world;

	var edits_parsed;
	try {
		edits_parsed = JSON.parse(post_data.edits);
	} catch(e) {
		return serve(null, 400);
	}

	var do_write = await modules.write_data({
		edits: edits_parsed,
		bypass: post_data.bypass
	}, vars, evars);

	serve(JSON.stringify(do_write.accepted));
}