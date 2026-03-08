var ipaddress = require("../framework/ipaddress.js");
var ipv4_to_range = ipaddress.ipv4_to_range;
var ipv6_to_range = ipaddress.ipv6_to_range;
var reconIPv4 = ipaddress.reconIPv4;
var reconIPv6 = ipaddress.reconIPv6;

var restrictionsTree = {};
var restrictionsFlatList = [];
var restrictionsFlatListStr = [];
var coalition = {
	v4: [],
	v6: []
};
function setRestrictions(obj) {
	restrictionsTree = obj;
}
function getRestrictions() {
	return restrictionsTree;
}
function setRestrictionsFlatList(array) {
	restrictionsFlatList = array;
}
function getRestrictionsFlatList() {
	return restrictionsFlatList;
}
function setRestrictionsFlatListStr(array) {
	restrictionsFlatListStr = array;
}
function getRestrictionsFlatListStr() {
	return restrictionsFlatListStr;
}
function setCoalition(list) {
	coalition = list;
}
function checkCoalition(val, fam) {
	var list = null;
	if(fam == 4) {
		list = coalition.v4;
	} else if(fam == 6) {
		list = coalition.v6;
	} else {
		return false;
	}
	if(!list.length) return false;
	var posa = 0;
	var posb = list.length - 1;
	// binary search through the list
	for(var i = 0; i < list.length; i++) {
		var pos = Math.floor((posa + posb) / 2);
		var item = list[pos];
		var a = item[0];
		var b = item[1];
		if(a <= val && b >= val) return true;
		if(posb - posa == 1) {
			var ra = list[posa];
			var rb = list[posb];
			if(ra[0] <= val && ra[1] >= val) return true;
			if(rb[0] <= val && rb[1] >= val) return true;
			return false;
		}
		if(a > val) {
			if(posb - posa == 0) return false;
			posb = pos - 1;
			continue;
		}
		if(b < val) {
			if(posb - posa == 0) return false;
			posa = pos + 1;
			continue;
		}
	}
	return false;
}

function procRegionString(region) {
	if(!region) return null;
	region = region.split(",");
	if(region.length != 4) return null;
	var x1 = parseInt(region[0]);
	var y1 = parseInt(region[1]);
	var x2 = parseInt(region[2]);
	var y2 = parseInt(region[3]);
	if(isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null;
	if(x2 < x1) {
		var tmp = x1;
		x1 = x2;
		x2 = tmp;
	}
	if(y2 < y1) {
		var tmp = y1;
		y1 = y2;
		y2 = tmp;
	}
	return [x1, y1, x2, y2];
}

function normalizeWorldName(worldName) {
	worldName = worldName.trim().toLowerCase();
	if(worldName.startsWith("/")) worldName = worldName.slice(1);
	if(worldName.endsWith("/")) worldName = worldName.slice(0, -1);
	return worldName;
}

function removeOverlaps(list) {
    var res = [];
    for(var i = 0; i < list.length; i++) {
        var a = list[i][0];
        var b = list[i][1];
        if(res.length) {
            var last = res[res.length - 1];
            if(a >= last[0] && b <= last[1]) continue;
            if(a <= last[1] && b >= last[1]) {
                last[1] = b;
                continue;
            }
        }
        res.push([a, b]);
    }
    return res;
}

function procIP(str) {
	if(str.includes(":")) {
		return [ipv6_to_range(str), 6];
	} else if(str.includes(".")) {
		return [ipv4_to_range(str), 4];
	}
	return null;
}

function sortRestrictionListIPv4(list) {
	list.sort(function(a, b) {
		let dir = a.ip[0][0] - b.ip[0][0];
		if(dir == 0) {
			return a.index - b.index;
		} else {
			return dir;
		}
	});
}

function sortRestrictionListIPv6(list) {
	list.sort(function(a, b) {
		let dir = a.ip[0][0] - b.ip[0][0];
		if(dir == 0) {
			return a.index - b.index;
		} else {
			return Number(dir);
		}
	});
}

function divideRestrictionsIntoWorlds(list, classObj) {
	for(let i = 0; i < list.length; i++) {
		let obj = list[i];
		let worldName = obj.world ?? ".";
		classObj[worldName] ??= {regions: [], list: []};
		if(obj.region) {
			classObj[worldName].regions.push(obj);
		} else {
			classObj[worldName].list.push(obj);
		}
	}
}

function buildRestrictionsTree(currentList) {
	let result = {
		ip: null,
		list: [],
		index: Infinity
	};
	let path = [result];
	let prevRegionObj = null;
	for(let i = 0; i < currentList.length; i++) {
		let rule = currentList[i];
		let isRegionRule = (rule.region != null);
		while(true) {
			let container = path.at(-1);
			let princip = container.ip;
			let isIpSameAsPrevReg = prevRegionObj && (prevRegionObj.ip[0] == rule.ip[0][0] && prevRegionObj.ip[1] == rule.ip[0][1]);
			let doesIpFitInsideRange = princip && (rule.ip[0][0] >= princip[0] && rule.ip[0][0] <= princip[1]);
			if(princip == null || doesIpFitInsideRange) {
				if(!isRegionRule && rule.index > container.index) {
					// rules with an IP address inside a range declared previously are trimmed.
					// the 'regions' type has an exception because region restrictions are difficult to trim.
					break;
				}
				let obj = {
					ip: rule.ip[0],
					list: [],
					index: rule.index
				};
				if(isRegionRule) {
					if(isIpSameAsPrevReg) {
						prevRegionObj.rules.push(rule);
					} else {
						obj.rules = [rule];
						obj.container = container;
						prevRegionObj = obj;
						container.list.push(obj);
						path.push(obj);
					}
				} else {
					obj.rule = rule;
					container.list.push(obj);
					path.push(obj);
				}
				break;
			} else {
				path.pop();
			}
		}
	}
	
	return result.list;
}

function divideGroupIntoRestrictionsTree(group) {
	for(let ipMode in group) {
		if(ipMode == "cg1") continue;
		for(let world in group[ipMode]) {
			let worldObj = group[ipMode][world];
			worldObj.list = buildRestrictionsTree(worldObj.list);
			worldObj.regions = buildRestrictionsTree(worldObj.regions);
		}
	}
}

function parseRestrictionsList(list) {
	let parsed = {
		charrate: { ipv4: [], ipv6: [], cg1: [] },
		linkrate: { ipv4: [], ipv6: [], cg1: [] },
		color: { ipv4: [], ipv6: [], cg1: [] },
		daccess: {
			site: { ipv4: [], ipv6: [] },
			httpwrite: { ipv4: [], ipv6: [], cg1: [] }
		},
		rawList: []
	};

	for(let i = 0; i < list.length; i++) {
		let item = list[i].split(";");
		let itemtype = "";
		let itemip = "";
		let itemgroup = "";
		let itemtag = "";
		let props = {};
		for(let x = 0; x < item.length; x++) {
			let subitem = item[x].split("=");
			let key = subitem[0].trim().toLowerCase();
			let val = subitem.slice(1).join("=").trim();
			if(key == "ip") {
				itemip = val;
			} else if(key == "type") {
				itemtype = val;
			} else if(key == "group") {
				itemgroup = val;
			} else if(key == "tag") {
				itemtag = val;
			} else {
				props[key] = val;
			}
		}
		if((!itemip && !itemgroup) || !["charrate", "color", "linkrate", "daccess"].includes(itemtype)) continue;
		if(itemgroup && itemip) continue; // can't have both
		
		let obj = null;
		if(itemtype == "charrate") {
			let rate = props.rate;
			let world = props.world;
			let region = props.region;
			if("world" in props) {
				world = normalizeWorldName(world);
			} else {
				world = null;
			}
			region = procRegionString(region);
			rate = parseInt(rate);
			if(isNaN(rate)) continue;
			if(rate < 0) rate = 0;
			if(rate > 1000000) rate = 1000000;
			if(region && itemgroup) continue;
			obj = {
				type: "charrate", tag: itemtag,
				rate, world, region
			};
		} else if(itemtype == "linkrate") {
			let rate = props.rate;
			let world = props.world;
			if("world" in props) {
				world = normalizeWorldName(world);
			} else {
				world = null;
			}
			rate = parseInt(rate);
			if(isNaN(rate)) continue;
			if(rate < 0) rate = 0;
			if(rate > 1000000) rate = 1000000;
			obj = {
				type: "linkrate", tag: itemtag,
				rate, world
			};
		} else if(itemtype == "color") {
			let region = props.region;
			let world = props.world;
			if("world" in props) {
				world = normalizeWorldName(world);
			} else {
				world = null;
			}
			region = procRegionString(region);
			if(region && itemgroup) continue;
			obj = {
				type: "color", tag: itemtag,
				region, world
			};
		} else if(itemtype == "daccess") {
			let mode = props.mode;
			let note = props.note;
			let world = props.world;
			if(mode != "httpwrite" && mode != "site") continue;
			if(typeof note != "string" || !note) note = null;
			if("world" in props) {
				world = normalizeWorldName(world);
			} else {
				world = null;
			}
			obj = {
				type: "daccess", tag: itemtag,
				mode,
				note,
				world
			};
		}
		if(obj) {
			if(itemip) {
				let ipInfo = procIP(itemip);
				if(!ipInfo) continue;
				obj.ip = ipInfo;
			} else if(itemgroup) {
				obj.group = itemgroup;
			}
			obj.index = i;
			parsed.rawList.push(obj);
		}
		if(obj && obj.world != ".") {
			switch(obj.type) {
				case "charrate":
					if(itemip) {
						if(obj.ip[1] == 4) {
							parsed.charrate.ipv4.push(obj);
						} else if(obj.ip[1] == 6) {
							parsed.charrate.ipv6.push(obj);
						}
					} else if(itemgroup) {
						parsed.charrate.cg1.push(obj);
					}
					break;
				case "linkrate":
					if(itemip) {
						if(obj.ip[1] == 4) {
							parsed.linkrate.ipv4.push(obj);
						} else if(obj.ip[1] == 6) {
							parsed.linkrate.ipv6.push(obj);
						}
					} else if(itemgroup) {
						parsed.linkrate.cg1.push(obj);
					}
					break;
				case "color":
					if(itemip) {
						if(obj.ip[1] == 4) {
							parsed.color.ipv4.push(obj);
						} else if(obj.ip[1] == 6) {
							parsed.color.ipv6.push(obj);
						}
					} else if(itemgroup) {
						parsed.color.cg1.push(obj);
					}
					break;
				case "daccess":
					if(obj.mode == "site") {
						if(itemip) {
							if(obj.ip[1] == 4) {
								parsed.daccess.site.ipv4.push(obj);
							} else if(obj.ip[1] == 6) {
								parsed.daccess.site.ipv6.push(obj);
							}
						}
					} else if(obj.mode == "httpwrite") {
						if(itemip) {
							if(obj.ip[1] == 4) {
								parsed.daccess.httpwrite.ipv4.push(obj);
							} else if(obj.ip[1] == 6) {
								parsed.daccess.httpwrite.ipv6.push(obj);
							}
						} else if(itemgroup) {
							parsed.daccess.httpwrite.cg1.push(obj);
						}
					}
			}
		}
	}

	return parsed;
}

function procRest(list) {
	let parsed = parseRestrictionsList(list);
	let worldGroups = {
		charrate: { ipv4: {}, ipv6: {}, cg1: {} },
		linkrate: { ipv4: {}, ipv6: {}, cg1: {} },
		color: { ipv4: {}, ipv6: {}, cg1: {} },
		daccess: {
			site: { ipv4: [], ipv6: [] },
			httpwrite: { ipv4: {}, ipv6: {}, cg1: {} }
		}
	};
	
	sortRestrictionListIPv4(parsed.charrate.ipv4);
	sortRestrictionListIPv6(parsed.charrate.ipv6);

	sortRestrictionListIPv4(parsed.linkrate.ipv4);
	sortRestrictionListIPv6(parsed.linkrate.ipv6);

	sortRestrictionListIPv4(parsed.color.ipv4);
	sortRestrictionListIPv6(parsed.color.ipv6);

	sortRestrictionListIPv4(parsed.daccess.site.ipv4);
	sortRestrictionListIPv4(parsed.daccess.site.ipv6);

	sortRestrictionListIPv4(parsed.daccess.httpwrite.ipv4);
	sortRestrictionListIPv4(parsed.daccess.httpwrite.ipv6);
	
	// we don't need to sort the cg1 lists nor build a restrictions tree for them
	
	// look through each list and split by worldname. the "." worldname represents all worlds.
	divideRestrictionsIntoWorlds(parsed.charrate.ipv4, worldGroups.charrate.ipv4);
	divideRestrictionsIntoWorlds(parsed.charrate.ipv6, worldGroups.charrate.ipv6);
	divideRestrictionsIntoWorlds(parsed.charrate.cg1, worldGroups.charrate.cg1);
	
	divideRestrictionsIntoWorlds(parsed.linkrate.ipv4, worldGroups.linkrate.ipv4);
	divideRestrictionsIntoWorlds(parsed.linkrate.ipv6, worldGroups.linkrate.ipv6);
	divideRestrictionsIntoWorlds(parsed.linkrate.cg1, worldGroups.linkrate.cg1);
	
	divideRestrictionsIntoWorlds(parsed.color.ipv4, worldGroups.color.ipv4);
	divideRestrictionsIntoWorlds(parsed.color.ipv6, worldGroups.color.ipv6);
	divideRestrictionsIntoWorlds(parsed.color.cg1, worldGroups.color.cg1);
	
	divideRestrictionsIntoWorlds(parsed.daccess.httpwrite.ipv4, worldGroups.daccess.httpwrite.ipv4);
	divideRestrictionsIntoWorlds(parsed.daccess.httpwrite.ipv6, worldGroups.daccess.httpwrite.ipv6);
	divideRestrictionsIntoWorlds(parsed.daccess.httpwrite.cg1, worldGroups.daccess.httpwrite.cg1);
	
	divideGroupIntoRestrictionsTree(worldGroups.charrate);
	divideGroupIntoRestrictionsTree(worldGroups.linkrate);
	divideGroupIntoRestrictionsTree(worldGroups.color);
	divideGroupIntoRestrictionsTree(worldGroups.daccess.httpwrite);
	
	worldGroups.daccess.site.ipv4 = buildRestrictionsTree(parsed.daccess.site.ipv4);
	worldGroups.daccess.site.ipv6 = buildRestrictionsTree(parsed.daccess.site.ipv6);
	
	return {
		groups: worldGroups,
		raw: parsed.rawList,
		rawStr: rebuildRestrictionsList(parsed.rawList)
	};
}

function procCoal(list) {
	var ranges4 = [];
	var ranges6 = [];
	for(var i = 0; i < list.length; i++) {
		var row = list[i];
		if(!row) continue;
		row = row.trim();
		var ipInfo = procIP(row);
		if(!ipInfo) continue;
		var ipRange = ipInfo[0];
		var ipFam = ipInfo[1];
		if(ipFam == 4) ranges4.push(ipRange);
		if(ipFam == 6) ranges6.push(ipRange);
	}
	ranges4.sort(function(a, b) {
		return a[0] - b[0];
	});
	ranges6.sort(function(a, b) {
		if(a[0] > b[0]) return 1;
		if(a[0] < b[0]) return -1;
		return 0;
	});
	ranges4 = removeOverlaps(ranges4); // must be done after list reconstruction
	ranges6 = removeOverlaps(ranges6);
	return {
		data: {
			v4: ranges4,
			v6: ranges6
		},
		rawStr: rebuildCoalitionList(ranges4, ranges6)
	};
}

function rebuildRestrictionsList(restrictions) {
	var rstr = [];
	for(var i = 0; i < restrictions.length; i++) {
		var restr = restrictions[i];

		var type = restr.type;
		var ip = restr.ip;
		var group = restr.group;
		var tag = restr.tag;

		var identifier = "";

		if(ip) {
			var ipRange = ip[0];
			var ipFam = ip[1];
			if(ipFam == 4) {
				ip = reconIPv4(ipRange[0], ipRange[1]);
			} else if(ipFam == 6) {
				ip = reconIPv6(ipRange[0], ipRange[1]);
			}
			identifier = "ip=" + ip;
		} else if(group) {
			identifier = "group=" + group;
		}

		if(type == "charrate") {
			var rate = restr.rate;
			var world = restr.world;
			var region = restr.region;
			var rstrLine = [identifier, "type=charrate", "rate=" + rate];
			if(world != null) {
				rstrLine.push("world=" + world);
			}
			if(region != null) {
				rstrLine.push("region=" + region.join(","));
			}
			if(tag) {
				rstrLine.push("tag=" + tag);
			}
			rstr.push(rstrLine.join(";"));
		} else if(type == "linkrate") {
			var rate = restr.rate;
			var world = restr.world;
			var rstrLine = [identifier, "type=linkrate", "rate=" + rate];
			if(world != null) {
				rstrLine.push("world=" + world);
			}
			if(tag) {
				rstrLine.push("tag=" + tag);
			}
			rstr.push(rstrLine.join(";"));
		} else if(type == "color") {
			var region = restr.region;
			var world = restr.world;
			var rstrLine = [identifier, "type=color"];
			if(world != null) {
				rstrLine.push("world=" + world);
			}
			if(region != null) {
				rstrLine.push("region=" + region.join(","));
			}
			if(tag) {
				rstrLine.push("tag=" + tag);
			}
			rstr.push(rstrLine.join(";"));
		} else if(type == "daccess") {
			var mode = restr.mode;
			var note = restr.note;
			var world = restr.world;
			var rstrLine = [identifier, "type=daccess"];
			rstrLine.push("mode=" + mode);
			if(note) {
				rstrLine.push("note=" + note);
			}
			if(world != null) {
				rstrLine.push("world=" + world);
			}
			if(tag) {
				rstrLine.push("tag=" + tag);
			}
			rstr.push(rstrLine.join(";"));
		}
	}
	return rstr;
}

function rebuildCoalitionList(ranges4, ranges6) {
	var cstr = [];
	for(var i = 0; i < ranges4.length; i++) {
		cstr.push(reconIPv4(ranges4[i][0], ranges4[i][1]));
	}
	for(var i = 0; i < ranges6.length; i++) {
		cstr.push(reconIPv6(ranges6[i][0], ranges6[i][1]));
	}
	return cstr;
}

function scanRuleList(list, val) {
	if(!list.length) {
		return null;
	}
	let posa = 0;
	let posb = list.length - 1;
	// binary search through the list
	for(let i = 0; i < list.length; i++) {
		let pos = Math.floor((posa + posb) / 2);
		let item = list[pos];
		let a = item.ip[0];
		let b = item.ip[1];
		if(a <= val && b >= val) return item;
		if(posb - posa == 1) {
			let ra = list[posa].ip;
			let rb = list[posb].ip;
			if(ra[0] <= val && ra[1] >= val) return list[posa];
			if(rb[0] <= val && rb[1] >= val) return list[posb];
			return null;
		}
		if(a > val) {
			if(posb - posa == 0) return null;
			posb = pos - 1;
			continue;
		}
		if(b < val) {
			if(posb - posa == 0) return null;
			posa = pos + 1;
			continue;
		}
	}
	return null;
}

function unwrapRuleRegion(input) {
	let res = [];
	let cont = input;
	while(true) {
		if(cont.index == Infinity) break;
		let rules = cont.rules;
		for(let i = 0; i < rules.length; i++) {
			res.push(rules[i]);
		}
		cont = cont.container;
	}
	res.sort(function(a, b) {
		return a.index - b.index;
	});
	return res;
}

function lookupRule(currentList, ipVal) {
	if(!currentList) return null;
	let scanResult;
	while(true) {
		let currentScan = scanRuleList(currentList, ipVal);
		if(!currentScan) {
			break;
		}
		scanResult = currentScan;
		if(currentScan.list.length) {
			currentList = currentScan.list;
		} else {
			break;
		}
	}
	return scanResult;
}

function getMinRule(a, b) {
	let aIndex = Infinity;
	let bIndex = Infinity;
	if(a) aIndex = a.index;
	if(b) bIndex = b.index;
	if(aIndex > bIndex) {
		return b;
	} else {
		return a;
	}
}

function retrieveRestrictionRule(restGroup, ipVal, ipFam, isGrouped, world, tileX, tileY) {
	if(!restGroup) return null;
	world = world.toLowerCase();
	let ipMode = ipFam == 4 ? "ipv4" : "ipv6";
	let globalLookup = lookupRule(restGroup[ipMode]?.["."]?.list, ipVal);
	let worldLookup = lookupRule(restGroup[ipMode]?.[world]?.list, ipVal);
	let currentRule = getMinRule(globalLookup, worldLookup);
	if(isGrouped) {
		let globalGroup = restGroup["cg1"]?.["."]?.list?.[0];
		let worldGroup = restGroup["cg1"]?.[world]?.list?.[0];
		let groupRule = getMinRule(globalGroup, worldGroup);
		currentRule = getMinRule(currentRule, groupRule);
	}
	let regionRule;
	if(tileX != null && tileY != null) {
		let reg = lookupRule(restGroup[ipMode]?.[world]?.regions, ipVal);
		// currently, there's no support for cg1 region restrictions
		if(reg) {
			let unwrap = unwrapRuleRegion(reg);
			for(let r = 0; r < unwrap.length; r++) {
				let rule = unwrap[r];
				let region = rule.region;
				if(region[0] <= tileX && tileX <= region[2] && region[1] <= tileY && tileY <= region[3]) {
					regionRule = rule;
					break;
				}
			}
		}
	}
	let minRule = getMinRule(currentRule, regionRule);
	if(minRule) {
		if(minRule.rule) {
			return minRule.rule;
		} else {
			// region restriction rule
			return minRule;
		}
	}
	return null;
}

function retrieveSiteRestrictionRule(restGroups, ipVal, ipFam) {
	let ipMode = ipFam == 4 ? "ipv4" : "ipv6";
	let ipList = restGroups?.daccess?.site?.[ipMode];
	if(!ipList) return null;
	let lookup = lookupRule(ipList, ipVal, ipFam);
	if(lookup) {
		return lookup.rule;
	}
	return null;
}

module.exports = {
	procRest,
	procCoal,
	setRestrictions,
	getRestrictions,
	setRestrictionsFlatList,
	getRestrictionsFlatList,
	setRestrictionsFlatListStr,
	getRestrictionsFlatListStr,
	setCoalition,
	checkCoalition,
	rebuildRestrictionsList,
	rebuildCoalitionList,
	retrieveRestrictionRule,
	retrieveSiteRestrictionRule
};