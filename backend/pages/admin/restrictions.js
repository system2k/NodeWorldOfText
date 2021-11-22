var restrictions_string = "";

module.exports.GET = async function(req, serve, vars, evars) {
	var HTML = evars.HTML;
	var user = evars.user;

	if(!user.superuser) return;

	serve(HTML("administrator_restrictions.html", {
		rstr: restrictions_string
	}));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var user = evars.user;

	var setRestrictions = vars.setRestrictions;
	var ipv4_to_range = vars.ipv4_to_range;
	var ipv6_to_range = vars.ipv6_to_range;

	if(!user.superuser) return;

	var restrictions = [];

	var list = post_data.toString("utf8");
	list = list.replace(/\r\n/g, "\n");
	list = list.split("\n");
	for(var i = 0; i < list.length; i++) {
		var item = list[i].split(";");
		var itemtype = "";
		var itemip = "";
		var props = {};
		for(var x = 0; x < item.length; x++) {
			var subitem = item[x].split("=");
			var key = subitem[0].trim().toLowerCase();
			var val = subitem.slice(1).join("=").trim();
			if(key == "ip") {
				itemip = val;
			} else if(key == "type") {
				itemtype = val;
			} else {
				props[key] = val;
			}
		}
		if(!itemip || (itemtype != "charrate" && itemtype != "color")) continue;

		var ipRange = null;
		var ipFam = 0;
		if(itemip.includes(":")) {
			ipRange = ipv6_to_range(itemip);
			ipFam = 6;
		} else if(itemip.includes(".")) {
			ipRange = ipv4_to_range(itemip);
			ipFam = 4;
		} else {
			continue;
		}
		
		if(itemtype == "charrate") {
			var rate = props.rate;
			var world = props.world;
			if(!("world" in props)) {
				world = null;
			}
			rate = parseInt(rate);
			if(isNaN(rate)) continue;
			if(rate < 0) rate = 0;
			if(rate > 1000000) rate = 1000000;
			restrictions.push([ipRange, ipFam, "charrate", rate, world]);
		}
		if(itemtype == "color") {
			var region = props.region;
			var world = props.world;
			if(!("world" in props)) {
				world = null;
			}
			if(region) {
				region = region.split(",");
				if(region.length == 4) {
					var x1 = parseInt(region[0]);
					var y1 = parseInt(region[1]);
					var x2 = parseInt(region[2]);
					var y2 = parseInt(region[3]);
					if(!(isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2))) {
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
						region = [x1, y1, x2, y2];
					} else {
						region = null;
					}
				} else {
					region = null;
				}
			} else {
				region = null;
			}
			restrictions.push([ipRange, ipFam, "color", region, world]);
		}
	}
	
	var rstr = "";
	for(var i = 0; i < restrictions.length; i++) {
		var restr = restrictions[i];

		var ipRange = restr[0];
		var ipFam = restr[1];
		var type = restr[2];

		// reconstruct string representation of IP address from IP ranges
		var ip = "";
		if(ipFam == 4) {
			var range = ipRange[1] - ipRange[0] + 1;
			var sub = 32 - Math.floor(Math.log2(range));
			var dig1 = (ipRange[0]) & 0xff;
			var dig2 = (ipRange[0] >> 8) & 0xff;
			var dig3 = (ipRange[0] >> 16) & 0xff;
			var dig4 = (ipRange[0] >> 24) & 0xff;
			ip = dig4 + "." + dig3 + "." + dig2 + "." + dig1;
			if(sub != 32) ip += "/" + sub;
		} else if(ipFam == 6) {
			var range = ipRange[1] - ipRange[0] + 1n;
			var sub = 0;
			for(var i = 0; i < 128; i++) {
				if(range < 2n) {
					break;
				}
				range /= 2n;
				sub++;
			}
			sub = 128 - sub;
			var s1 = ((ipRange[0] >> (16n*7n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			var s2 = ((ipRange[0] >> (16n*6n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			var s3 = ((ipRange[0] >> (16n*5n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			var s4 = ((ipRange[0] >> (16n*4n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			var s5 = ((ipRange[0] >> (16n*3n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			var s6 = ((ipRange[0] >> (16n*2n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			var s7 = ((ipRange[0] >> (16n*1n)) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			var s8 = ((ipRange[0]) & 0xffffn).toString(16).toUpperCase().padStart(4, 0);
			ip = s1 + ":" + s2 + ":" + s3 + ":" + s4 + ":" + s5 + ":" + s6 + ":" + s7 + ":" + s8;
			if(sub != 128) ip += "/" + sub;
		}

		if(type == "charrate") {
			var rate = restr[3];
			var world = restr[4];
			var rstrLine = ["ip=" + ip, "type=charrate", "rate=" + rate];
			if(world != null) {
				rstrLine.push("world=" + world);
			}
			rstr += rstrLine.join(";") + "\n";
		} else if(type == "color") {
			var region = restr[3];
			var world = restr[4];
			var rstrLine = ["ip=" + ip, "type=color"];
			if(world) {
				rstrLine.push("world=" + world);
			}
			if(region) {
				rstrLine.push("region=" + region.join(","));
			}
			rstr += rstrLine.join(";") + "\n";
		}
	}

	restrictions_string = rstr;
	setRestrictions(restrictions);

	serve("SUCCESS");
}