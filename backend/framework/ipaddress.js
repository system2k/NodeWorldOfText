var fs = require("fs");

function normalize_ipv6(ip) {
	ip = ip.replace(/^:|:$/g, "");
	ip = ip.split(":");
	
	for(var i = 0; i < ip.length; i++) {
		var seg = ip[i];
		if(seg) {
			ip[i] = seg.padStart(4, "0");
		} else {
			seg = [];
			for(var a = ip.length; a <= 8; a++) {
				seg.push("0000");
			}
			ip[i] = seg.join(":");
		}
	}
	return ip.join(":");
}

// TODO: move this elsewhere
var cloudflare_ipv4_txt = fs.readFileSync("./backend/cloudflare_ipv4.txt").toString();
var cloudflare_ipv6_txt = fs.readFileSync("./backend/cloudflare_ipv6.txt").toString();

var cloudflare_ipv4_int = [];
var cloudflare_ipv6_int = [];

function ipv4_to_int(str) {
	str = str.split(".").map(function(e) {
		return parseInt(e, 10);
	});
	return str[0] * 16777216 + str[1] * 65536 + str[2] * 256 + str[3];
}

// ipv6 must be normalized
function ipv6_to_int(str) {
	str = str.split(":").map(function(e) {
		return BigInt(parseInt(e, 16));
	});
	return str[7] | str[6] << 16n | str[5] << 32n | str[4] << 48n | str[3] << 64n | str[2] << 80n | str[1] << 96n | str[0] << 112n;
}

function ipv4_txt_to_int() {
	var txt = cloudflare_ipv4_txt;
	txt = txt.replace(/\r\n/g, "\n");
	txt = txt.split("\n");
	for(var i = 0; i < txt.length; i++) {
		var ip = txt[i];
		if(!ip) continue;
		ip = ip.trim();
		if(ip == "") continue;
		ip = ip.split("/");
		var addr = ip[0];
		var sub = parseInt(ip[1]);
		var num = ipv4_to_int(addr);

		var ip_start = unsigned_u32_and(num, subnetMask_ipv4(sub));
		var ip_end = unsigned_u32_or(num, subnetOr_ipv4(sub));

		cloudflare_ipv4_int.push([ip_start, ip_end]);
	}
}

function ipv6_txt_to_int() {
	var txt = cloudflare_ipv6_txt;
	txt = txt.replace(/\r\n/g, "\n");
	txt = txt.split("\n");
	for(var i = 0; i < txt.length; i++) {
		var ip = txt[i];
		if(!ip) continue;
		ip = ip.trim();
		if(ip == "") continue;
		ip = ip.split("/");
		var addr = ip[0];
		var sub = parseInt(ip[1]);
		addr = normalize_ipv6(addr);
		var num = ipv6_to_int(addr);

		var ip_start = num & subnetMask_ipv6(sub);
		var ip_end = num | subnetOr_ipv6(sub);

		cloudflare_ipv6_int.push([ip_start, ip_end]);
	}
}

function ipv4_to_range(ip) {
	ip = ip.trim();
	ip = ip.split("/");
	var addr = ip[0];
	var sub = parseInt(ip[1]);
	if(isNaN(sub)) sub = 32;
	var num = ipv4_to_int(addr);
	var ip_start = unsigned_u32_and(num, subnetMask_ipv4(sub));
	var ip_end = unsigned_u32_or(num, subnetOr_ipv4(sub));
	return [ip_start, ip_end];
}

function ipv6_to_range(ip) {
	ip = ip.split("/");
	var addr = ip[0];
	var sub = parseInt(ip[1]);
	if(isNaN(sub)) sub = 128;
	addr = normalize_ipv6(addr);
	var num = ipv6_to_int(addr);
	var ip_start = num & subnetMask_ipv6(sub);
	var ip_end = num | subnetOr_ipv6(sub);
	return [ip_start, ip_end];
}

var u32Byte = new Uint32Array(1);
function unsigned_u32_and(x, y) {
	u32Byte[0] = x;
	u32Byte[0] &= y;
	return u32Byte[0];
}

function unsigned_u32_or(x, y) {
	u32Byte[0] = x;
	u32Byte[0] |= y;
	return u32Byte[0];
}

function subnetMask_ipv4(num) {
	return ((1 << 32) - 2 >>> 0) - (2 ** (32 - num) - 1);
}

function subnetOr_ipv4(num) {
	return 2 ** (32 - num) - 1;
}

function subnetMask_ipv6(num) {
	return ((1n << 128n) - 1n) - (1n << (128n - BigInt(num))) + 1n;
}

function subnetOr_ipv6(num) {
	return ((1n << (128n - BigInt(num))) - 1n);
}

function is_cf_ipv4_int(num) {
	for(var i = 0; i < cloudflare_ipv4_int.length; i++) {
		var ip = cloudflare_ipv4_int[i];
		if(num >= ip[0] && num <= ip[1]) return true;
	}
	return false;
}

function is_cf_ipv6_int(num) {
	for(var i = 0; i < cloudflare_ipv6_int.length; i++) {
		var ip = cloudflare_ipv6_int[i];
		if(num >= ip[0] && num <= ip[1]) return true;
	}
	return false;
}

ipv4_txt_to_int();
ipv6_txt_to_int();


function evaluateIpAddress(remIp, realIp, cfIp) {
	var ipAddress = remIp;
	var ipAddressFam = 4;
	var ipAddressVal = 1;
	if(!ipAddress) { // ipv4
		ipAddress = "0.0.0.0";
	} else {
		if(ipAddress.indexOf(".") > -1) { // ipv4
			ipAddress = ipAddress.split(":").slice(-1);
			ipAddress = ipAddress[0];
			ipAddressVal = ipv4_to_int(ipAddress);
		} else { // ipv6
			ipAddressFam = 6;
			ipAddress = normalize_ipv6(ipAddress);
			ipAddressVal = ipv6_to_int(ipAddress);
		}
	}

	if(ipAddress == "127.0.0.1" && realIp) {
		ipAddress = realIp;
		if(ipAddress.indexOf(".") > -1) {
			ipAddressFam = 4;
		} else {
			ipAddressFam = 6;
			ipAddress = normalize_ipv6(ipAddress);
		}
		if(ipAddressFam == 4) {
			ipAddressVal = ipv4_to_int(ipAddress);
			if(is_cf_ipv4_int(ipAddressVal)) {
				ipAddress = cfIp;
				if(!ipAddress) {
					ipAddress = "0.0.0.0";
				}
				if(ipAddress.indexOf(".") > -1) {
					ipAddressFam = 4;
					ipAddressVal = ipv4_to_int(ipAddress);
				} else {
					ipAddressFam = 6;
					ipAddress = normalize_ipv6(ipAddress);
					ipAddressVal = ipv6_to_int(ipAddress);
				}
			}
		} else if(ipAddressFam == 6) {
			ipAddressVal = ipv6_to_int(ipAddress);
			if(is_cf_ipv6_int(ipAddressVal)) {
				ipAddress = cfIp;
				if(!ipAddress) {
					ipAddress = "0.0.0.0";
				}
				if(ipAddress.indexOf(".") > -1) {
					ipAddressFam = 4;
					ipAddressVal = ipv4_to_int(ipAddress);
				} else {
					ipAddressFam = 6;
					ipAddress = normalize_ipv6(ipAddress);
					ipAddressVal = ipv6_to_int(ipAddress);
				}
			}
		}
	}
	return [ipAddress, ipAddressFam, ipAddressVal];
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

function reconIP(ipObj) {
	let ipRange = ipObj[0];
	let ipFam = ipObj[1];
	if(ipFam == 4) {
		return reconIPv4(ipRange[0], ipRange[1]);
	} else if(ipFam == 6) {
		return reconIPv6(ipRange[0], ipRange[1]);
	}
	return null;
}


module.exports = {
	normalize_ipv6,
	ipv4_to_int,
	ipv6_to_int,
	ipv4_to_range,
	ipv6_to_range,
	is_cf_ipv4_int,
	is_cf_ipv6_int,
	evaluateIpAddress,
	reconIPv4,
	reconIPv6,
	reconIP,
};