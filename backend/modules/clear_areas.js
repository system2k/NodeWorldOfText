var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

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

	var memkeyAccess = world.opts.memKey && world.opts.memKey == params.keyQuery;

	var is_owner = user.id == world.ownerId || (user.superuser && isMainPage(world.name));
	var is_member = !!world.members.map[user.id] || memkeyAccess || (user.superuser && isMainPage(world.name));

	if(!is_owner) return;

	var tileX = san_nbr(data.tileX);
	var tileY = san_nbr(data.tileY);
	var charRange = data.charRange;
	if(charRange) {
		// reject request if char range is invalid
		if(!Array.isArray(charRange)) return;
		if(charRange.length != 4) return;
		charRange = [
			san_nbr(charRange[0]),
			san_nbr(charRange[1]),
			san_nbr(charRange[2]),
			san_nbr(charRange[3])
		];
		if(charRange[0] < 0 || charRange[1] < 0 || charRange[2] < 0 || charRange[2] < 0) return;
		if(charRange[0] >= CONST.tileCols || charRange[1] >= CONST.tileRows) return;
		if(charRange[2] >= CONST.tileCols || charRange[3] >= CONST.tileRows) return;
		// important - don't cause an infinite loop
		if(charRange[0] > charRange[2]) return;
		if(charRange[1] > charRange[3]) return;
	} else {
		charRange = null;
	}

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

	var idLabel = ipAddress;

	broadcastMonitorEvent("Clear", ipAddress + " set 'clear' on world '" + world.name + "' (" + world.id + "), coords (" + tileX + ", " + tileY + ")");

	var no_log_edits = world.opts.noLogEdits;

	if(!rate_limiter.setHold(idLabel, world.id, tileX, tileY)) {
		return [true, "RATE"];
	}

	await tile_database.write(tile_database.types.clear, {
		tileX, tileY,
		charRange,
		user, world, is_owner,
		channel, no_log_edits
	});

	rate_limiter.releaseHold(idLabel, world.id, tileX, tileY);
}