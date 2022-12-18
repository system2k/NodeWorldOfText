var utils = require("../utils/utils.js");
var fixColors = utils.fixColors;
var advancedSplit = utils.advancedSplit;
var san_nbr = utils.san_nbr;

var emptyWriteResponse = { accepted: [], rejected: {} };

function isMainPage(name) {
	return name == "" || name.toLowerCase() == "main" || name.toLowerCase() == "owot";
}

module.exports = async function(data, vars, evars) {
	var user = evars.user;
	var channel = evars.channel;
	var world = evars.world;
	
	var isHTTP = evars.isHTTP;
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
	
	var get_bypass_key = vars.get_bypass_key;
	var tile_database = vars.tile_database;
	var broadcastMonitorEvent = vars.broadcastMonitorEvent;
	var getRestrictions = vars.getRestrictions;
	var checkCoalition = vars.checkCoalition;
	var rate_limiter = vars.rate_limiter;

	var editReqLimit = 512;
	var superuserEditReqLimit = 1280;
	var defaultCharRatePerSecond = 20480;
	var tileRatePerSecond = 256;

	var restr = getRestrictions();
	var isGrouped = checkCoalition(ipAddressVal, ipAddressFam);

	var bypass_key = get_bypass_key();
	if(!bypass_key) {
		bypass_key = NaN;
	}

	var public_only = !!data.public_only;
	var no_update = !!data.no_update;
	var preserve_links = !!data.preserve_links;

	var editLimit = editReqLimit;
	if(user.superuser) {
		editLimit = superuserEditReqLimit;
	}

	var world_id = world.id;

	var no_log_edits = world.opts.noLogEdits;
	var color_text = world.feature.colorText;
	var color_cell = world.feature.colorCell;

	var memkeyAccess = world.opts.memKey && world.opts.memKey == evars.keyQuery;

	var is_owner = user.id == world.ownerId;
	is_owner = is_owner || (user.superuser && isMainPage(world.name));
	var is_member = !!world.members.map[user.id] || is_owner || memkeyAccess;

	var can_color_text = true;
	if(color_text == 1 && !is_member) can_color_text = false;
	if(color_text == 2 && !is_owner) can_color_text = false;

	var can_color_cell = color_cell != -1;
	if(color_cell == 1 && !is_member) can_color_cell = false;
	if(color_cell == 2 && !is_owner) can_color_cell = false;

	var edits = data.edits;
	if(!edits) return emptyWriteResponse;
	if(!Array.isArray(edits)) return emptyWriteResponse;

	var rejected = {};
	/*
	1: NO_TILE_PERM
	2: CHAR_RATE_LIMIT
	3: TILE_RATE_LIMIT
	4: ZERO_RATE_LIMIT
	5: TOO_MANY_HOLDS
	*/
	// TODO: use constants (some rejected values may be added by the tile manager subsystem)

	var idLabel = isGrouped ? "cg1" : ipAddress;
	
	var tileLimiter = rate_limiter.prepareRateLimiter(rate_limiter.tileRateLimits, 1000, idLabel);
	var editLimiter = rate_limiter.prepareRateLimiter(rate_limiter.editRateLimits, 1000, idLabel);

	var customLimit = world.opts.charRate;
	var customLimiter = null;
	var charsPerPeriod;
	if(customLimit && !is_member) {
		customLimit = customLimit.split("/");
		if(customLimit.length == 2) {
			charsPerPeriod = parseInt(customLimit[0]);
			var periodLength = parseInt(customLimit[1]);
			customLimiter = rate_limiter.prepareRateLimiter(rate_limiter.editRateLimits, periodLength, ipAddress + "-world-" + world_id);
		}
	}

	var httpWriteDenied = isHTTP && rate_limiter.checkHTTPWriteRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name);

	var totalEdits = 0;
	var tiles = {};
	var tileCount = 0;
	// organize edits into tile coordinates
	for(var i = 0; i < edits.length; i++) {
		var segment = edits[i];
		if(!segment || !Array.isArray(segment)) continue;
		var tileY = san_nbr(segment[0]);
		var tileX = san_nbr(segment[1]);
		var charRatePerSecond = defaultCharRatePerSecond;

		var rrate = rate_limiter.checkCharrateRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name, tileX, tileY);
		if(rrate != null) {
			charRatePerSecond = rrate;
		}

		var tileStr = tileY + "," + tileX;
		var char = segment[5];
		segment[6] = san_nbr(segment[6]); // edit id
		var editID = segment[6];
		if(typeof char != "string") continue;
		if(!rate_limiter.checkCharRateLimit(editLimiter, charRatePerSecond, 1)) {
			rejected[editID] = 2;
			if(charRatePerSecond == 0) rejected[editID] = 4;
			continue;
		}
		if(customLimiter && rrate == null) {
			if(!rate_limiter.checkCharRateLimit(customLimiter, charsPerPeriod, 1)) {
				rejected[editID] = 2;
				if(charsPerPeriod == 0) rejected[editID] = 4;
				continue;
			}
		}
		if(isHTTP && httpWriteDenied) {
			rejected[editID] = 4;
			continue;
		}
		if(!tiles[tileStr]) {
			if(!rate_limiter.checkTileRateLimit(tileLimiter, tileRatePerSecond, tileX, tileY, world_id)) {
				rejected[editID] = 3;
				continue;
			}
			if(!rate_limiter.setHold(idLabel, tileX, tileY)) {
				rejected[editID] = 5;
				continue;
			}
			tiles[tileStr] = [];
			tileCount++;
		}
		totalEdits++;
		if(totalEdits > editLimit) { // edit limit reached
			break;
		}
		tiles[tileStr].push(segment);
	}

	if(evars && vars.monitorEventSockets.length) {
		var ip = "", cliId = "", chan = "";
		if(evars.ws) {
			ip = evars.ws.sdata.ipAddress;
			cliId = evars.ws.sdata.clientId;
			chan = channel;
		} else {
			ip = ipAddress;
			cliId = "--";
			chan = "(Via HTTP)";
		}
		var textLog = ip + ", [" + cliId + ", '" + chan + "'] sent 'write' on world ['" + world.name + "', " + world.id + "]. " + tileCount + " modified tiles, " + totalEdits + " edits";
		broadcastMonitorEvent("Write", textLog);
	}

	var call_id = tile_database.newCallId();
	tile_database.reserveCallId(call_id);

	var currentDate = Date.now();
	var tile_edits = [];

	for(var i in tiles) {
		var incomingEdits = tiles[i];
		var changes = [];

		var canColor = true;
		var pos = i.split(",");
		var tileX = parseInt(pos[1]);
		var tileY = parseInt(pos[0]);
		if(rate_limiter.checkColorRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name, tileX, tileY)) {
			canColor = false;
		}

		for(var k = 0; k < incomingEdits.length; k++) {
			var editIncome = incomingEdits[k];

			editIncome[0] = san_nbr(editIncome[0]);
			editIncome[1] = san_nbr(editIncome[1]);
			var charX = san_nbr(editIncome[3]);
			var charY = san_nbr(editIncome[2]);
			var charInsIdx = charY * CONST.tileCols + charX;
			if(charInsIdx < 0) charInsIdx = 0;
			if(charInsIdx > CONST.tileArea - 1) charInsIdx = CONST.tileArea - 1;

			charX = charInsIdx % CONST.tileCols;
			charY = Math.floor(charInsIdx / CONST.tileCols);
			editIncome[3] = charX;
			editIncome[2] = charY;

			var char = editIncome[5];
			if(typeof char != "string") {
				char = "?";
			}
			char = advancedSplit(char);
			if(char.length <= 1) {
				if(!editIncome[7]) editIncome[7] = 0;
				if(Array.isArray(editIncome[7])) {
					editIncome[7] = fixColors(editIncome[7][0]);
				} else {
					editIncome[7] = fixColors(editIncome[7]);
				}
				// client is restricted from using colors at specific parameters
				if(!canColor) {
					editIncome[7] = 0;
				}

				// validate & normalize the bgColor (no guarantee it will be accepted)
				var bgColor = editIncome[8];
				if(bgColor !== null) {
					if(bgColor === void 0) bgColor = -1;
					bgColor = san_nbr(bgColor);
					if(bgColor < -1) bgColor = -1;
					if(bgColor > 16777215) bgColor = 16777215;
				}
				editIncome[8] = bgColor;

				changes.push(editIncome);
				continue;
			} else {
				// only password holders, superusers, owners, or members can use multiple characters per edit
				if(!user.superuser && !(is_owner || is_member) && data.bypass != bypass_key) {
					char = char.slice(0, 1);
				}
			}
			// TODO: refactor this bit of redundant code
			for(var i = 0; i < char.length; i++) {
				var newIdx = charInsIdx + i;
				if(newIdx > CONST.tileArea - 1) continue; // overflow
				// convert back to proper X/Y
				var newX = newIdx % CONST.tileCols;
				var newY = Math.floor(newIdx / CONST.tileCols);
				var newChar = char[i]; // don't filter the edit yet. that is handled in the database subsystem.
				var newColor = editIncome[7];
				var newBgColor = editIncome[8];
				if(Array.isArray(newColor)) {
					// color is an array, get individual values
					newColor = fixColors(newColor[i]);
				} else {
					// color is a number
					newColor = fixColors(newColor);
				}
				if(!newColor) newColor = 0;

				if(newBgColor !== null) {
					if(newBgColor === void 0) newBgColor = -1;
					newBgColor = san_nbr(newBgColor);
					if(newBgColor < -1) newBgColor = -1;
					if(newBgColor > 16777215) newBgColor = 16777215;
				}

				var newAr = [editIncome[0], editIncome[1],
							newY, newX,
							editIncome[4], newChar, editIncome[6], newColor, newBgColor];
				changes.push(newAr);
			}
		}

		for(var e = 0; e < changes.length; e++) {
			var change = changes[e];
			tile_edits.push(change);
		}
	}

	if(!tile_edits.length) {
		rate_limiter.clearHolds(idLabel, tiles);
		return {
			accepted: [],
			rejected
		};
	}

	// send to tile database manager
	tile_database.write(call_id, tile_database.types.write, {
		date: currentDate,
		tile_edits,
		user, world, is_owner, is_member,
		can_color_text, can_color_cell,
		public_only, no_log_edits, preserve_links,
		channel,
		no_update,
		rejected
	});

	var resp = await tile_database.editResponse(call_id);

	rate_limiter.clearHolds(idLabel, tiles);

	return { accepted: resp[0], rejected };
}