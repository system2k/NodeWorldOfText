// write url links and coordinate links
// this module implies the user has access to the world and that the world exists

var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;
var san_dp = utils.san_dp;

var restrictions = require("../utils/restrictions.js");
var checkCoalition = restrictions.checkCoalition;
var getRestrictions = restrictions.getRestrictions;

function isMainPage(name) {
	return name == "" || name.toLowerCase() == "main" || name.toLowerCase() == "owot";
}

module.exports = async function(data, server, params) {
	var user = params.user;
	var channel = params.channel;
	var world = params.world;

	var tile_database = server.tile_database;
	var broadcastMonitorEvent = server.broadcastMonitorEvent;
	var rate_limiter = server.rate_limiter;
	var loadPlugin = server.loadPlugin;

	var memkeyAccess = world.opts.memKey && world.opts.memKey == params.keyQuery;

	var is_owner = user.id == world.ownerId;
	is_owner = is_owner || (user.superuser && isMainPage(world.name));
	var is_member = !!world.members.map[user.id] || is_owner || memkeyAccess;

	var type = data.type;

	var tileX = san_nbr(data.tileX);
	var tileY = san_nbr(data.tileY);
	var charX = san_nbr(data.charX);
	var charY = san_nbr(data.charY);

	var url = data.url;
	var link_tileX = san_dp(data.link_tileX);
	var link_tileY = san_dp(data.link_tileY);

	var ipAddress;
	var ipAddressVal;
	var ipAddressFam;
	if(params.ws && params.ws.sdata) {
		ipAddress = params.ws.sdata.ipAddress;
		ipAddressVal = params.ws.sdata.ipAddressVal;
		ipAddressFam = params.ws.sdata.ipAddressFam;
	} else {
		ipAddress = params.ipAddress;
		ipAddressVal = params.ipAddressVal;
		ipAddressFam = params.ipAddressFam;
	}


	var restr = getRestrictions();
	var isGrouped = checkCoalition(ipAddressVal, ipAddressFam);

	var idLabel = isGrouped ? "cg1" : ipAddress;
	var linkLimiter = rate_limiter.prepareRateLimiter(rate_limiter.linkRateLimits, 1000, idLabel);
	var lrate = rate_limiter.checkLinkrateRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name);

	var no_log_edits = world.opts.noLogEdits;

	var can_link = false;
	var feature_mode;

	if(type == "url") {
		feature_mode = world.feature.urlLink;
	} else if(type == "coord") {
		feature_mode = world.feature.coordLink;
	} else {
		return [true, "PARAM"];
	}

	if(feature_mode == 2 && is_owner) {
		can_link = true;
	}
	if(feature_mode == 1 && is_member) {
		can_link = true;
	}
	if(feature_mode == 0) { // if everybody has link permission
		can_link = true;
	}

	if(!can_link) {
		return [true, "PERM"];
	}

	// the x position going from 0 - 127 may be used at times
	var charIdx = charY * CONST.tileCols + charX;
	charX = charIdx % CONST.tileCols;
	charY = Math.floor(charIdx / CONST.tileCols);

	if(charIdx < 0 || charIdx >= CONST.tileArea) { // out of range coords
		return [true, "PARAM"];
	}

	if(lrate != null) {
		if(!rate_limiter.checkCharRateLimit(linkLimiter, lrate, 1)) {
			return [true, "RATE"];
		}
	}
	if(!rate_limiter.setHold(idLabel, world.id, tileX, tileY)) {
		return [true, "RATE"];
	}

	broadcastMonitorEvent("Link", ipAddress + " set 'link' on world '" + world.name + "' (" + world.id + "), coords (" + tileX + ", " + tileY + ")");

	var plugin = loadPlugin();
	// plugin interface is subject to change - use at your own risk
	if(plugin && plugin.link) {
		try {
			plugin.link({
				ip: ipAddress,
				is_owner, is_member,
				tileX, tileY, charX, charY,
				type,
				url, link_tileX, link_tileY,
				user, world
			});
		} catch(e) {}
	}

	var resp = await tile_database.write(tile_database.types.link, {
		tileX, tileY, charX, charY,
		user, world, is_member, is_owner,
		type, url, link_tileX, link_tileY,
		channel, no_log_edits
	});

	rate_limiter.releaseHold(idLabel, world.id, tileX, tileY);

	return resp;
}