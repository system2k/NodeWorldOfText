var utils = require("../utils/utils.js");
var sanitize_color = utils.sanitize_color;
var advancedSplit = utils.advancedSplit;
var san_nbr = utils.san_nbr;

var restrictions = require("../utils/restrictions.js");
var checkCoalition = restrictions.checkCoalition;
var getRestrictions = restrictions.getRestrictions;

var enums = require("../utils/enums.js");

var emptyWriteResponse = { accepted: [], rejected: {} };

function isMainPage(name) {
	return name == "" || name.toLowerCase() == "main" || name.toLowerCase() == "owot";
}

function partitionMultiEdit(editOffset, tileX, tileY, char, color, bgColor, editId) {
	var res = [];
	for(var i = 0; i < char.length; i++) {
		var subChar = char[i];
		var subColor = color;
		var subBgColor = bgColor;
		if(Array.isArray(color)) subColor = color[i];
		if(Array.isArray(bgColor)) subBgColor = bgColor[i];
		
		var offset = editOffset + i;
		if(offset < 0 || offset >= CONST.tileArea) continue;

		var charY = Math.floor(offset / CONST.tileCols);
		var charX = offset % CONST.tileCols;

		subColor = sanitize_color(subColor);
		if(subBgColor !== null) {
			if(subBgColor === void 0) subBgColor = -1;
			subBgColor = sanitize_color(subBgColor);
		}

		res.push([tileY, tileX, charY, charX, 0, subChar, editId, subColor, subBgColor]);
	}
	return res;
}

/*
REFACTOR:
The job of this module should be to take a properly-sanitized array of edits
and send it off to the tile database module to be written.
TODO: Split off client-side validation from the rest of this module.
*/

module.exports = async function(data, server, params) {
	var user = params.user;
	var channel = params.channel;
	var world = params.world;
	var isHTTP = params.isHTTP;
	
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
	
	var tile_database = server.tile_database;
	var broadcastMonitorEvent = server.broadcastMonitorEvent;
	var rate_limiter = server.rate_limiter;

	var editReqLimit = 512;
	var superuserEditReqLimit = 1280;
	var defaultCharRatePerSecond = 20480;
	var tileRatePerSecond = 256;

	var restr = getRestrictions();
	var isGrouped = checkCoalition(ipAddressVal, ipAddressFam);

	var public_only = !!data.public_only;
	var preserve_links = !!data.preserve_links;

	var editLimit = editReqLimit;
	if(user.superuser) {
		editLimit = superuserEditReqLimit;
	}

	var no_log_edits = world.opts.noLogEdits;
	var color_text = world.feature.colorText;
	var color_cell = world.feature.colorCell;

	var memkeyAccess = world.opts.memKey && world.opts.memKey == params.keyQuery;

	var is_owner = user.id == world.ownerId;
	is_owner = is_owner || (user.superuser && isMainPage(world.name));
	var is_member = !!world.members.map[user.id] || is_owner || memkeyAccess;

	var can_color_text = true;
	if(color_text == enums.perm.member && !is_member) can_color_text = false;
	if(color_text == enums.perm.owner && !is_owner) can_color_text = false;

	var can_color_cell = color_cell != enums.perm.none;
	if(color_cell == enums.perm.member && !is_member) can_color_cell = false;
	if(color_cell == enums.perm.owner && !is_owner) can_color_cell = false;

	var edits = data.edits;
	if(!edits) return emptyWriteResponse;
	if(!Array.isArray(edits)) return emptyWriteResponse;

	var rejected = {};

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
			customLimiter = rate_limiter.prepareRateLimiter(rate_limiter.editRateLimits, periodLength, ipAddress + "-world-" + world.id);
		}
	}

	var httpWriteDenied = isHTTP && rate_limiter.checkHTTPWriteRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name);

	var totalEdits = 0;
	var tiles = {};
	var tileCount = 0;

	var validEdits = [];

	for(var i = 0; i < edits.length; i++) {
		var edit = edits[i];
		if(!edit || !Array.isArray(edit)) continue;
		
		var tileY = san_nbr(edit[0]);
		var tileX = san_nbr(edit[1]);
		var charY = san_nbr(edit[2]);
		var charX = san_nbr(edit[3]);
		var date = edit[4];
		var char = edit[5];
		var editId = san_nbr(edit[6]);
		var color = edit[7];
		var bgColor = edit[8];

		if(typeof char != "string") continue;

		var editOffset = charY * CONST.tileCols + charX;
		if(editOffset < 0 || editOffset >= CONST.tileArea) continue;

		var charRatePerSecond = defaultCharRatePerSecond;

		var rrate = rate_limiter.checkCharrateRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name, tileX, tileY);
		if(rrate != null) {
			charRatePerSecond = rrate;
		}

		if(!rate_limiter.checkCharRateLimit(editLimiter, charRatePerSecond, 1)) {
			rejected[editId] = enums.write.charRateLimit;
			if(charRatePerSecond == 0) rejected[editId] = enums.write.zeroRateLimit;
			continue;
		}
		if(customLimiter && rrate == null) {
			if(!rate_limiter.checkCharRateLimit(customLimiter, charsPerPeriod, 1)) {
				rejected[editId] = enums.write.charRateLimit;
				if(charsPerPeriod == 0) rejected[editId] = enums.write.zeroRateLimit;
				continue;
			}
		}
		if(isHTTP && httpWriteDenied) {
			rejected[editId] = enums.write.zeroRateLimit;
			continue;
		}

		totalEdits++;
		if(totalEdits > editLimit) { // edit limit reached
			break;
		}

		var tileStr = world.id + "," + tileY + "," + tileX;
		if(!tiles[tileStr]) {
			if(!rate_limiter.checkTileRateLimit(tileLimiter, tileRatePerSecond, tileX, tileY, world.id)) {
				rejected[editId] = enums.write.tileRateLimit;
				continue;
			}
			if(!rate_limiter.setHold(idLabel, world.id, tileX, tileY)) {
				rejected[editId] = enums.write.tooManyHolds;
				continue;
			}
			tiles[tileStr] = [];
			tileCount++;
		}

		if(rate_limiter.checkColorRestr(restr, ipAddressVal, ipAddressFam, isGrouped, world.name, tileX, tileY)) {
			color = 0;
			bgColor = -1;
		}

		var testChar = advancedSplit(char);
		if(testChar.length == 0) { // empty edit
			char = "\0";
		} else if(char.length > 1 && (user.superuser || is_member || is_owner)) { // multi-char edit
			validEdits.push(...partitionMultiEdit(editOffset, tileX, tileY, testChar, color, bgColor, editId));
			continue;
		}

		charY = Math.floor(editOffset / CONST.tileCols);
		charX = editOffset % CONST.tileCols;

		if(Array.isArray(color)) color = color[0];
		if(Array.isArray(bgColor)) bgColor = bgColor[0];

		color = sanitize_color(color);
		if(bgColor !== null) {
			if(bgColor === void 0) bgColor = -1;
			bgColor = sanitize_color(bgColor);
		}

		validEdits.push([tileY, tileX, charY, charX, date, char, editId, color, bgColor]);
	}

	if(params) {
		var ip = "", cliId = "", chan = "";
		if(params.ws) {
			ip = params.ws.sdata.ipAddress;
			cliId = params.ws.sdata.clientId;
			chan = channel;
		} else {
			ip = ipAddress;
			cliId = "--";
			chan = "(Via HTTP)";
		}
		var textLog = ip + ", [" + cliId + ", '" + chan + "'] sent 'write' on world ['" + world.name + "', " + world.id + "]. " + tileCount + " modified tiles, " + totalEdits + " edits";
		broadcastMonitorEvent("Write", textLog);
	}

	var currentDate = Date.now();

	if(!validEdits.length) {
		rate_limiter.clearHolds(idLabel, tiles);
		return {
			accepted: [],
			rejected
		};
	}

	// send to tile database manager
	var resp = await tile_database.write(tile_database.types.write, {
		date: currentDate,
		tile_edits: validEdits,
		user, world, is_owner, is_member,
		can_color_text, can_color_cell,
		public_only, no_log_edits, preserve_links,
		channel,
		rejected,
		ip: ipAddress
	});

	rate_limiter.clearHolds(idLabel, tiles);

	return { accepted: resp[0], rejected };
}