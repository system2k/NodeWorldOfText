var ipaddress = require("../../utils/ipaddress.js");
var ipv4_to_range = ipaddress.ipv4_to_range;
var ipv6_to_range = ipaddress.ipv6_to_range;

var restrictions_string = "";
var coalition_group = "";

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

function procRest(list) {
	var restrictions = [];
	for(var i = 0; i < list.length; i++) {
		var item = list[i].split(";");
		var itemtype = "";
		var itemip = "";
		var itemgroup = "";
		var props = {};
		for(var x = 0; x < item.length; x++) {
			var subitem = item[x].split("=");
			var key = subitem[0].trim().toLowerCase();
			var val = subitem.slice(1).join("=").trim();
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
		if((!itemip && !itemgroup) || (itemtype != "charrate" && itemtype != "color" && itemtype != "linkrate" && itemtype != "daccess")) continue;
		if(itemgroup && itemip) continue; // can't have both
		
		var obj = null;
		if(itemtype == "charrate") {
			var rate = props.rate;
			var world = props.world;
			var region = props.region;
			if(!("world" in props)) {
				world = null;
			}
			region = procRegionString(region);
			rate = parseInt(rate);
			if(isNaN(rate)) continue;
			if(rate < 0) rate = 0;
			if(rate > 1000000) rate = 1000000;
			obj = {
				type: "charrate",
				rate, world, region
			};
		} else if(itemtype == "linkrate") {
			var rate = props.rate;
			var world = props.world;
			if(!("world" in props)) {
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
			var region = props.region;
			var world = props.world;
			if(!("world" in props)) {
				world = null;
			}
			region = procRegionString(region);
			obj = {
				type: "color",
				region, world
			};
		} else if(itemtype == "daccess") {
			var mode = props.mode;
			var note = props.note;
			var world = props.world;
			if(mode != "httpwrite" && mode != "site") continue;
			if(typeof note != "string" || !note) note = null;
			if(!("world" in props)) {
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
				var ipInfo = procIP(itemip);
				if(!ipInfo) continue;
				obj.ip = ipInfo;
			} else if(itemgroup) {
				obj.group = itemgroup;
			}
			restrictions.push(obj);
		}
	}
	
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

	restrictions_string = rstr;
	return restrictions;
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
	var cstr = "";
	for(var i = 0; i < ranges4.length; i++) {
		cstr += reconIPv4(ranges4[i][0], ranges4[i][1]) + "\n";
	}
	for(var i = 0; i < ranges6.length; i++) {
		cstr += reconIPv6(ranges6[i][0], ranges6[i][1]) + "\n";
	}
	ranges4 = removeOverlaps(ranges4); // must be done after list reconstruction
	ranges6 = removeOverlaps(ranges6);
	coalition_group = cstr;
	return {
		v4: ranges4,
		v6: ranges6
	};
}

module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	var user = ctx.user;

	var createCSRF = server.createCSRF;

	if(!user.superuser) return;

	var csrftoken = createCSRF(user.id.toString(), 0);

	write(render("administrator_restrictions.html", {
		rstr: restrictions_string,
		coal: coalition_group,
		csrftoken
	}));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	var query_data = ctx.query_data;

	var checkCSRF = server.checkCSRF;

	var setRestrictions;
	var setCoalition;

	if(!user.superuser) return;

	var csrftoken = req.headers["x-csrf-token"];
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed");
	}

	var type = query_data.type;

	var list = post_data.toString("utf8");
	list = list.replace(/\r\n/g, "\n");
	list = list.split("\n");

	if(type == "1") { // restrictions
		setRestrictions(procRest(list));
	} else if(type == "2") { // coalesce
		setCoalition(procCoal(list));
	}

	write("SUCCESS");
}