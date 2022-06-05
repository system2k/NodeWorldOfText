// write url links and coordinate links
// this module implies the user has access to the world and that the world exists

function isMainPage(name) {
	return name == "" || name.toLowerCase() == "main";
}

module.exports = async function(data, vars, evars) {
	var user = evars.user;
	var channel = evars.channel;
	var world = evars.world;

	var san_nbr = vars.san_nbr;
	var san_dp = vars.san_dp;
	var tile_database = vars.tile_database;
	var monitorEventSockets = vars.monitorEventSockets;
	var broadcastMonitorEvent = vars.broadcastMonitorEvent;
	var getRestrictions = vars.getRestrictions;
	var checkCoalition = vars.checkCoalition;
	var rate_limiter = vars.rate_limiter;

	var memkeyAccess = world.opts.memKey && world.opts.memKey == evars.keyQuery;

	var is_owner = user.id == world.ownerId;
	is_owner = is_owner || (user.superuser && isMainPage(world.name));
	var is_member = !!world.members.map[user.id] || is_owner || memkeyAccess;

	var type = data.type;

	var tileX = san_nbr(data.tileX);
	var tileY = san_nbr(data.tileY);
	var charX = san_nbr(data.charX);
	var charY = san_nbr(data.charY);

	var url = data.url
	var link_tileX = san_dp(data.link_tileX);
	var link_tileY = san_dp(data.link_tileY);

	var ipAddress;
	var ipAddressVal;
	var ipAddressFam;
	if(evars.ws && evars.ws.sdata) {
		ipAddress = evars.ws.sdata.ipAddress;
		ipAddressVal = evars.ws.sdata.ipAddressVal;
		ipAddressFam = evars.ws.sdata.ipAddressFam;
	} else {
		ipAddress = evars.ipAddress;
		ipAddressVal = evars.ipAddressVal;
		ipAddressFam = evars.ipAddressFam;
	}


	var restr = getRestrictions();
	var isGrouped = checkCoalition(ipAddressVal, ipAddressFam);

	var idLabel = isGrouped ? "cg1" : ipAddress;
	var linkLimiter = rate_limiter.prepareRateLimiter(rate_limiter.linkRateLimits, 1000, idLabel);
	var lrate = rate_limiter.checkLinkrateRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name);

	if(monitorEventSockets.length) {
		broadcastMonitorEvent("Link", ipAddress + " set 'link' on world '" + world.name + "' (" + world.id + "), coords (" + tileX + ", " + tileY + ")");
	}

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
	if(!rate_limiter.setHold(idLabel, tileX, tileY)) {
		return [true, "RATE"];
	}

	var call_id = tile_database.newCallId();
	tile_database.reserveCallId(call_id);

	tile_database.write(call_id, tile_database.types.link, {
		tileX, tileY, charX, charY,
		user, world, is_member, is_owner,
		type, url, link_tileX, link_tileY,
		channel, no_log_edits,
		no_update: false
	});

	rate_limiter.releaseHold(idLabel, tileX, tileY);

	var resp = await tile_database.editResponse(call_id);

	return resp;
}