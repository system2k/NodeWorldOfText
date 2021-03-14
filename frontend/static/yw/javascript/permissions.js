var PERM = {
	ADMIN: 2,
	MEMBERS: 1,
	PUBLIC: 0
};
var Permissions = {
	can_admin: function(user) {
		if(!user.authenticated) {
			return false;
		}
		return user.is_owner;
	},
	can_coordlink: function(user, world, optTile) {
		var action;
		var write;
		if(optTile) {
			write = Permissions.can_edit_tile(user, world, optTile);
		} else {
			write = Permissions.can_write(user, world);
		}
		action = Permissions.user_matches_perm(user, world, world.feature_coord_link);
		return write && action;
	},
	can_edit_tile: function(user, world, tile, charX, charY) {
		if (!tile.initted()) {
			throw new Error("Can't check perms on un-initted tile");
		}
		if (!Permissions.can_read(user, world)) {
			return false;
		}
		var targetWritability;
		if(tile.char) {
			targetWritability = tile.char[charY * tileC + charX];
			if(targetWritability == null) targetWritability = tile.writability; // inherit from tile
			if(targetWritability == null) targetWritability = world.writability; // inherit from world
		} else {
			targetWritability = tile.writability;
		}
		if(targetWritability === null) {
			return Permissions.can_write(user, world);
		}
		return Permissions.user_matches_perm(user, world, targetWritability);
	},
	can_go_to_coord: function(user, world) {
		return Permissions.can_read(user, world) && Permissions.user_matches_perm(user, world, world.feature_go_to_coord);
	},
	can_paste: function(user, world) {
		return Permissions.can_write(user, world) && Permissions.user_matches_perm(user, world, world.feature_paste);
	},
	can_protect_tiles: function(user, world) {
		if(Permissions.can_admin(user, world)) {
			return true;
		}
		return world.feature_membertiles_addremove && (_ref = world.id, user.is_member);
	},
	can_read: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.readability);
	},
	can_urllink: function(user, world, optTile) {
		var action;
		var write;
		if(optTile) {
			write = Permissions.can_edit_tile(user, world, optTile);
		} else {
			write = Permissions.can_write(user, world);
		}
		action = Permissions.user_matches_perm(user, world, world.feature_url_link);
		return write && action;
	},
	can_write: function(user, world) {
		if(!Permissions.can_read(user, world)) {
			return false;
		}
		return Permissions.user_matches_perm(user, world, world.writability);
	},
	get_perm_display: function(permission) {
		return ({
			0: "PUBLIC",
			1: "MEMBERS",
			2: "ADMIN"
		}[permission]);
	},
	user_matches_perm: function(user, world, perm) {
		if(perm === -1) {
			return false;
		}
		if(perm === PERM.PUBLIC) {
			return true;
		}
		if(!user.authenticated) {
			return false;
		}
		if(Permissions.can_admin(user, world)) {
			return true;
		}
		if(perm === PERM.ADMIN) {
			return false;
		}
		assert(perm === PERM.MEMBERS);
		return _ref = world.id, user.is_member;
	},
	can_chat: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.chat_permission);
	},
	can_color_text: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.color_text);
	}
};
