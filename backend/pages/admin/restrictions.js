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

	if(!user.superuser) return;

	var restrictions = {};

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
			if(!restrictions[itemip]) restrictions[itemip] = {};
			restrictions[itemip].charrate = {
				rate, world
			};
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
			
			if(!restrictions[itemip]) restrictions[itemip] = {};
			restrictions[itemip].color = {
				region, world
			};
		}
	}
	
	var rstr = "";
	for(var ip in restrictions) {
		var restriction = restrictions[ip];
		if(restriction.charrate) {
			var rate = restriction.charrate.rate;
			var world = restriction.charrate.world;
			rstr += "ip=" + ip + ";type=charrate;rate=" + rate + ";world=" + world + "\n";
		}
		if(restriction.color) {
			var region = restriction.color.region;
			var world = restriction.color.world;
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