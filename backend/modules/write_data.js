var emptyWriteResponse = { accepted: [], rejected: {} };

var editRateLimits = {}; // TODO: flush
var tileRateLimits = {};

var editReqLimit = 512;
var superuserEditReqLimit = 1280;

function checkCharRateLimit(ipObj, cRate, editCount) {
	if(!cRate) return false;
	var sec = Math.floor(Date.now() / 1000);
	var currentSec = ipObj.currentSecond;
	ipObj.currentSecond = sec;
	if(currentSec != sec || ipObj.value == null) {
		ipObj.value = editCount;
		return true;
	}
	ipObj.value += editCount;
	if(ipObj.value > cRate) {
		return false;
	}
	return true;
}

function checkTileRateLimit(ipObj, tRate, tileX, tileY, worldId) {
	if(!tRate) return false;
	var sec = Math.floor(Date.now() / 1000);
	var currentSec = ipObj.currentSecond;
	ipObj.currentSecond = sec;
	if(currentSec != sec || ipObj.value == null) {
		ipObj.value = {};
		return true;
	}
	ipObj.value[tileY + "," + tileX + "," + worldId] = 1;
	var tileCount = Object.keys(ipObj.value).length;
	if(tileCount > tRate) {
		return false;
	}
	return true;
}

function prepareRateLimiter(limObj, ipAddress) {
	var obj = limObj[ipAddress];
	if(obj) return obj;
	obj = {
		currentSecond: 0,
		value: null
	};
	limObj[ipAddress] = obj;
	return obj;
}

function checkCharrateRestr(list, ipVal, ipFam, isGrouped, world, tileX, tileY) {
	if(!list) return null;
	for(var i = 0; i < list.length; i++) {
		var item = list[i];

		var ip = item.ip;
		var group = item.group;
		if(ip) {
			var riRange = ip[0];
			var riFam = ip[1];
			if(riFam != ipFam) continue;
			if(!(ipVal >= riRange[0] && ipVal <= riRange[1])) continue;
		} else if(group) {
			if(!(group == "cg1" && isGrouped)) continue;
		}

		var type = item.type;
		if(type == "charrate") {
			var rRate = item.rate;
			var rRorld = item.world;
			var rRegion = item.region;
			if(rRorld == null || rRorld.toUpperCase() == world.toUpperCase()) {
				if(rRegion == null || rRegion[0] <= tileX && tileX <= rRegion[2] && rRegion[1] <= tileY && tileY <= rRegion[3]) {
					return rRate;
				}
			}
		}
	}
	return null;
}

function checkColorRestr(list, ipVal, ipFam, isGrouped, world, tileX, tileY) {
	if(!list) return false;
	for(var i = 0; i < list.length; i++) {
		var item = list[i];

		var ip = item.ip;
		var group = item.group;
		if(ip) {
			var riRange = ip[0];
			var riFam = ip[1];
			if(riFam != ipFam) continue;
			if(!(ipVal >= riRange[0] && ipVal <= riRange[1])) continue;
		} else if(group) {
			if(!(group == "cg1" && isGrouped)) continue;
		}

		var type = item.type;
		if(type == "color") {
			var rRegion = item.region;
			var rWorld = item.world;
			if(rWorld == null || rWorld.toUpperCase() == world.toUpperCase()) {
				if(rRegion == null || rRegion[0] <= tileX && tileX <= rRegion[2] && rRegion[1] <= tileY && tileY <= rRegion[3]) {
					return true;
				}
			}
		}
	}
	return false;
}

function isMainPage(name) {
	return name == "" || name.toLowerCase() == "main";
}

module.exports = async function(data, vars, evars) {
	var user = evars.user;
	var channel = evars.channel;
	var world = evars.world;
	
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
	
	var san_nbr = vars.san_nbr;
	var advancedSplit = vars.advancedSplit;
	var get_bypass_key = vars.get_bypass_key;
	var tile_database = vars.tile_database;
	var fixColors = vars.fixColors;
	var broadcastMonitorEvent = vars.broadcastMonitorEvent;
	var getRestrictions = vars.getRestrictions;
	var checkCoalition = vars.checkCoalition;

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

	var memkeyAccess = world.opts.memKey && world.opts.memKey == evars.keyQuery;

	var is_owner = user.id == world.ownerId;
	is_owner = is_owner || (user.superuser && isMainPage(world.name));
	var is_member = !!world.members.map[user.id] || is_owner || memkeyAccess;

	var can_color_text = true;
	if(color_text == 1 && !is_member) can_color_text = false;
	if(color_text == 2 && !is_owner) can_color_text = false;

	var edits = data.edits;
	if(!edits) return emptyWriteResponse;
	if(!Array.isArray(edits)) return emptyWriteResponse;

	var rejected = {};
	/*
	1: NO_TILE_PERM
	2: RATE_LIMIT
	*/
	
	var tileLimiter = prepareRateLimiter(tileRateLimits, isGrouped ? "cg1" : ipAddress);
	var editLimiter = prepareRateLimiter(editRateLimits, isGrouped ? "cg1" : ipAddress);

	var customLimit = world.opts.charRate;
	var customLimiter = null;
	if(customLimit && !is_member) {
		customLimit = customLimit.split("/");
		if(customLimit.length == 2) {
			customLimit = parseInt(customLimit[0]);
			customLimiter = prepareRateLimiter(editRateLimits, ipAddress + "-world-" + world_id);
		}
	}

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

		var rrate = checkCharrateRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name, tileX, tileY);
		if(rrate != null) {
			charRatePerSecond = rrate;
		}

		var tileStr = tileY + "," + tileX;
		var char = segment[5];
		segment[6] = san_nbr(segment[6]); // edit id
		var editID = segment[6];
		if(typeof char != "string") continue;
		if(!checkCharRateLimit(editLimiter, charRatePerSecond, 1)) {
			rejected[editID] = 2;
			continue;
		}
		if(customLimiter) {
			if(!checkCharRateLimit(customLimiter, customLimit, 1)) {
				rejected[editID] = 2;
				continue;
			}
		}
		if(!tiles[tileStr]) {
			if(!checkTileRateLimit(tileLimiter, tileRatePerSecond, tileX, tileY, world_id)) {
				rejected[editID] = 2;
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
		if(checkColorRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name, tileX, tileY)) {
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
				changes.push(editIncome);
				continue;
			} else {
				// only password holders, superusers, owners, or members can use multiple characters per edit
				if(!user.superuser && !(is_owner || is_member) && data.bypass != bypass_key) {
					char = char.slice(0, 1);
				}
			}
			for(var i = 0; i < char.length; i++) {
				var newIdx = charInsIdx + i;
				if(newIdx > CONST.tileArea - 1) continue; // overflow
				// convert back to proper X/Y
				var newX = newIdx % CONST.tileCols;
				var newY = Math.floor(newIdx / CONST.tileCols);
				var newChar = char[i];
				var newColor = editIncome[7];
				if(Array.isArray(newColor)) {
					// color is an array, get individual values
					newColor = fixColors(newColor[i]);
				} else {
					// color is a number
					newColor = fixColors(newColor);
				}
				if(!newColor) newColor = 0;

				var newAr = [editIncome[0], editIncome[1],
							newY, newX,
							editIncome[4], newChar, editIncome[6], newColor];
				if(editIncome[8]) {
					newAr.push(editIncome[8]);
				}
				changes.push(newAr);
			}
		}

		for(var e = 0; e < changes.length; e++) {
			var change = changes[e];
			tile_edits.push(change);
		}
	}

	if(!tile_edits.length) return {
		accepted: [],
		rejected
	};

	// send to tile database manager
	tile_database.write(call_id, tile_database.types.write, {
		date: currentDate,
		tile_edits,
		user, world, is_owner, is_member,
		can_color_text, public_only, no_log_edits, preserve_links,
		channel,
		no_update,
		rejected
	});

	var resp = await tile_database.editResponse(call_id);

	return { accepted: resp[0], rejected };
}