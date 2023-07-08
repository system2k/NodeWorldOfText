var fs = require("fs");

function trimHTML(html) {
	// ensure all lines are \r\n instead of just \n (consistent)
	html = html.replace(/\r\n/g, "\n");
	html = html.split("\n");
	var newHtml = [];
	for(var i = 0; i < html.length; i++) {
		html[i] = html[i].trim();
		if(html[i]) {
			newHtml.push(html[i]);
		}
	}
	return newHtml.join("\r\n");
}

function checkDuplicateCookie(cookieStr, key) {
	if(typeof cookieStr != "string") return false;
	cookieStr = cookieStr.split(";");
	key = key.toLowerCase();
	var cnt = 0;
	for(var i = 0; i < cookieStr.length; i++) {
		var cook = cookieStr[i].split("=");
		var keyData = cook[0].trim().toLowerCase();
		if(keyData != key) continue;
		cnt++;
		if(cnt > 1) return true;
	}
	return false;
}

var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function create_date(time) {
	var str = "(UTC) ";
	
	var date = new Date(time);
	var month = date.getUTCMonth();
	str += months[month] + " ";
	
	var day = date.getUTCDate();
	str += day + ", ";
	
	var year = date.getUTCFullYear();
	str += year + " ";
	
	var hour = date.getUTCHours();
	var ampm = " AM";
	if(hour >= 12) {
		ampm = " PM";
	}
	if(hour > 12) {
		hour = hour - 12;
	}
	if(hour === 0) {
		hour = 12;
	}
	str += hour;
	
	var minute = date.getUTCMinutes();
	minute = ("0" + minute).slice(-2);
	str += ":" + minute;
	
	var second = date.getUTCSeconds();
	second = ("0" + second).slice(-2);
	str += ":" + second + ampm;
	
	return str;
}

// sanitize number input to be strictly between -9007199254740991 and 9007199254740991
function san_nbr(x) {
	if(typeof x == "string") x -= 0;
	if(typeof x == "bigint") x = Number(x);
	if(x === true) x = 1;
	if(x == Infinity) x = 9007199254740991;
	if(x == -Infinity) x = -9007199254740991;
	if(typeof x != "number") x = 0;
	if(!x || isNaN(x) || !isFinite(x)) x = 0;
	if(x > 9007199254740991) x = 9007199254740991;
	if(x < -9007199254740991) x = -9007199254740991;
	return Math.trunc(x);
}

// sanitize number input containing decimals
function san_dp(x) {
	if(typeof x == "string") x = parseFloat(x);
	if(x == -0) x = 0;
	if(!isFinite(x)) x = 0;
	if(typeof x != "number") x = 0;
	if(x > 9007199254740991) x = 9007199254740991;
	if(x < -9007199254740991) x = -9007199254740991;
	return x;
}

function removeLastSlash(text) {
	if(text.charAt(text.length - 1) == "/") {
		text = text.slice(0, text.length - 1);
	}
	return text;
}

function trimSlash(text) {
	if(text[0] == "/") text = text.substr(1);
	if(text[text.length - 1] == "/") text = text.slice(0, -1);
	return text;
}

function parseCookie(input) {
	if(!input) input = "";
	var out = {};

	var mode = 0; // 0 = key, 1 = value
	var buffer_k = ""; // key
	var buffer_v = ""; // value

	for(var i = 0; i < input.length; i++) {
		var chr = input.charAt(i);

		var sSkip = false; // jump over char buffer

		// check for value assignments
		if(chr == "=" && mode == 0) {
			mode = 1;
			sSkip = true;
		}

		// char buffer
		if(chr != ";" && !sSkip) {
			if(mode == 0) {
				buffer_k += chr;
			}
			if(mode == 1) {
				buffer_v += chr;
			}
		}

		// check ending of each key/value
		if(chr == ";" || i == input.length - 1) {
			mode = 0;

			// trim whitespaces from beginning and end
			buffer_k = buffer_k.trim();
			buffer_v = buffer_v.trim();

			var valid = true;

			// ignore empty sets
			if(buffer_k == "" && buffer_v == "") {
				valid = false;
			}

			if(valid) {
				// strip quotes (if any)
				if(buffer_k.charAt(0) == "\"" && buffer_k.charAt(buffer_k.length - 1) == "\"") buffer_k = buffer_k.slice(1, -1);
				if(buffer_v.charAt(0) == "\"" && buffer_v.charAt(buffer_v.length - 1) == "\"") buffer_v = buffer_v.slice(1, -1);

				// invalid escape sequences can cause errors
				try {
					buffer_k = decodeURIComponent(buffer_k);
				} catch(e){}
				try {
					buffer_v = decodeURIComponent(buffer_v);
				} catch(e){}

				// no overrides from sets with the same key
				if(!(buffer_k in out)) out[buffer_k] = buffer_v;
			}

			buffer_k = "";
			buffer_v = "";
		}
	}

	return out;
}

// trim whitespaces in all items in array
function ar_str_trim(ar) {
	for(var i = 0; i < ar.length; i++) {
		ar[i] = ar[i].trim();
	}
	return ar;
}

function ar_str_decodeURI(ar) {
	for(var i = 0; i < ar.length; i++) {
		ar[i] = decodeURIComponent(ar[i]);
	}
	return ar;
}

// generate an expire string for cookies
var dayWeekList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var monthList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function http_time(timeStamp) {
	var _date = new Date(timeStamp);
	var _DayOfWeek = dayWeekList[_date.getUTCDay()];
	var _Day = _date.getUTCDate().toString().padStart(2, 0);
	var _Month = monthList[_date.getUTCMonth()];
	var _Year = _date.getUTCFullYear();
	var _Hour = _date.getUTCHours().toString().padStart(2, 0);
	var _Minute = _date.getUTCMinutes().toString().padStart(2, 0);
	var _Second = _date.getUTCSeconds().toString().padStart(2, 0);

	var compile = _DayOfWeek + ", " + _Day + " " + _Month + " " + _Year + " " + _Hour + ":" + _Minute + ":" + _Second + " GMT";
	return compile;
}

function encode_base64(str) {
	return Buffer.from(str).toString("base64");
}
function decode_base64(b64str) {
	return Buffer.from(b64str, "base64").toString("utf8");
}

// properly take all data from an error stack
function process_error_arg(e) {
	var error = {};
	if(typeof e == "object") {
		// retrieve hidden properties
		var keys = Object.getOwnPropertyNames(e);
		for(var i = 0; i < keys.length; i++) {
			error[keys[i]] = e[keys[i]];
		}
	} else {
		error.data = e;
	}
	return error;
}

function tile_coord(coord) {
	coord = coord.split(",");
	return [parseInt(coord[0]), parseInt(coord[1])];
}

// todo: move to server
var start_time = Date.now();
function uptime(custom_ms_ago) {
	// (milliseconds ago)
	var difference = custom_ms_ago || (Date.now() - start_time);

	var str = "";

	var days = Math.floor(difference / 86400000);
	difference -= days * 86400000;
	var hours = Math.floor(difference / 3600000);
	difference -= hours * 3600000;
	var minutes = Math.floor(difference / 60000);
	difference -= minutes * 60000;
	var seconds = Math.floor(difference / 1000);
	difference -= seconds * 1000;

	if(days > 0) {
		if(str) str += ", ";
		str += days + " day" + (days != 1 ? "s" : "");
	}
	if(hours > 0) {
		if(str) str += ", ";
		str += hours + " hour" + (hours != 1 ? "s" : "");
	}
	if(minutes > 0) {
		if(str) str += ", ";
		str += minutes + " minute" + (minutes != 1 ? "s" : "");
	}
	if(seconds > 0) {
		if(str) str += ", ";
		str += seconds + " second" + (seconds != 1 ? "s" : "");
	}

	return str;
}

// recursive directory dumper
function dump_dir(dest, fs_path, virt_path, only_pathname, path_lower) {
	var directory = fs.readdirSync(fs_path);
	for(var i in directory) {
		var currentPath = fs_path + directory[i];
		if(!fs.lstatSync(currentPath).isDirectory()) {
			var pathname = virt_path + directory[i];
			if(path_lower) pathname = pathname.toLowerCase();
			if(!only_pathname) {
				dest[pathname] = fs.readFileSync(currentPath);
			} else {
				dest[pathname] = currentPath;
			}
		} else {
			dump_dir(dest, fs_path + directory[i] + "/", virt_path + directory[i] + "/", only_pathname);
		}
	}
}

function compareNoCase(str1, str2) {
	str1 += "";
	str2 += "";
	var res = str1.localeCompare(str2, "en", {
		sensitivity: "base"
	});
	return !res;
}

function resembles_int_number(string) {
	if(!string) return false;
	var set = "0123456789"
	for(var i = 0; i < string.length; i++) {
		var chr = string.charAt(i);
		if(set.indexOf(chr) == -1) return false;
	}
	return true;
}

function TerminalMessage(cWidth, cHeight) {
	var charField = new Array(cWidth * cHeight).fill(" ");
	var foreColorField = new Array(cWidth * cHeight).fill("");
	var backColorField = new Array(cWidth * cHeight).fill("");

	var chrInf = {
		vPipe: "\u2551",
		hPipe: "\u2550",
		tlPipe: "\u2554",
		trPipe: "\u2557",
		blPipe: "\u255a",
		brPipe: "\u255d",
		mShade: "\u2592"
	}

	var fore_colors = {
		black:          "30",
		red:            "31",
		green:          "32",
		yellow:         "33",
		blue:           "34",
		magenta:        "35",
		cyan:           "36",
		white:          "37",
		bright_black:   "30;1",
		bright_red:     "31;1",
		bright_green:   "32;1",
		bright_yellow:  "33;1",
		bright_blue:    "34;1",
		bright_magenta: "35;1",
		bright_cyan:    "36;1",
		bright_white:   "37;1"
	};

	var back_colors = {
		black:          "40",
		red:            "41",
		green:          "42",
		yellow:         "43",
		blue:           "44",
		magenta:        "45",
		cyan:           "46",
		white:          "47",
		bright_black:   "100",
		bright_red:     "101",
		bright_green:   "102",
		bright_yellow:  "103",
		bright_blue:    "104",
		bright_magenta: "105",
		bright_cyan:    "106",
		bright_white:   "107"
	};

	this.setChar = function(chr, x, y, fore, back) {
		if(x < 0 || y < 0 || x >= cWidth || y >= cHeight) return;
		var idx = y * cWidth + x;
		if(chr == "\r" || chr == "\n" || chr.length != 1) chr = " ";
		charField[idx] = chr;
		if(fore) {
			foreColorField[idx] = fore_colors[fore]
		} else if(fore != "i") {
			foreColorField[idx] = "";
		}
		if(back) {
			backColorField[idx] = back_colors[back]
		} else if(back != "i") {
			backColorField[idx] = "";
		}
	}

	this.setSquare = function(x1, y1, x2, y2, fore, back) {
		var tmp;
		// flip x positions if the X is greater than Y
		if(x1 > x2) {
			tmp = x1;
			x1 = x2;
			x2 = tmp;
		}
		if(y1 > y2) {
			tmp = y1;
			y1 = y2;
			y2 = tmp;
		}

		// 4 corners
		this.setChar(chrInf.tlPipe, x1, y1, fore, back);
		this.setChar(chrInf.brPipe, x2, y2, fore, back);
		this.setChar(chrInf.trPipe, x2, y1, fore, back);
		this.setChar(chrInf.blPipe, x1, y2, fore, back);

		// 2 horizontal lines
		for(var x = 0; x < x2 - x1 - 1; x++) {
			this.setChar(chrInf.hPipe, x + x1 + 1, y1, fore, back);
			this.setChar(chrInf.hPipe, x + x1 + 1, y2, fore, back);
		}

		// 2 vertical lines
		for(var y = 0; y < y2 - y1 - 1; y++) {
			this.setChar(chrInf.vPipe, x1, y + y1 + 1, fore, back);
			this.setChar(chrInf.vPipe, x2, y + y1 + 1, fore, back);
		}
	}

	this.setText = function(text, x, y, fore, back) {
		var cx = x;
		var cy = y;
		for(var i = 0; i < text.length; i++) {
			var chr = text[i];
			if(chr == "\n") {
				cx = c;
				cy++;
				continue;
			}
			this.setChar(chr, cx, cy, fore, back);
			cx++;
		}
	}

	this.setBack = function(back) {
		for(var i = 0; i < backColorField.length; i++) {
			backColorField[i] = back_colors[back];
		}
	}

	// render the char field into a string to be logged to the terminal
	this.render = function() {
		var res = "";

		var use_color = false;
		var prev_back = "";
		var prev_fore = "";
		var prev_is_bright = false;

		var xNl = 0;
		// is space, reset fore color
		for(var i = 0; i < charField.length; i++) {
			if(charField[i] == " ") foreColorField[i] = "";
		}

		for(var i = 0; i < charField.length; i++) {
			// with color escape optimizations
			var foreCol = foreColorField[i];
			var backCol = backColorField[i];

			var foreColD = foreCol; // original copy of color info (original will get modified)
			var backColD = backCol;
			if(foreCol || backCol) use_color = true;

			var col_cmp = "";

			if(backCol && prev_back == backCol) backCol = "";
			if(foreCol && prev_fore == foreCol) foreCol = "";

			if(foreCol && !backCol) col_cmp = foreCol;
			if(!foreCol && backCol) col_cmp = backCol;
			if(foreCol && backCol) col_cmp = foreCol + ";" + backCol;

			var fBlank = false;
			var bBlank = false;
			var blank = "";

			// detect if the current character has no color information, but the previous character did
			if(prev_back && !backColD) {
				backCol = "";
				prev_back = "";
				bBlank = true;
			}
			if(prev_fore && !foreColD) {
				foreCol = "";
				prev_fore = "";
				fBlank = true;
			}
			// reset to terminal default colors
			if(fBlank && !bBlank) blank = "\x1b[" + "37" + "m";
			if(!fBlank && bBlank) blank = "\x1b[" + "40" + "m";
			if(fBlank && bBlank) blank = "\x1b[" + "0" + "m";
			res += blank;

			// reset brightness
			if(prev_is_bright && !foreColD.endsWith(";1")) {
				res += "\x1b[0m";
			}

			// set the color of the character
			if(col_cmp) res += "\x1b[" + col_cmp + "m";
			res += charField[i];

			if(backCol) prev_back = backCol;
			if(foreCol) prev_fore = foreCol;
			if(foreColD.endsWith(";1")) {
				prev_is_bright = true;
			} else {
				prev_is_bright = false;
			}
			
			// detect newlines
			xNl++;
			if(xNl >= cWidth) {
				xNl = 0;
				if(i != charField.length - 1) res += "\n";
			}
		}

		if(use_color) {
			res += "\x1b[0m"; // terminal reset
		}

		return res;
	}

	return this;
}

var base64table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encodeCharProt(array, encoding) {
	/*
		encodings:
			0: base64 - only 4 possible values
			1: number values
			2: hex values, values 0-255 only
	*/
	var arrayCom = array.slice(0);
	// convert array from writability-format to base64-format
	for(var c = 0; c < arrayCom.length; c++) {
		switch(arrayCom[c]) {
			case null: arrayCom[c] = 0; continue;
			case 0: arrayCom[c] = 1; continue;
			case 1: arrayCom[c] = 2; continue;
			case 2: arrayCom[c] = 3; continue;
		}
	}
	var str = "";
	if(!encoding) {
		str = "@";
		var bytes = Math.ceil(CONST.tileArea / 3);
		for(var i = 0; i < bytes; i++) {
			var idx = i * 3;
			var char1 = ((4*4)*arrayCom[idx + 0]);
			var char2 = ((4)*arrayCom[idx + 1]);
			var char3 = ((1)*arrayCom[idx + 2]);
			if(idx + 1 > CONST.tileArea - 1) char2 = 0;
			if(idx + 2 > CONST.tileArea - 1) char3 = 0;
			var code = char1 + char2 + char3;
			str += base64table.charAt(code);
		}
	} else if(encoding == 1) {
		str = "#" + arrayCom.join(",");
	} else if(encoding == 2) {
		str = "x";
		for(var i = 0; i < CONST.tileArea; i++) {
			var chr = arrayCom[i];
			str += chr.toString(16).padStart(2, 0).toUpperCase();
		}
	}
	return str;
}

function decodeCharProt(str) {
	var res = new Array(CONST.tileArea).fill(0);
	var encoding = str.charAt(0);
	str = str.substr(1);
	if(encoding == "@") {
		for(var i = 0; i < str.length; i++) {
			var code = base64table.indexOf(str.charAt(i));
			var char1 = Math.trunc(code / (4*4) % 4);
			var char2 = Math.trunc(code / (4) % 4);
			var char3 = Math.trunc(code / (1) % 4);
			res[i*3 + 0] = char1;
			if(i*3 + 1 > CONST.tileArea - 1) break;
			res[i*3 + 1] = char2;
			if(i*3 + 2 > CONST.tileArea - 1) break;
			res[i*3 + 2] = char3;
		}
	} else if(encoding == "#") {
		var temp = str.split(",");
		for(var i = 0; i < temp.length; i++) {
			res[i] = parseInt(temp[i], 10);
		}
	} else if(encoding == "x") {
		for(var i = 0; i < str.length / 2; i++) {
			var code = parseInt(str.charAt(i * 2) + str.charAt(i * 2 + 1), 16);
			res[i] = code;
		}
	}
	// convert from base64-format to writability-format
	for(var c = 0; c < res.length; c++) {
		switch(res[c]) {
			case 0: res[c] = null; continue;
			case 1: res[c] = 0; continue;
			case 2: res[c] = 1; continue;
			case 3: res[c] = 2; continue;
		}
	}
	return res;
}
/*
	Writability format (tiles and chars):
		null: The parent's writability
		0: public
		1: members
		2: owners
*/

/*
	This function splits a string accounting for surrogate-based characters like emojis
	and combining characters. This function also splits the string as-is and will make
	no corrections or perform any trimming.
*/
function advancedSplit(str, noSurrog, noComb) {
	var chars = [];
	var buffer = "";
	var surrogMode = false;
	var charMode = false;
	for(var i = 0; i < str.length; i++) {
		var char = str[i];
		var code = char.charCodeAt();
		if(code >= 0xD800 && code <= 0xDBFF) { // 1st surrogate
			if(surrogMode) {
				chars.push("?");
				buffer = "";
			}
			if(charMode) {
				chars.push(buffer);
			}
			surrogMode = true;
			charMode = false;
			buffer = char;
			continue;
		}
		if(code >= 0xDC00 && code <= 0xDFFF) { // 2nd surrogate
			if(surrogMode) {
				buffer += char;
				if(noSurrog) {
					buffer = "?";
				}
				charMode = true;
			} else {
				if(charMode) {
					chars.push(buffer);
				}
				chars.push("?");
				buffer = "";
				charMode = false;
			}
			surrogMode = false;
			continue;
		}
		if((code >= 0x0300 && code <= 0x036F) ||
		  (code >= 0x1DC0 && code <= 0x1DFF) ||
		  (code >= 0x20D0 && code <= 0x20FF) ||
		  (code >= 0xFE20 && code <= 0xFE2F)) { // combining character
			if(surrogMode) { // surrogate error
				chars.push("?");
				buffer = "";
				surrogMode = false;
			}
			if(!noComb) {
				buffer += char;
				charMode = true;
			}
			continue;
		} else { // non-special character
			if(surrogMode) { // surrogate error
				chars.push("?");
				surrogMode = false;
			}
			if(charMode) {
				chars.push(buffer);
			}
			charMode = true;
			buffer = char;
		}
	}
	if(buffer.length) {
		if(surrogMode) {
			chars.push("?");
		} else {
			chars.push(buffer);
		}
	}
	return chars;
}

function debugString(str) {
	var res = "";
	for(var i = 0; i < str.length; i++) {
		var p = str[i];
		var c = p.charCodeAt();
		if(i != 0) {
			res += ", ";
		}
		if(c < 32) {
			res += "x" + c.toString(16).padStart(2, 0);
		} else if(c > 255) {
			res += "x" + c.toString(16).padStart(4, 0);
		} else {
			res += "'" + p + "'";
		}
	}
	return res;
}

/*
	Filter a character to avoid string corruption
*/
function filterEdit(char) {
	if(!char || typeof char != "string") {
		char = " ";
	}
	var maxComb = 16;
	var charStart = false;
	var surrogOpen = false;
	var surrogClose = false;
	var combMode = false;
	var combCount = 0;
	var buffer = "";
	for(var i = 0; i < char.length; i++) {
		var p = char[i];
		var c = p.charCodeAt();
		if(c == 0) {
			if(charStart) {
				return buffer;
			} else {
				return " ";
			}
		}
		if(c >= 0xD800 && c <= 0xDBFF) {
			if(charStart || combMode) {
				return buffer;
			}
			if(surrogOpen || surrogClose) return "?";
			surrogOpen = true;
			buffer += p;
			continue;
		} else if(c >= 0xDC00 && c <= 0xDFFF) {
			if(charStart || combMode) {
				return buffer;
			}
			if(!surrogOpen || surrogClose) return "?";
			surrogClose = true;
			charStart = true;
			buffer += p;
			continue;
		}
		if(surrogOpen && !surrogClose) return "?";
		if(!surrogOpen && surrogClose) return "?";
		if((c >= 0x0300 && c <= 0x036F) ||
					(c >= 0x1DC0 && c <= 0x1DFF) ||
					(c >= 0x20D0 && c <= 0x20FF) ||
					(c >= 0xFE20 && c <= 0xFE2F)) {
			if(combCount >= maxComb) return buffer;
			if(!charStart) {
				buffer += " ";
				charStart = true;
			}
			if(!combMode) {
				combMode = true;
			}
			buffer += p;
			combCount++;
		} else {
			if(charStart) {
				return buffer;
			} else {
				charStart = true;
				buffer += p;
			}
		}
	}
	if(surrogOpen && !surrogClose) return "?";
	if(!surrogOpen && surrogClose) return "?";
	return buffer;
}

function change_char_in_array(arr, char, index) {
	if(!char) return false;
	if(char.includes("\0")) return false;
	char = filterEdit(char);
	if(arr[index] == char) return false;
	arr[index] = char;
	return true;
}

function html_tag_esc(str, non_breaking_space, newline_br) {
	str += "";
	str = str.replace(/\&/g, "&amp;");
	str = str.replace(/\</g, "&lt;");
	str = str.replace(/\>/g, "&gt;");
	str = str.replace(/\0/g, " ");
	if(newline_br) {
		str = str.replace(/\r\n/g, "<br>");
		str = str.replace(/\n/g, "<br>");
		str = str.replace(/\r/g, "<br>");
	} else {
		str = str.replace(/\r/g, " ");
		str = str.replace(/\n/g, " ");
	}
	str = str.replace(/\"/g, "&quot;");
	str = str.replace(/\'/g, "&#39;");
	str = str.replace(/\`/g, "&#96;");
	str = str.replace(/\//g, "&#x2F;");
	str = str.replace(/\\/g, "&#x5C;");
	str = str.replace(/\=/g, "&#61;");
	if(non_breaking_space) str = str.replace(/\u0020/g, "&nbsp;");
	if(str.indexOf(">") > -1 || str.indexOf("<") > -1) return "";
	return str;
}

function sanitize_color(col) {
	if(!col) col = 0;
	col = parseInt(col);
	if(!col) col = 0;
	if(col == -1) return -1; // skips the colors if -1
	col = Math.floor(col);
	if(col < 0) col = 0;
	if(col > 16777215) col = 16777215;
	return col;
}

function parseAcceptEncoding(str) {
	if(!str) return [];
	var res = [];
	str = str.split(",");
	for(var i = 0; i < str.length; i++) {
		var encoding = str[i];
		encoding = encoding.split(";")[0];
		encoding = encoding.trim();
		res.push(encoding);
	}
	return res;
}

function arrayIsEntirely(arr, elm) {
	for(var i = 0; i < arr.length; i++) {
		if(arr[i] != elm) return false;
	}
	return true;
}

// convert cached tile object into format client uses
function normalizeCacheTile(ctile) {
	var tile = {
		content: ctile.content.join(""),
		properties: {
			writability: ctile.writability
		}
	};
	if(!arrayIsEntirely(ctile.prop_color, 0)) {
		tile.properties.color = ctile.prop_color;
	}
	if(!arrayIsEntirely(ctile.prop_char, null)) {
		tile.properties.char = encodeCharProt(ctile.prop_char);
	}
	if(ctile.prop_bgcolor !== null) {
		tile.properties.bgcolor = ctile.prop_bgcolor;
	}
	if(Object.keys(ctile.prop_cell_props).length > 0) {
		tile.properties.cell_props = ctile.prop_cell_props;
	}
	return tile;
}

// example: checkURLParam("/accounts/configure/:world/", "/accounts/configure/test/") -> {world: "test"}
// checkURLParam("/accounts/configure/*world/", "/accounts/configure/Sub/World/") -> {world: "Sub/World"}
function checkURLParam(mask, url) {
	mask = trimSlash(mask).split("/");
	url = trimSlash(url).split("/");
	var values = {};
	for(var i = 0; i < mask.length; i++) {
		var maskv = mask[i];
		var urlv = url[i];
		if(maskv[0] == ":") {
			values[maskv.substr(1)] = urlv;
		} else if(maskv[0] == "*") {
			var rest = [];
			for(var x = i; x < url.length; x++) {
				rest.push(url[x]);
			}
			values[maskv.substr(1)] = rest.join("/");
			return values;
		} else {
			if(maskv != urlv) return {};
		}
	}
	if(mask.length != url.length) return {};
	return values;
}

module.exports = {
	trimHTML,
	create_date,
	san_nbr,
	san_dp,
	removeLastSlash,
	parseCookie,
	ar_str_trim,
	ar_str_decodeURI,
	http_time,
	encode_base64,
	decode_base64,
	process_error_arg,
	tile_coord,
	uptime,
	compareNoCase,
	resembles_int_number,
	TerminalMessage,
	encodeCharProt,
	decodeCharProt,
	advancedSplit,
	filterEdit,
	change_char_in_array,
	html_tag_esc,
	sanitize_color,
	parseAcceptEncoding,
	dump_dir,
	arrayIsEntirely,
	normalizeCacheTile,
	checkURLParam,
	trimSlash,
	checkDuplicateCookie
};