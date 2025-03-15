var { retrieveRestrictionRule } = require("./restrictions.js");

var editRateLimits = {}; // TODO: garbage collection
var linkRateLimits = {};
var tileRateLimits = {};
var tileHolds = {};

function checkCharRateLimit(ipObj, cRate, editCount) {
	if(!cRate) return false;
	var date = Date.now();
	if(!ipObj.value) {
		ipObj.periodEpoch = 0;
	}
	var per = Math.floor((date - ipObj.periodEpoch) / ipObj.periodLength);
	var currentPer = ipObj.currentPeriod;
	ipObj.currentPeriod = per;
	if(currentPer != per || !ipObj.value) {
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
	var per = Math.floor((Date.now() - ipObj.periodEpoch) / ipObj.periodLength);
	var currentPer = ipObj.currentPeriod;
	var pos = tileY + "," + tileX + "," + worldId;
	ipObj.currentPeriod = per;
	if(currentPer != per || ipObj.value == null) {
		ipObj.value = {};
		ipObj.value[pos] = 1;
		return true;
	}
	ipObj.value[pos] = 1;
	var tileCount = Object.keys(ipObj.value).length;
	if(tileCount > tRate) {
		return false;
	}
	return true;
}

function prepareRateLimiter(limObj, periodLength, ipAddress) {
	var obj = limObj[ipAddress];
	if(obj) {
		if(obj.periodLength == periodLength) {
			return obj;
		}
	}
	obj = {
		periodEpoch: 0, // period offset
		currentPeriod: 0,
		periodLength, // rate-limit interval
		value: null // number of items in current period
	};
	limObj[ipAddress] = obj;
	return obj;
}

function checkCharrateRestr(restGroups, ipVal, ipFam, isGrouped, world, tileX, tileY) {
	let r = retrieveRestrictionRule(restGroups.charrate, ipVal, ipFam, isGrouped, world, tileX, tileY);
	if(r) {
		return r.rate;
	}
	return null;
}

function checkLinkrateRestr(restGroups, ipVal, ipFam, isGrouped, world) {
	let r = retrieveRestrictionRule(restGroups.linkrate, ipVal, ipFam, isGrouped, world, null, null);
	if(r) {
		return r.rate;
	}
	return null;
}

function checkColorRestr(restGroups, ipVal, ipFam, isGrouped, world, tileX, tileY) {
	let r = retrieveRestrictionRule(restGroups.color, ipVal, ipFam, isGrouped, world, tileX, tileY);
	return r != null;
}

function checkHTTPWriteRestr(restGroups, ipVal, ipFam, isGrouped, world) {
	let r = retrieveRestrictionRule(restGroups.daccess.httpwrite, ipVal, ipFam, isGrouped, world, null, null);
	return r != null;
}

function setHold(id, worldId, tileX, tileY) {
	if(!tileHolds[id]) tileHolds[id] = {
		count: 0,
		tiles: {}
	};
	var holdObj = tileHolds[id];
	var pos = worldId + "," + tileY + "," + tileX;
	if(!holdObj.tiles[pos]) {
		if(holdObj.count >= 100) {
			return false;
		}
		holdObj.count++;
		holdObj.tiles[pos] = 1;
	} else {
		holdObj.tiles[pos]++;
	}
	return true;
}

function releaseHold(id, worldId, tileX, tileY) {
	var obj = tileHolds[id];
	if(!obj) return;
	if(obj.count <= 0) return;
	var pos = worldId + "," + tileY + "," + tileX;
	if(obj.tiles[pos]) {
		obj.tiles[pos]--;
	}
	if(obj.tiles[pos] <= 0) {
		delete obj.tiles[pos];
		obj.count--;
	}
	if(obj.count <= 0) {
		obj.count = 0;
		for(var i in obj.tiles) {
			delete obj.tiles[i];
		}
	}
}

function clearHolds(id, tileSet) {
	var obj = tileHolds[id];
	if(!obj) return;
	if(obj.count <= 0) return;
	for(var pos in tileSet) {
		if(obj.tiles[pos]) {
			obj.tiles[pos]--;
		}
		if(obj.tiles[pos] <= 0) {
			delete obj.tiles[pos];
			obj.count--;
		}
	}
	if(obj.count <= 0) {
		obj.count = 0;
		for(var i in obj.tiles) {
			delete obj.tiles[i];
		}
	}
}

module.exports = {
	editRateLimits,
	linkRateLimits,
	tileRateLimits,
	checkCharRateLimit,
	checkTileRateLimit,
	prepareRateLimiter,
	checkCharrateRestr,
	checkLinkrateRestr,
	checkColorRestr,
	checkHTTPWriteRestr,
	setHold,
	releaseHold,
	clearHolds
};