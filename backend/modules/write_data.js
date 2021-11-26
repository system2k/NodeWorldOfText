var emptyWriteResponse = { accepted: [], rejected: {} };

var editRateLimits = {};
var tileRateLimits = {};

/*
	Limit of 20480 edits per second, and 800 unique tiles per second
*/

var editReqLimit = 512;
var superuserEditReqLimit = 1280;

function checkCharRateLimit(ipObj, cRate, editCount) {
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

function checkCharrateRestr(list, ipVal, ipFam, world, tileX, tileY) {
	if(!list) return null;
	for(var i = 0; i < list.length; i++) {
		var item = list[i];

		var range = item[0];
		var fam = item[1];
		var type = item[2];
		if(fam != ipFam) continue;
		if(!(ipVal >= range[0] && ipVal <= range[1])) continue;

		if(type == "charrate") {
			var rRate = item[3];
			var rRorld = item[4];
			var rRegion = item[5];
			if(rRorld == null || rRorld.toUpperCase() == world.toUpperCase()) {
				if(rRegion == null || rRegion[0] <= tileX && tileX <= rRegion[2] && rRegion[1] <= tileY && tileY <= rRegion[3]) {
					return rRate;
				}
			}
		}
	}
	return null;
}

function checkColorRestr(list, ipVal, ipFam, world, tileX, tileY) {
	if(!list) return false;
	for(var i = 0; i < list.length; i++) {
		var item = list[i];

		var range = item[0];
		var fam = item[1];
		var type = item[2];
		if(fam != ipFam) continue;
		if(!(ipVal >= range[0] && ipVal <= range[1])) continue;

		if(type == "color") {
			var rRegion = item[3];
			var rWorld = item[4];
			if(rWorld == null || rWorld.toUpperCase() == world.toUpperCase()) {
				if(rRegion == null || rRegion[0] <= tileX && tileX <= rRegion[2] && rRegion[1] <= tileY && tileY <= rRegion[3]) {
					return true;
				}
			}
		}
	}
	return false;
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

	var charRatePerSecond = 20480;
	var tileRatePerSecond = 800;

	var restr = getRestrictions();

	var bypass_key = get_bypass_key();
	if(!bypass_key) {
		bypass_key = NaN;
	}

	var public_only = data.public_only;
	var preserve_links = data.preserve_links;

	var editLimit = editReqLimit;
	if(user.superuser) {
		editLimit = superuserEditReqLimit;
	}

	var world_id = world.id;

	var no_log_edits = world.opts.noLogEdits;
	var color_text = world.feature.colorText;

	var is_owner = user.id == world.ownerId;
	is_owner = is_owner || (user.superuser && world.name == "");
	var is_member = !!world.members.map[user.id] || is_owner;

	var can_color_text = true;
	if(color_text == 1 && !is_member) can_color_text = false;
	if(color_text == 2 && !is_owner) can_color_text = false;

	var edits = data.edits;
	if(!edits) return emptyWriteResponse;
	if(!Array.isArray(edits)) return emptyWriteResponse;
	
	var tileLimiter = prepareRateLimiter(tileRateLimits, ipAddress);
	var editLimiter = prepareRateLimiter(editRateLimits, ipAddress);

	var customLimit = world.opts.charRate;
	var customLimiter = null;
	if(customLimit && !is_member) {
		customLimit = customLimit.split("/");
		if(customLimit.length == 2) {
			customLimit = parseInt(customLimit[0]);
			customLimiter = prepareRateLimiter(editRateLimits, ipAddress + "-custom-" + world_id);
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

		var rrate = checkCharrateRestr(restr, ipAddressVal, ipAddressFam, world.name, tileX, tileY);
		if(rrate != null) {
			charRatePerSecond = rrate;
		}

		var tileStr = tileY + "," + tileX;
		var char = segment[5];
		if(typeof char != "string") continue;
		if(!checkCharRateLimit(editLimiter, charRatePerSecond, 1)) {
			break;
		}
		if(customLimiter) {
			if(!checkCharRateLimit(customLimiter, customLimit, 1)) {
				break;
			}
		}
		if(!tiles[tileStr]) {
			if(!checkTileRateLimit(tileLimiter, tileRatePerSecond, tileX, tileY, world_id)) {
				break;
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
		broadcastMonitorEvent(textLog);
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
		if(checkColorRestr(restr, ipAddressVal, ipAddressFam, world.name, tileX, tileY)) {
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

	if(!tile_edits.length) return emptyWriteResponse;

	// send to tile database manager
	tile_database.write(call_id, tile_database.types.write, {
		date: currentDate,
		tile_edits,
		user, world, is_owner, is_member,
		can_color_text, public_only, no_log_edits, preserve_links,
		channel,
		no_update: false
	});

	var resp = await tile_database.editResponse(call_id);

	return { accepted: resp[0], rejected: resp[1] };
}