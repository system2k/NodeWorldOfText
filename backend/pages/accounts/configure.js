var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;
var san_nbr = utils.san_nbr;
var san_dp = utils.san_dp;

var world_mgr = require("../../subsystems/world_mgr.js");
var modifyWorldProp = world_mgr.modifyWorldProp;
var releaseWorld = world_mgr.releaseWorld;
var getOrCreateWorld = world_mgr.getOrCreateWorld;
var promoteMembershipByWorldName = world_mgr.promoteMembershipByWorldName;
var revokeMembershipByWorldName = world_mgr.revokeMembershipByWorldName;
var renameWorld = world_mgr.renameWorld;

function validateCSS(c) {
	if(c == "default") return "";
	if(typeof c !== "string") return "";
	if(c.length > 100) c = c.slice(0, 100);
	c = c.replace(/{/g, "");
	c = c.replace(/}/g, "");
	c = c.replace(/;/g, "");
	c = c.replace(/\r/g, "");
	c = c.replace(/\n/g, "");
	// detect broken hex sequences and prepend '#'
	if(c.length == 3 || c.length == 6) {
		var hex = "abcdefABCDEF0123456789";
		var validHex = true;
		for(var i = 0; i < c.length; i++) {
			var chr = c[i];
			if(!hex.includes(chr)) {
				validHex = false;
				break;
			}
		}
		if(validHex) {
			c = "#" + c;
		}
	}
	return c.slice(0, 20);
}

function validatePerms(p, max, allowNeg) {
	if(!max) max = 2;
	var num = parseInt(p, 10);
	if(isNaN(num)) return 0;
	if(num === -1 && allowNeg) return -1;
	if(num < 0) return 0;
	if(num > max) return 0;
	return num;
}

function sendWorldStatusUpdate(server, worldId, userId, type, val) {
	var wss = server.wss;
	var wsSend = server.wsSend;
	wss.clients.forEach(function(client) {
		if(!client.sdata) return;
		if(!client.sdata.userClient) return;
		if(client.sdata.world.id != worldId) return;
		if(client.sdata.user.id != userId) return;
		wsSend(client, JSON.stringify({
			kind: "propUpdate",
			props: [
				{
					type: type,
					value: val
				}
			]
		}));
	});
}

module.exports.GET = async function(req, write, server, ctx, params) {
	var path = ctx.path;
	var render = ctx.render;
	var user = ctx.user;
	var setCallback = ctx.setCallback;

	var url = server.url;
	var db = server.db;
	var callPage = server.callPage;
	var uvias = server.uvias;
	var accountSystem = server.accountSystem;
	var createCSRF = server.createCSRF;

	if(!user.authenticated) {
		return write(null, null, {
			redirect: "/accounts/login/?next=" + url.parse(req.url).pathname
		});
	}

	// gets world name from /accounts/configure/{world...}/
	var world_name = checkURLParam("/accounts/configure/*world", path).world;

	var world = await getOrCreateWorld(world_name);
	if(!world) {
		return await callPage("404", null, req, write, server, ctx);
	}

	setCallback(function() {
		releaseWorld(world);
	});

	if(world.ownerId != user.id && !user.superuser) {
		return write("Access denied", 403);
	}

	world_name = world.name;

	var members = Object.keys(world.members.map);
	var member_list = []; // processed list of members
	for(var i = 0; i < members.length; i++) {
		var username;
		if(accountSystem == "uvias") {
			var uidt = members[i].slice(1);
			username = await uvias.get("SELECT * FROM accounts.users WHERE uid=('x'||lpad($1::text,16,'0'))::bit(64)::bigint", uidt);
			if(!username) {
				username = "deleted~" + uidt;
			} else {
				username = username.username;
			}
		} else if(accountSystem == "local") {
			username = await db.get("SELECT username FROM auth_user WHERE id=?", members[i]);
			username = username.username;
		}
		member_list.push({
			member_name: username
		});
	}

	// if empty, make sure server knows it's empty
	// ([] is considered to not be empty through boolean conversion)
	if(member_list.length === 0) member_list = null;

	// owner info for superusers
	var owner_name = "";

	if(world.ownerId && user.superuser) {
		if(accountSystem == "uvias") {
			var debug1 = world.ownerId;
			if(typeof debug1 == "string") debug1 = debug1.slice(1);
			owner_name = await uvias.get("SELECT username FROM accounts.users WHERE uid=('x'||lpad($1::text,16,'0'))::bit(64)::bigint", debug1);
			if(owner_name) {
				owner_name = owner_name.username;
			} else {
				owner_name = "deleted~" + debug1;
			}
		} else if(accountSystem == "local") {
			owner_name = (await db.get("SELECT username FROM auth_user WHERE id=?", [world.ownerId])).username;
		}
	}

	var color = world.theme.color || "default";
	var cursor_color = world.theme.cursor || "default";
	var cursor_guest_color = world.theme.guestCursor || "default";
	var bg = world.theme.bg || "default";
	var owner_color = world.theme.tileOwner || "default";
	var member_color = world.theme.tileMember || "default";

	var menu_color = world.theme.menu || "default";
	var public_text_color = world.theme.publicText || "default";
	var member_text_color = world.theme.memberText || "default";
	var owner_text_color = world.theme.ownerText || "default";

	var ratelim_val = 0;
	var ratelim_per = 0;
	if(world.opts.charRate) {
		var ratelim_raw = world.opts.charRate.split("/");
		ratelim_val = ratelim_raw[0];
		ratelim_per = ratelim_raw[1];
	}
	
	var write_int = world.opts.writeInt;
	if(write_int == -1) {
		write_int = 1000;
	}

	var is_memkey_enabled = false;
	if(world.opts.memKey) {
		is_memkey_enabled = true;
	}

	var square_chars = world.opts.squareChars;
	var half_chars = world.opts.halfChars;
	var mixed_chars = false;
	if(square_chars && half_chars) {
		square_chars = false;
		half_chars = false;
		mixed_chars = true;
	}

	// This isn't secure by all means, but it's good enough for now (temporary solution)
	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		user,

		world: world_name,
		csrftoken,
		members: member_list,
		add_member_message: params.message,
		misc_message: params.misc_message,

		readability: world.readability,
		writability: world.writability,

		go_to_coord: world.feature.goToCoord,
		coord_link: world.feature.coordLink,
		url_link: world.feature.urlLink,
		paste: world.feature.paste,
		membertiles_addremove: world.feature.memberTilesAddRemove,
		chat_permission: world.feature.chat,
		color_text: world.feature.colorText,
		color_cell: world.feature.colorCell,
		quick_erase: world.feature.quickErase,
		show_cursor: world.feature.showCursor,

		color,
		cursor_color,
		cursor_guest_color,
		bg,
		owner_color,
		member_color,

		menu_color,
		public_text_color,
		member_text_color,
		owner_text_color,

		owner_name,
		page_is_nsfw: world.opts.nsfw,
		square_chars,
		no_log_edits: world.opts.noLogEdits,
		no_chat_global: world.opts.noChatGlobal,
		no_copy: world.opts.noCopy,
		half_chars,
		mixed_chars,

		ratelim_val,
		ratelim_per,
		is_memkey_enabled,
		memkey_value: world.opts.memKey,
		writeinterval_val: write_int,

		background_path: world.background.url,
		background_x: world.background.x,
		background_y: world.background.y,
		background_w: world.background.w,
		background_h: world.background.h,
		background_rmod: world.background.rmod,
		background_alpha: world.background.alpha,

		default_script_path: world.opts.defaultScriptPath,

		priv_note: world.opts.privNote,
		meta_desc: world.opts.desc
	};

	write(render("configure.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var path = ctx.path;
	var user = ctx.user;
	var setCallback = ctx.setCallback;

	var db = server.db;
	var callPage = server.callPage;
	var url = server.url;
	var ws_broadcast = server.ws_broadcast;
	var chat_mgr = server.chat_mgr;
	var tile_database = server.tile_database;
	var uvias = server.uvias;
	var accountSystem = server.accountSystem;
	var wss = server.wss;
	var checkCSRF = server.checkCSRF;
	var wsSend = server.wsSend;

	var clearChatlog = chat_mgr.clearChatlog;

	if(!user.authenticated) {
		return write();
	}

	var world_name = checkURLParam("/accounts/configure/*world", path).world;

	var world = await getOrCreateWorld(world_name);
	if(!world) {
		return await callPage("404", null, req, write, server, ctx);
	}

	setCallback(function() {
		releaseWorld(world);
	});

	world_name = world.name;

	if(world.ownerId != user.id && !user.superuser) {
		return write("Access denied", 403);
	}

	var new_world_name = null;

	var csrftoken = post_data.csrfmiddlewaretoken;
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed - please try again. This could be the result of leaving your tab open for too long.");
	}

	if(post_data.form == "add_member") {
		var username = post_data.add_member;

		var adduser;
		var user_id;
		if(accountSystem == "uvias") {
			adduser = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", username);
		} else if(accountSystem == "local") {
			adduser = await db.get("SELECT * from auth_user WHERE username=? COLLATE NOCASE", username);
		}

		if(!adduser) {
			return await callPage("accounts/configure", { message: "User not found" }, req, write, server, ctx);
		}

		if(accountSystem == "uvias") {
			user_id = "x" + adduser.uid;
		} else if(accountSystem == "local") {
			user_id = adduser.id;
		}
		
		if(user_id == world.ownerId) {
			return await callPage("accounts/configure", {
				message: "User is already the owner of \"" + world_name + "\""
			}, req, write, server, ctx);
		}

		var isWhitelisted = world.members.map[user_id];
		if(isWhitelisted) {
			return await callPage("accounts/configure", {
				message: "User is already part of this world"
			}, req, write, server, ctx);
		}

		if(Object.keys(world.members.map).length >= 3000) {
			return await callPage("accounts/configure", {
				message: "There are too many members on this world"
			}, req, write, server, ctx);
		}

		if(await promoteMembershipByWorldName(world.name, user_id)) {
			sendWorldStatusUpdate(server, world.id, user_id, "isMember", true);
		}

		return await callPage("accounts/configure", {
			message: adduser.username + " is now a member of the \"" + world_name + "\" world"
		}, req, write, server, ctx);
	} else if(post_data.form == "access_perm") {
		var readability = validatePerms(post_data.readability, 2);
		var writability = validatePerms(post_data.writability, 2);
		wss.clients.forEach(function(e) {
			if(!e.sdata) return;
			if(!e.sdata.userClient) return;
			if(e.sdata.world.id == world.id) {
				var memkeyAccess = world.opts.memKey && world.opts.memKey == e.sdata.keyQuery;
				var isOwner = world.ownerId == e.sdata.user.id; // TODO: what if superuser on main page? again, overhaul this system.
				var isMember = !!world.members.map[e.sdata.user.id] || memkeyAccess;
				if(readability == 1 && !isMember && !isOwner) {
					e.close();
					return;
				}
				if(readability == 2 && !isOwner) {
					e.close();
					return;
				}
				wsSend(e, JSON.stringify({
					kind: "propUpdate",
					props: [
						{
							type: "readability",
							value: readability
						},
						{
							type: "writability",
							value: writability
						}
					]
				}));
			}
		});
		modifyWorldProp(world, "readability", readability);
		modifyWorldProp(world, "writability", writability);
	} else if(post_data.form == "remove_member") {
		var to_remove = "";
		for(var key in post_data) {
			if(key.startsWith("remove_")) to_remove = key;
		}
		var id_to_remove = void 0;
		var validId = true;
		var username_to_remove = to_remove.substr("remove_".length);
		var revocationStatus = false;
		var revokedId = "";
		if(accountSystem == "uvias") {
			if(username_to_remove.startsWith("deleted~")) {
				id_to_remove = username_to_remove.substr("deleted~".length);
				if(id_to_remove.length < 1 || id_to_remove.length > 16) validId = false;
				var validSet = "0123456789abcdef";
				for(var c = 0; c < id_to_remove.length; c++) {
					if(validSet.indexOf(id_to_remove.charAt(c)) == -1) {
						validId = false;
						break;
					}
				}
				if(validId) {
					id_to_remove = "x" + id_to_remove;
					revocationStatus = await revokeMembershipByWorldName(world.name, id_to_remove);
					revokedId = id_to_remove;
				}
			} else {
				var remuser = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", [username_to_remove]);
				if(remuser) {
					var remuid = "x" + remuser.uid;
					id_to_remove = remuid;
					revocationStatus = await revokeMembershipByWorldName(world.name, remuid);
					revokedId = remuid;
				}
			}
		} else if(accountSystem == "local") {
			var id_to_remove = await db.get("SELECT id FROM auth_user WHERE username=? COLLATE NOCASE", username_to_remove);
			if(id_to_remove) {
				id_to_remove = id_to_remove.id;
				revocationStatus = await revokeMembershipByWorldName(world.name, id_to_remove);
				revokedId = id_to_remove;
			}
		}
		if(revocationStatus && revocationStatus[0]) {
			sendWorldStatusUpdate(server, world.id, revokedId, "isMember", false);
		}
	} else if(post_data.form == "features") {
		var go_to_coord = validatePerms(post_data.go_to_coord, 2);
		var coord_link = validatePerms(post_data.coord_link, 2);
		var url_link = validatePerms(post_data.url_link, 2);
		var paste = validatePerms(post_data.paste, 2);
		var chat = validatePerms(post_data.chat, 2, true);
		var show_cursor = validatePerms(post_data.show_cursor, 2, true);
		var color_text = validatePerms(post_data.color_text, 2);
		var color_cell = validatePerms(post_data.color_cell, 2, true);
		var quick_erase = validatePerms(post_data.quick_erase, 2);
		if(quick_erase == 0) quick_erase = 2; // we do not allow public access to quick erase
		var membertiles_addremove = post_data.membertiles_addremove;
		if(membertiles_addremove == "false") {
			membertiles_addremove = 0;
		} else if(membertiles_addremove == "true") {
			membertiles_addremove = 1;
		} else {
			membertiles_addremove = 0;
		}

		var featureUpdates = [];

		if(modifyWorldProp(world, "feature/goToCoord", go_to_coord)) {
			featureUpdates.push({type: "goToCoord", value: go_to_coord});
		}
		if(modifyWorldProp(world, "feature/coordLink", coord_link)) {
			featureUpdates.push({type: "coordLink", value: coord_link});
		}
		if(modifyWorldProp(world, "feature/urlLink", url_link)) {
			featureUpdates.push({type: "urlLink", value: url_link});
		}
		if(modifyWorldProp(world, "feature/paste", paste)) {
			featureUpdates.push({type: "paste", value: paste});
		}
		if(modifyWorldProp(world, "feature/chat", chat)) {
			featureUpdates.push({type: "chat", value: chat});
		}
		if(modifyWorldProp(world, "feature/showCursor", show_cursor)) {
			featureUpdates.push({type: "showCursor", value: show_cursor});
		}
		if(modifyWorldProp(world, "feature/colorText", color_text)) {
			featureUpdates.push({type: "colorText", value: color_text});
		}
		if(modifyWorldProp(world, "feature/colorCell", color_cell)) {
			featureUpdates.push({type: "colorCell", value: color_cell});
		}
		if(modifyWorldProp(world, "feature/quickErase", quick_erase)) {
			featureUpdates.push({type: "quickErase", value: quick_erase});
		}
		if(modifyWorldProp(world, "feature/memberTilesAddRemove", Boolean(membertiles_addremove))) {
			featureUpdates.push({type: "memberTilesAddRemove", value: Boolean(membertiles_addremove)});
		}

		if(featureUpdates.length) {
			ws_broadcast({
				kind: "propUpdate",
				props: featureUpdates
			}, world.id);
		}
	} else if(post_data.form == "style") {
		var color = validateCSS(post_data.color);
		var cursor_color = validateCSS(post_data.cursor_color);
		var cursor_guest_color = validateCSS(post_data.cursor_guest_color);
		var bg = validateCSS(post_data.bg);
		var owner_color = validateCSS(post_data.owner_color);
		var member_color = validateCSS(post_data.member_color);

		var menu_color = validateCSS(post_data.menu_color);
		var public_text_color = validateCSS(post_data.public_text_color);
		var member_text_color = validateCSS(post_data.member_text_color);
		var owner_text_color = validateCSS(post_data.owner_text_color);

		modifyWorldProp(world, "theme/color", color);
		modifyWorldProp(world, "theme/cursor", cursor_color);
		modifyWorldProp(world, "theme/guestCursor", cursor_guest_color);
		modifyWorldProp(world, "theme/bg", bg);
		modifyWorldProp(world, "theme/tileOwner", owner_color);
		modifyWorldProp(world, "theme/tileMember", member_color);
		modifyWorldProp(world, "theme/menu", menu_color);
		modifyWorldProp(world, "theme/publicText", public_text_color);
		modifyWorldProp(world, "theme/memberText", member_text_color);
		modifyWorldProp(world, "theme/ownerText", owner_text_color);

		ws_broadcast({
			kind: "colors",
			colors: {
				cursor: cursor_color || "#ff0",
				guest_cursor: cursor_guest_color || "#ffa",
				text: color || "#000",
				member_area: member_color || "#eee",
				background: bg || "#fff",
				owner_area: owner_color || "#ddd",
				menu: menu_color || "#e5e5ff",
				public_text: public_text_color || "#000",
				member_text: member_text_color || "#000",
				owner_text: owner_text_color || "#000"
			}
		}, world.id);
	} else if(post_data.form == "misc") {
		var msgResponseMisc = [];
		var memkeyUpdated = false;
		var charrateUpdated = false;
		var writeintUpdated = false;
		var noCopyUpdated = false;
		var newCharrate = null;
		if(user.superuser) {
			if(!post_data.world_background) {
				modifyWorldProp(world, "background/url", "");
			} else {
				modifyWorldProp(world, "background/url", post_data.world_background);
			}

			if(!post_data.world_background_x || post_data.world_background_x == "0") {
				modifyWorldProp(world, "background/x", 0);
			} else {
				modifyWorldProp(world, "background/x", san_nbr(post_data.world_background_x));
			}

			if(!post_data.world_background_y || post_data.world_background_y == "0") {
				modifyWorldProp(world, "background/y", 0);
			} else {
				modifyWorldProp(world, "background/y", san_nbr(post_data.world_background_y));
			}

			if(!post_data.world_background_w || post_data.world_background_w == "0") {
				modifyWorldProp(world, "background/w", 0);
			} else {
				var bw = san_nbr(post_data.world_background_w);
				if(bw < 0) bw = 0;
				if(bw >= 2500) bw = 2500;
				modifyWorldProp(world, "background/w", bw);
			}

			if(!post_data.world_background_h || post_data.world_background_h == "0") {
				modifyWorldProp(world, "background/h", 0);
			} else {
				var bh = san_nbr(post_data.world_background_h);
				if(bh < 0) bh = 0;
				if(bh >= 2500) bh = 2500;
				modifyWorldProp(world, "background/h", bh);
			}

			if(!post_data.background_repeat_mode || post_data.background_repeat_mode == "0") {
				modifyWorldProp(world, "background/rmod", 0);
			} else {
				var rm = san_nbr(post_data.background_repeat_mode);
				if(rm < 0) rm = 0;
				if(rm > 2) rm = 2;
				modifyWorldProp(world, "background/rmod", rm);
			}

			if(!post_data.background_alpha || post_data.background_alpha == "1") {
				modifyWorldProp(world, "background/alpha", 1);
			} else {
				modifyWorldProp(world, "background/alpha", san_dp(post_data.background_alpha)); // can be -1
			}

			if(!post_data.default_script_path) {
				modifyWorldProp(world, "opts/defaultScriptPath", "");
			} else {
				var defPath = post_data.default_script_path;
				if(typeof defPath == "string" && defPath.length <= 512) {
					modifyWorldProp(world, "opts/defaultScriptPath", defPath);
				}
			}
		}

		if(post_data.nsfw_page == "on") {
			modifyWorldProp(world, "opts/nsfw", true);
		} else {
			modifyWorldProp(world, "opts/nsfw", false);
		}

		if(post_data.no_log_edits == "on") {
			modifyWorldProp(world, "opts/noLogEdits", true);
		} else {
			modifyWorldProp(world, "opts/noLogEdits", false);
		}

		if(post_data.no_chat_global == "on") {
			modifyWorldProp(world, "opts/noChatGlobal", true);
		} else {
			modifyWorldProp(world, "opts/noChatGlobal", false);
		}

		if(post_data.no_copy == "on") {
			noCopyUpdated = modifyWorldProp(world, "opts/noCopy", true);
		} else {
			noCopyUpdated = modifyWorldProp(world, "opts/noCopy", false);
		}

		if("ratelim_val" in post_data && "ratelim_per" in post_data) {
			// 0/0 = disabled
			// 0/1 = not writable
			// 16/1000 = 16 chars per second
			var ratelim_val = san_nbr(post_data.ratelim_val);
			var ratelim_per = san_nbr(post_data.ratelim_per);
			if(ratelim_val < 0) ratelim_val = 0;
			if(ratelim_val == 0 && ratelim_per) {
				ratelim_per = 1;
			}
			if(ratelim_val > 20480) ratelim_val = 20480;
			if(ratelim_per <= 0) {
				ratelim_per = 0;
				ratelim_val = 0;
			} else if(ratelim_per > 1000 * 60 * 60 * 7) {
				ratelim_per = 1000 * 60 * 60 * 7;
			}
			if(ratelim_val == 0 && ratelim_per == 0) {
				if(modifyWorldProp(world, "opts/charRate", "")) {
					charrateUpdated = true;
					newCharrate = [20480, 1000];
				}
			} else {
				if(modifyWorldProp(world, "opts/charRate", ratelim_val + "/" + ratelim_per)) {
					charrateUpdated = true;
					newCharrate = [ratelim_val, ratelim_per];
				}
			}
		}

		if("writeinterval_val" in post_data) {
			var writeinterval_val = san_nbr(post_data.writeinterval_val);
			var wint = -1;
			if(writeinterval_val >= 66 && writeinterval_val <= 10000) {
				wint = writeinterval_val;
			}
			if(wint == 1000) wint = -1; // reset the value
			if(modifyWorldProp(world, "opts/writeInt", wint)) {
				writeintUpdated = true;
			}
		}

		if(charrateUpdated) {
			ws_broadcast({
				kind: "propUpdate",
				props: [
					{
						type: "charRate",
						value: newCharrate
					}
				]
			}, world.id);
		}

		if(writeintUpdated) {
			ws_broadcast({
				kind: "propUpdate",
				props: [
					{
						type: "writeInt",
						value: world.opts.writeInt == -1 ? 1000 : world.opts.writeInt
					}
				]
			}, world.id);
		}

		if(noCopyUpdated) {
			ws_broadcast({
				kind: "propUpdate",
				props: [
					{
						type: "noCopy",
						value: world.opts.noCopy
					}
				]
			}, world.id);
		}

		if(post_data.memkey_enabled == "on") {
			var key = post_data.memkey_value;
			if(!key || typeof key != "string") {
				msgResponseMisc.push("Member key removed");
				modifyWorldProp(world, "opts/memKey", "");
				memkeyUpdated = true;
			} else {
				if(key.length > 64) {
					msgResponseMisc.push("Member key is too long (max 64 chars)");
				} else {
					memkeyUpdated = modifyWorldProp(world, "opts/memKey", key);
				}
			}
		} else {
			memkeyUpdated = modifyWorldProp(world, "opts/memKey", "");
		}

		if(post_data.meta_desc) {
			var mdesc = post_data.meta_desc;
			if(typeof mdesc != "string") mdesc = "";
			mdesc = mdesc.trim();
			mdesc = mdesc.slice(0, 600);
			mdesc = mdesc.replace(/\r|\n/g, " ");
			modifyWorldProp(world, "opts/desc", mdesc);
		} else {
			modifyWorldProp(world, "opts/desc", "");
		}

		if(post_data.priv_note) {
			var pnote = post_data.priv_note;
			if(typeof pnote != "string") pnote = "";
			pnote = pnote.trim();
			pnote = pnote.slice(0, 600);
			pnote = pnote.replace(/\r|\n/g, " ");
			modifyWorldProp(world, "opts/privNote", pnote);
		} else {
			modifyWorldProp(world, "opts/privNote", "");
		}

		if(post_data.charsize == "default") {
			modifyWorldProp(world, "opts/squareChars", false);
			modifyWorldProp(world, "opts/halfChars", false);
		} else if(post_data.charsize == "square") {
			modifyWorldProp(world, "opts/squareChars", true);
			modifyWorldProp(world, "opts/halfChars", false);
		} else if(post_data.charsize == "half") {
			modifyWorldProp(world, "opts/squareChars", false);
			modifyWorldProp(world, "opts/halfChars", true);
		} else if(post_data.charsize == "mixed") {
			modifyWorldProp(world, "opts/squareChars", true);
			modifyWorldProp(world, "opts/halfChars", true);
		} else {
			modifyWorldProp(world, "opts/squareChars", false);
			modifyWorldProp(world, "opts/halfChars", false);
		}

		if(memkeyUpdated) {
			wss.clients.forEach(function(e) {
				if(!e.sdata) return;
				if(!e.sdata.userClient) return;
				if(e.sdata.world.id == world.id) {
					var readability = world.readability;
					var memkeyAccess = Boolean(world.opts.memKey) && world.opts.memKey == e.sdata.keyQuery;
					var isOwner = world.ownerId == e.sdata.user.id;
					var isMember = !!world.members.map[e.sdata.user.id] || memkeyAccess;
					if(readability == 1 && !isMember && !isOwner) {
						e.close();
						return;
					}
					if(readability == 2 && !isOwner) {
						e.close();
						return;
					}
					// TODO: overhaul system
					wsSend(e, JSON.stringify({
						kind: "propUpdate",
						props: [
							{
								type: "isMember",
								value: isMember
							}
						]
					}));
				}
			});
		}

		// the world name is being changed
		var new_name = post_data.new_world_name;
		if(typeof new_name == "string" && new_name && new_name != world.name) {
			var stat = await renameWorld(world, new_name, user);
			if(stat.error) {
				return await callPage("accounts/configure", {
					misc_message: stat.message
				}, req, write, server, ctx);
			} else if(stat.success) {
				new_world_name = new_name;
				var idUpdList = stat.list;
				for(var l = 0; l < idUpdList.length; l++) {
					var upd = idUpdList[l];
					var updId = upd[0];
					var updName = upd[1];
					ws_broadcast({
						kind: "propUpdate",
						props: [
							{
								type: "name",
								value: updName
							}
						]
					}, updId);
				}
			}
		}
		if(msgResponseMisc.length) {
			return await callPage("accounts/configure", {
				misc_message: msgResponseMisc.join("<br>")
			}, req, write, server, ctx);
		}
	} else if(post_data.form == "action") {
		if("unclaim" in post_data) {
			if(modifyWorldProp(world, "ownerId", null)) {
				modifyWorldProp(world, "ownershipChangeDate", Date.now());
				sendWorldStatusUpdate(server, world.id, user.id, "isOwner", false);
				var isMember = Boolean(world.members.map[user.id]);
				if(!isMember) {
					sendWorldStatusUpdate(server, world.id, user.id, "isMember", false);
				}
			}
			return write(null, null, {
				redirect: "/accounts/profile/"
			});
		} else if("clear_public" in post_data) {
			tile_database.write(tile_database.types.publicclear, {
				date: Date.now(),
				world,
				user
			});
		} else if("clear_all" in post_data) {
			tile_database.write(tile_database.types.eraseworld, {
				date: Date.now(),
				world,
				user
			});
		} else if("clear_chat_hist" in post_data) {
			clearChatlog(world.id);
		}
	}

	if(new_world_name == null) {
		write(null, null, {
			redirect: url.parse(req.url).pathname
		});
	} else { // world name changed, redirect to new name
		write(null, null, {
			redirect: "/accounts/configure/" + new_world_name + "/"
		});
	}
}