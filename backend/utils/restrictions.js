var ipaddress = require("../framework/ipaddress.js");
var ipv4_to_range = ipaddress.ipv4_to_range;
var ipv6_to_range = ipaddress.ipv6_to_range;

var restrictions = {};
var coalition = {
	v4: [],
	v6: []
};
function setRestrictions(obj) {
	restrictions = obj;
}
function getRestrictions() {
	return restrictions;
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

// convert ip integer range to ip string
function reconIPv4(start, end) {
	var range = end - start + 1;
	var sub = 32 - Math.floor(Math.log2(range));
	var dig1 = (start) & 0xff;
	var dig2 = (start >> 8) & 0xff;
	var dig3 = (start >> 16) & 0xff;
	var dig4 = (start >> 24) & 0xff;
	var ip = dig4 + "." + dig3 + "." + dig2 + "." + dig1;
	if(sub != 32) ip += "/" + sub;
	return ip;
}

function reconIPv6(start, end) {
	var range = end - start + 1n;
	var sub = 0;
	for(var i = 0; i < 128; i++) {
		if(range < 2n) {
			break;
		}
		range /= 2n;
		sub++;
	}
	sub = 128 - sub;
	var s1 = ((start >> (16n*7n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var s2 = ((start >> (16n*6n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var s3 = ((start >> (16n*5n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var s4 = ((start >> (16n*4n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var s5 = ((start >> (16n*3n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var s6 = ((start >> (16n*2n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var s7 = ((start >> (16n*1n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var s8 = ((start) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
	var ip = s1 + ":" + s2 + ":" + s3 + ":" + s4 + ":" + s5 + ":" + s6 + ":" + s7 + ":" + s8;
	if(sub != 128) ip += "/" + sub;
	return ip;
}

function constructIPTree(list) {
	var res = {
		ip: null,
		list: [],
		index: Infinity
	};
	var path = [res];
	for(var i = 0; i < list.length; i++) {
		let ip = list[i];
		while(true) {
			let container = path.at(-1);
			let princip = container.ip;
			if(princip == null || ip[0] >= princip[0] && ip[0] <= princip[1]) {
				if(ip[2] > container.index) {
					// disqualified
					break;
				}
				let obj = {
					ip: ip,
					list: [],
					index: ip[2]
				};
				container.list.push(obj);
				path.push(obj);
				break;
			} else {
				path.pop();
			}
		}
	}
	return res;
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

function procRest(list) {
	let restrictionsList = [];
	let groups = {
		charrate: { ipv4: {}, ipv6: {}, cg1: {} },
		linkrate: { ipv4: {}, ipv6: {}, cg1: {} },
		color: { ipv4: {}, ipv6: {}, cg1: {} },
		daccess: {
			site: { ipv4: [], ipv6: [] },
			httpwrite: { ipv4: {}, ipv6: {}, cg1: {} }
		}
	};
	
	let charrate_list_ipv4 = [];
	let charrate_list_ipv6 = [];
	let charrate_list_cg1 = [];
	
	let linkrate_list_ipv4 = [];
	let linkrate_list_ipv6 = [];
	let linkrate_list_cg1 = [];
	
	let color_list_ipv4 = [];
	let color_list_ipv6 = [];
	let color_list_cg1 = [];
	
	let httpwrite_list_ipv4 = [];
	let httpwrite_list_ipv6 = [];
	let httpwrite_list_cg1 = [];

	for(let i = 0; i < list.length; i++) {
		let item = list[i].split(";");
		let itemtype = "";
		let itemip = "";
		let itemgroup = "";
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
				type: "charrate",
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
				type: "linkrate",
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
				type: "color",
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
				type: "daccess",
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
			restrictionsList.push(obj);
		}
		if(obj && obj.world != ".") {
			switch(obj.type) {
				case "charrate":
					if(itemip) {
						if(obj.ip[1] == 4) {
							charrate_list_ipv4.push(obj);
						} else if(obj.ip[1] == 6) {
							charrate_list_ipv6.push(obj);
						}
					} else if(itemgroup) {
						charrate_list_cg1.push(obj);
					}
					break;
				case "linkrate":
					if(itemip) {
						if(obj.ip[1] == 4) {
							linkrate_list_ipv4.push(obj);
						} else if(obj.ip[1] == 6) {
							linkrate_list_ipv6.push(obj);
						}
					} else if(itemgroup) {
						linkrate_list_cg1.push(obj);
					}
					break;
				case "color":
					if(itemip) {
						if(obj.ip[1] == 4) {
							color_list_ipv4.push(obj);
						} else if(obj.ip[1] == 6) {
							color_list_ipv6.push(obj);
						}
					} else if(itemgroup) {
						color_list_cg1.push(obj);
					}
					break;
				case "daccess":
					if(obj.mode == "site") {
						if(itemip) {
							if(obj.ip[1] == 4) {
								groups.daccess.site.ipv4.push(obj);
							} else if(obj.ip[1] == 6) {
								groups.daccess.site.ipv6.push(obj);
							}
						}
					} else if(obj.mode == "httpwrite") {
						if(itemip) {
							if(obj.ip[1] == 4) {
								httpwrite_list_ipv4.push(obj);
							} else if(obj.ip[1] == 6) {
								httpwrite_list_ipv6.push(obj);
							}
						} else if(itemgroup) {
							httpwrite_list_cg1.push(obj);
						}
					}
			}
		}
	}
	
	sortRestrictionListIPv4(charrate_list_ipv4);
	sortRestrictionListIPv6(charrate_list_ipv6);

	sortRestrictionListIPv4(linkrate_list_ipv4);
	sortRestrictionListIPv6(linkrate_list_ipv6);

	sortRestrictionListIPv4(color_list_ipv4);
	sortRestrictionListIPv6(color_list_ipv6);

	sortRestrictionListIPv4(groups.daccess.site.ipv4);
	sortRestrictionListIPv4(groups.daccess.site.ipv6);

	sortRestrictionListIPv4(httpwrite_list_ipv4);
	sortRestrictionListIPv4(httpwrite_list_ipv6);
	
	// we don't need to sort the cg1 lists nor build a restrictions tree for them
	
	// look through each list and split by worldname. the "." worldname represents all worlds.
	divideRestrictionsIntoWorlds(charrate_list_ipv4, groups.charrate.ipv4);
	divideRestrictionsIntoWorlds(charrate_list_ipv6, groups.charrate.ipv6);
	divideRestrictionsIntoWorlds(charrate_list_cg1, groups.charrate.cg1);
	
	divideRestrictionsIntoWorlds(linkrate_list_ipv4, groups.linkrate.ipv4);
	divideRestrictionsIntoWorlds(linkrate_list_ipv6, groups.linkrate.ipv6);
	divideRestrictionsIntoWorlds(linkrate_list_cg1, groups.linkrate.cg1);
	
	divideRestrictionsIntoWorlds(color_list_ipv4, groups.color.ipv4);
	divideRestrictionsIntoWorlds(color_list_ipv6, groups.color.ipv6);
	divideRestrictionsIntoWorlds(color_list_cg1, groups.color.cg1);
	
	divideRestrictionsIntoWorlds(httpwrite_list_ipv4, groups.daccess.httpwrite.ipv4);
	divideRestrictionsIntoWorlds(httpwrite_list_ipv6, groups.daccess.httpwrite.ipv6);
	divideRestrictionsIntoWorlds(httpwrite_list_cg1, groups.daccess.httpwrite.cg1);
	
	divideGroupIntoRestrictionsTree(groups.charrate);
	divideGroupIntoRestrictionsTree(groups.linkrate);
	divideGroupIntoRestrictionsTree(groups.color);
	divideGroupIntoRestrictionsTree(groups.daccess.httpwrite);
	
	groups.daccess.site.ipv4 = buildRestrictionsTree(groups.daccess.site.ipv4);
	groups.daccess.site.ipv6 = buildRestrictionsTree(groups.daccess.site.ipv6);
	
	return {
		groups: groups,
		raw: rebuildRestrictionsList(restrictionsList)
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
		raw: rebuildCoalitionList(ranges4, ranges6)
	};
}

function rebuildRestrictionsList(restrictions) {
	var rstr = "";
	for(var i = 0; i < restrictions.length; i++) {
		var restr = restrictions[i];

		var type = restr.type;
		var ip = restr.ip;
		var group = restr.group;

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
			rstr += rstrLine.join(";") + "\n";
		} else if(type == "linkrate") {
			var rate = restr.rate;
			var world = restr.world;
			var rstrLine = [identifier, "type=linkrate", "rate=" + rate];
			if(world != null) {
				rstrLine.push("world=" + world);
			}
			rstr += rstrLine.join(";") + "\n";
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
			rstr += rstrLine.join(";") + "\n";
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
			rstr += rstrLine.join(";") + "\n";
		}
	}
	return rstr;
}

function rebuildCoalitionList(ranges4, ranges6) {
	var cstr = "";
	for(var i = 0; i < ranges4.length; i++) {
		cstr += reconIPv4(ranges4[i][0], ranges4[i][1]) + "\n";
	}
	for(var i = 0; i < ranges6.length; i++) {
		cstr += reconIPv6(ranges6[i][0], ranges6[i][1]) + "\n";
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
	let lookup = lookupRule(restGroups.daccess.site[ipMode], ipVal, ipFam);
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
	setCoalition,
	checkCoalition,
	rebuildRestrictionsList,
	rebuildCoalitionList,
	retrieveRestrictionRule,
	retrieveSiteRestrictionRule
};