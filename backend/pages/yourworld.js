module.exports.startup_internal = function(vars) {
	return;
}

module.exports.server_exit = async function() {
	return;
}

module.exports.GET = async function(req, serve, vars, evars, params) {
	var query_data = evars.query_data;
	var path = evars.path;
	var user = evars.user;
	var HTML = evars.HTML;

	var dispage = vars.dispage;
	var db = vars.db;
	var world_get_or_create = vars.world_get_or_create;
	var can_view_world = vars.can_view_world;
	var modules = vars.modules;
	var announcement = vars.announcement();
	var san_nbr = vars.san_nbr;
	var accountSystem = vars.accountSystem;
	var releaseWorld = vars.releaseWorld;

	var modifyWorldProp = vars.modifyWorldProp;

	var world_name = path;
	if(params.timemachine) {
		world_name = params.world;
	}

	var world = await world_get_or_create(world_name);
	if(!world) return await dispage("404", null, req, serve, vars, evars);
	releaseWorld(world);

	var read_permission = await can_view_world(world, user, db);
	if(!read_permission) {
		return serve(null, null, {
			redirect: "/accounts/private/"
		});
	}

	if(query_data.fetch == 1) { // fetch request
		evars.timemachine = { active: params.timemachine };
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
			world.views++;
			modifyWorldProp(world, "views");
		}
		var pathname = world.name;
		if(pathname != "") {
			pathname = "/" + pathname;
		}
		if(params.timemachine) {
			pathname = "/" + path;
			if(pathname.charAt(pathname.length - 1) == "/") pathname = pathname.slice(0, -1);
		}
		var username = user.username;
		if(accountSystem == "uvias") {
			username = user.display_username;
		}
		var state = {
			userModel: {
				username: username,
				is_superuser: user.superuser, // Admin of OWOT?
				authenticated: user.authenticated,
				is_member: read_permission.member || (user.superuser && world.name == ""), // Member of world?
				is_owner: read_permission.owner || (user.superuser && world.name == ""), // Owner of world?
				is_staff: user.staff, // Staff of OWOT?
				is_operator: user.operator // Operator of OWOT?
			},
			worldModel: { // mirror to world_props.js
				feature_membertiles_addremove: world.feature.memberTilesAddRemove,
				writability: world.writability,
				feature_url_link: world.feature.urlLink,
				feature_go_to_coord: world.feature.goToCoord,
				name: world.name,
				feature_paste: world.feature.paste,
				namespace: world.name.split("/")[0],
				readability: world.readability,
				feature_coord_link: world.feature.coordLink,
				pathname,
				chat_permission: world.feature.chat,
				color_text: world.feature.colorText,
				show_cursor: world.feature.showCursor
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
		if(params.timemachine) {
			state.worldModel.writability = 0;
			state.worldModel.timemachine = true;
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
			if(world.background.alpha) { // TODO: ensure it works properly
				state.background.alpha = world.background.alpha;
			}
		}
		var page_title = "Our World of Text";
		if(world.name) {
			page_title = "/" + world.name;
		}
		var meta_desc = world.opts.desc;
		if(!world.name) {
			meta_desc = "";
		}
		var data = {
			state: JSON.stringify(state),
			page_title,
			nsfw: world.opts.nsfw,
			meta_desc
		}
		return serve(HTML("yourworld.html", data), null, {
			mime: "text/html; charset=utf-8"
		});
	}
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var path = evars.path;
	var user = evars.user;

	var db = vars.db;
	var modules = vars.modules;
	var world_get_or_create = vars.world_get_or_create;
	var can_view_world = vars.can_view_world;
	var releaseWorld = vars.releaseWorld;

	var world = await world_get_or_create(path);
	if(!world) return serve(null, 404);
	releaseWorld(world);

	var read_permission = await can_view_world(world, user, db);
	if(!read_permission) {
		// no permission to view world?
		return serve(null, 403);
	}

	evars.world = world;
	//evars.user.stats = read_permission; // TODO

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