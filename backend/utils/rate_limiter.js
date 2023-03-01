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

function checkLinkrateRestr(list, ipVal, ipFam, isGrouped, world) {
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
		if(type == "linkrate") {
			var rRate = item.rate;
			var rRorld = item.world;
			if(rRorld == null || rRorld.toUpperCase() == world.toUpperCase()) {
				return rRate;
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

function checkHTTPWriteRestr(list, ipVal, ipFam, isGrouped, world) {
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
		var mode = item.mode;
		if(type == "daccess" && mode == "httpwrite") {
			var rWorld = item.world;
			if(rWorld == null || rWorld.toUpperCase() == world.toUpperCase()) {
				return true;
			}
		}
	}
	return false;
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