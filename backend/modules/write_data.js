var emptyWriteResponse = { accepted: [], rejected: {} };

var editRateLimits = {};
var tileRateLimits = {};

var charRatePerSecond = 20480;
var tileRatePerSecond = 800;

/*
	Limit of 20480 edits per second, and 800 unique tiles per second
*/

var editReqLimit = 512;
var superuserEditReqLimit = 1280;

function checkCharRateLimit(ipObj, editCount) {
	var sec = Math.floor(Date.now() / 1000);
	var currentSec = ipObj.currentSecond;
	ipObj.currentSecond = sec;
	if(currentSec != sec || ipObj.value == null) {
		ipObj.value = editCount;
		return true;
	}
	ipObj.value += editCount;
	if(ipObj.value > charRatePerSecond) {
		return false;
	}
	return true;
}

function checkTileRateLimit(ipObj, tileX, tileY, worldId) {
	var sec = Math.floor(Date.now() / 1000);
	var currentSec = ipObj.currentSecond;
	ipObj.currentSecond = sec;
	if(currentSec != sec || ipObj.value == null) {
		ipObj.value = {};
		return true;
	}
	ipObj.value[tileY + "," + tileX + "," + worldId] = 1;
	var tileCount = Object.keys(ipObj.value).length;
	if(tileCount > tileRatePerSecond) {
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

module.exports = async function(data, vars, evars) {
	var user = evars.user;
	var channel = evars.channel;
	var world = evars.world;
	
	var ipAddress;
	if(evars.sdata) {
		ipAddress = evars.sdata.ipAddress;
	} else {
		ipAddress = evars.ipAddress;
	}

	var san_nbr = vars.san_nbr;
	var advancedSplit = vars.advancedSplit;
	var get_bypass_key = vars.get_bypass_key;
	var tile_database = vars.tile_database;
	var fixColors = vars.fixColors;
	var broadcastMonitorEvent = vars.broadcastMonitorEvent;

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

	var worldProps = JSON.parse(world.properties);
	var world_id = world.id;

	var no_log_edits = !!worldProps.no_log_edits;
	var color_text = !!worldProps.color_text;

	var is_owner = user.id == world.owner_id;
	var is_member = user.stats.member;

	is_owner = is_owner || (user.superuser && world.name == "");

	var can_color_text = true;
	if(color_text == 1 && !is_member && !is_owner) can_color_text = false;
	if(color_text == 2 && !is_owner) can_color_text = false;

	var edits = data.edits;
	if(!edits) return emptyWriteResponse;
	if(!Array.isArray(edits)) return emptyWriteResponse;
	
	var tileLimiter = prepareRateLimiter(tileRateLimits, ipAddress);
	var editLimiter = prepareRateLimiter(editRateLimits, ipAddress);

	var totalEdits = 0;
	var tiles = {};
	var tileCount = 0;
	// organize edits into tile coordinates
	for(var i = 0; i < edits.length; i++) {
		var segment = edits[i];
		if(!segment || !Array.isArray(segment)) continue;
		var tileY = san_nbr(segment[0]);
		var tileX = san_nbr(segment[1]);
		var tileStr = tileY + "," + tileX;
		var char = segment[5];
		if(typeof char != "string") continue;
		if(!checkCharRateLimit(editLimiter, 1)) {
			break;
		}
		if(!tiles[tileStr]) {
			if(!checkTileRateLimit(tileLimiter, tileX, tileY, world_id)) {
				break;
			}
			tiles[tileStr] = [];
			tileCount++;
		}
		totalEdits++;
		if(totalEdits >= editLimit) { // edit limit reached
			break;
		}
		tiles[tileStr].push(segment);
	}

	if(evars && evars.ws && vars.monitorEventSockets.length) {
		var textLog = evars.ws.sdata.ipAddress + ", [" + evars.ws.sdata.clientId + ", '" + channel + "'] sent 'write' on world ['" + world.name + "', " + world.id + "]. " + tileCount + " modified tiles, " + totalEdits + " edits";
		broadcastMonitorEvent(textLog);
	}

	var call_id = tile_database.newCallId();
	tile_database.reserveCallId(call_id);

	var currentDate = Date.now();
	var tile_edits = [];

	for(var i in tiles) {
		var incomingEdits = tiles[i];
		var changes = [];

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