var PERM = {
	ADMIN: 2,
	MEMBERS: 1,
	PUBLIC: 0
};
var Permissions = {
	can_admin: function(user) {
		return user.is_owner;
	},
	can_coordlink: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.feature_coord_link);
	},
	can_edit_tile: function(user, world, tile, charX, charY) {
		if(!tile) {
			throw new Error("Can't check perms on un-initted tile");
		}
		if(!Permissions.can_read(user, world)) {
			return false;
		}
		var targetWritability;
		if(tile.char) {
			targetWritability = tile.char[charY * tileC + charX];
			if(targetWritability == null) targetWritability = tile.writability; // inherit from tile
			if(targetWritability == null) targetWritability = world.writability; // inherit from world
		} else {
			targetWritability = tile.writability;
			if(targetWritability == null) targetWritability = world.writability;
		}
		return Permissions.user_matches_perm(user, world, targetWritability);
	},
	can_go_to_coord: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.feature_go_to_coord);
	},
	can_paste: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.feature_paste);
	},
	can_copy: function(user, world) {
		if(user.is_owner || user.is_member) return true;
		return !world.no_copy;
	},
	can_protect_tiles: function(user, world) {
		if(user.is_owner) return true;
		return world.feature_membertiles_addremove && user.is_member;
	},
	can_erase: function(user, world) {
		if(user.is_owner) return true;
		return Permissions.user_matches_perm(user, world, world.quick_erase);
	},
	can_read: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.readability);
	},
	can_urllink: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.feature_url_link);
	},
	can_write: function(user, world) {
		if(!Permissions.can_read(user, world)) {
			return false;
		}
		return Permissions.user_matches_perm(user, world, world.writability);
	},
	can_chat: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.chat_permission);
	},
	can_show_cursor: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.show_cursor);
	},
	can_color_text: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.color_text);
	},
	can_color_cell: function(user, world) {
		return Permissions.user_matches_perm(user, world, world.color_cell);
	},
	user_matches_perm: function(user, world, perm) {
		if(perm == -1) { // no one
			return false;
		}
		if(perm == PERM.PUBLIC) { // anyone
			return true;
		}
		if(user.is_owner) {
			return true;
		}
		if(perm == PERM.ADMIN) {
			return false;
		}
		if(perm == PERM.MEMBERS && user.is_member) {
			return true;
		}
		return false;
	}
};
