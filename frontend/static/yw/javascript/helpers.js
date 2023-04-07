if(!window.WebSocket && window.MozWebSocket) {
	window.WebSocket = window.MozWebSocket;
}

function assert(exp, optMsg) {
	if(!exp) {
		throw new Error(optMsg || "Assertion failed");
	}
}

function intmax(ints) {
	if(typeof ints == "number") ints = [ints];
	for(var i = 0; i < ints.length; i++)
		if(ints[i] > Number.MAX_SAFE_INTEGER || ints[i] < Number.MIN_SAFE_INTEGER) return false;
	return true;
}

function clipIntMax(x) {
	if(x < Number.MIN_SAFE_INTEGER) x = Number.MIN_SAFE_INTEGER;
	if(x > Number.MAX_SAFE_INTEGER) x = Number.MAX_SAFE_INTEGER;
	return x;
}

function closest(element, parElement) {
	var currentElm = element;
	while(currentElm) {
		if(currentElm == parElement) return true;
		currentElm = currentElm.parentNode;
	}
	return false;
}

function lineGen(x0, y0, x1, y1, max) {
	if(!max) max = 2000;
	var list = [];
	var x0 = Math.floor(x0);
	var y0 = Math.floor(y0);
	var x1 = Math.floor(x1);
	var y1 = Math.floor(y1);
	var dx = Math.abs(x1 - x0);
	var dy = Math.abs(y1 - y0);
	var sx = (x0 < x1) ? 1 : -1;
	var sy = (y0 < y1) ? 1 : -1;
	var err = dx - dy;
	for(var i = 0; i < max; i++) {
		list.push([x0, y0]);
		if((x0 == x1) && (y0 == y1)) break;
		var e2 = 2 * err;
		if(e2 > -dy) {
			err -= dy;
			x0 += sx;
		}
		if(e2 < dx) {
			err += dx;
			y0 += sy;
		}
	}
	return list;
}

function orderRangeABCoords(coordA, coordB) {
	var tmp;
	if(coordA[0] > coordB[0]) {
		// swap X coords
		tmp = coordA[0];
		coordA[0] = coordB[0];
		coordB[0] = tmp;
		tmp = coordA[2];
		coordA[2] = coordB[2];
		coordB[2] = tmp;
	} else if(coordA[0] == coordB[0] && coordA[2] > coordB[2]) {
		// swap X char coords
		tmp = coordA[2];
		coordA[2] = coordB[2];
		coordB[2] = tmp;
	}
	if(coordA[1] > coordB[1]) {
		// swap Y coords
		tmp = coordA[1];
		coordA[1] = coordB[1];
		coordB[1] = tmp;
		tmp = coordA[3];
		coordA[3] = coordB[3];
		coordB[3] = tmp;
	} else if(coordA[1] == coordB[1] && coordA[3] > coordB[3]) {
		// swap Y char coords
		tmp = coordA[3];
		coordA[3] = coordB[3];
		coordB[3] = tmp;
	}
}

function ajaxRequest(settings) {
	var req = new XMLHttpRequest();

	var formData = "";
	var ampAppend = false;
	if(settings.data) {
		for(var i in settings.data) {
			if(ampAppend) formData += "&";
			ampAppend = true;
			formData += encodeURIComponent(i) + "=" + encodeURIComponent(settings.data[i]);
		}
	}
	// append form data to url if this is a GET
	if(settings.type == "GET" && formData) {
		settings.url += "?" + formData;
	}
	var async = !!settings.async;
	req.open(settings.type, settings.url, !async);
	req.onload = function() {
		if(req.status >= 200 && req.status < 400) {
			if(settings.done) {
				settings.done(req.responseText, req);
			}
		} else {
			if(settings.error) {
				settings.error(req);
			}
		}
	}
	req.onerror = function() {
		if(settings.error) {
			settings.error(req);
		}
	}
	if(settings.type == "POST") {
		if(formData) req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		req.send(formData);
	} else {
		req.send();
	}
}

function removeAlpha(data) {
	var res = [];
	var len = data.length / 4;
	for(var i = 0; i < len; i++) {
		var indx = i * 4;
		res.push(data[indx + 0]);
		res.push(data[indx + 1]);
		res.push(data[indx + 2]);
	}
	return res;
}

function getRange(x1, y1, x2, y2) {
	var tmp;
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

	assert(intmax([x1, y1, x2, y2]), "Invalid ranges");

	var coords = [];
	for(var y = y1; y <= y2; y++) {
		for(var x = x1; x <= x2; x++) {
			coords.push([x, y]);
			if(coords.length >= 400000) throw "Potential memory leak";
		}
	}
	return coords;
}

var colors = ["#660066", "#003366", "#ff9900", "#ff0066", "#003300", "#ff0000", "#3a3a3a", "#006666", "#3399ff", "#3333ff", "#000000"];
function assignColor(username) {
	username = username.toUpperCase();
	var colLen = colors.length;
	var usrLen = username.length;
	var avg = 0;
	for(var i = 0; i < usrLen; i++) {
		var chr = username.charCodeAt(i);
		avg += (chr * chr | (i * chr) % 628) * (i << chr) + (chr*(i + 19 + (chr % 56))*chr);
	}
	return colors[(Math.abs(avg | 0)) % colLen];
}

function spaceTrim(str_array, left, right, gaps, secondary_array) {
	// secondary_array is an optional argument where elements are trimmed in parallel with str_array
	var marginLeft = 0;
	var marginRight = 0;
	var countL = left;
	var countR = right;
	var whitespaces = "\u0009\u000a\u000b\u000d\u0020\u0085\u00a0";
	for(var i = 0; i < str_array.length; i++) {
		var idxL = i;
		var idxR = str_array.length - 1 - i;
		if(whitespaces.indexOf(str_array[idxL]) > -1 && countL) {
			marginLeft++;
		} else {
			countL = false;
		}
		if(whitespaces.indexOf(str_array[idxR]) > -1 && countR) {
			marginRight++;
		} else {
			countR = false;
		}
		if(!countL && !countR) break;
	}
	if(marginLeft) {
		str_array.splice(0, marginLeft);
		spliceArray(secondary_array, 0, marginLeft);
	}
	if(marginRight) {
		str_array.splice(str_array.length - marginRight);
		spliceArray(secondary_array, secondary_array.length - marginRight);
	}
	if(gaps) {
		var spaceFreq = 0;
		for(var i = 0; i < str_array.length; i++) {
			var chr = str_array[i];
			if(whitespaces.indexOf(chr) > -1) {
				spaceFreq++;
			} else {
				spaceFreq = 0;
			}
			if(spaceFreq > 1) {
				str_array.splice(i, 1);
				spliceArray(secondary_array, i, 1);
				i--;
			}
		}
	}
	return str_array;
}

function spliceArray(array, A, B) {
	if(!array) return;
	if(Array.isArray(array)) {
		// list of arrays
		for(var i = 0; i < array.length; i++) {
			if(!array[i]) continue;
			array[i].splice(A, B);
		}
	} else {
		array.splice(A, B);
	}
}

function byId(a) {
	return document.getElementById(a);
}

function getDate() {
	return Date.now();
}

var keydownTable = {};
function keydownTableDown(e) {
	var key = e.key;
	if(!key) return;
	keydownTable[key] = 1;
}
function keydownTableUp(e) {
	var key = e.key;
	if(!key) return;
	if(keydownTable[key]) {
		delete keydownTable[key];
	}
}
document.addEventListener("keydown", keydownTableDown);
document.addEventListener("keyup", keydownTableUp);

// Element references
var elm = {};
function defineElements(list) {
	for(var el in list) {
		elm[el] = list[el];
	}
}

var keyCodeTbl = {
	"BACKSPACE":8, "TAB":9, "ENTER":13, "SHIFTRIGHT":16, "CONTROLLEFT":17, "CAPSLOCK":20, "ESCAPE":27, 
	"SPACE":32, "PAGEUP":33, "PAGEDOWN":34, "END":35, "HOME":36, "ARROWLEFT":37, "ARROWUP":38, "ARROWRIGHT":39, 
	"ARROWDOWN":40, "DELETE":46, "DIGIT0":48, "DIGIT1":49, "DIGIT2":50, "DIGIT3":51, "DIGIT4":52, "DIGIT5":53, 
	"DIGIT6":54, "DIGIT7":55, "DIGIT8":56, "DIGIT9":57, "KEYA":65, "KEYB":66, "KEYC":67, "KEYD":68, "KEYE":69, 
	"KEYF":70, "KEYG":71, "KEYH":72, "KEYI":73, "KEYJ":74, "KEYK":75, "KEYL":76, "KEYM":77, "KEYN":78, "KEYO":79, 
	"KEYP":80, "KEYQ":81, "KEYR":82, "KEYS":83, "KEYT":84, "KEYU":85, "KEYV":86, "KEYW":87, "KEYX":88, "KEYY":89, 
	"KEYZ":90, "CONTEXTMENU":93, "NUMPAD0":96, "NUMPAD1":97, "NUMPAD2":98, "NUMPAD3":99, "NUMPAD4":100, 
	"NUMPAD5":101, "NUMPAD6":102, "NUMPAD7":103, "NUMPAD8":104, "NUMPAD9":105, "NUMPADMULTIPLY":106, 
	"NUMPADADD":107, "NUMPADSUBTRACT":109, "NUMPADDECIMAL":110, "NUMPADDIVIDE":111, "F1":112, "F2":113, 
	"F3":114, "F4":115, "F5":116, "F6":117, "F7":118, "F8":119, "F9":120, "F10":121, "F11":122, "F12":123,
	"SEMICOLON":186, "COMMA":188, "MINUS":189, "PERIOD":190, "SLASH":191, "BACKQUOTE":192, "BRACKETLEFT":219,
	"BACKSLASH":220, "BRACKETRIGHT":221, "QUOTE":222
};

function getKeyCode(e) {
	if(e.keyCode != void 0) return e.keyCode;
	if(e.which != void 0) return e.which;
	if(e.code != void 0) return keyCodeTbl[e.code.toUpperCase()];
	return 0;
}

function escapeQuote(text) { // escapes " and ' and \
	return text.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"").replace(/\'/g, "\\'");
}

function escapeURLQuote(url) {
	try {
		var decode = decodeURIComponent(url);
	} catch(e) {
		return "";
	}
	return encodeURIComponent(escapeQuote(decode));
}

function getPos(ref) {
	ref = ref.split(",");
	return [parseInt(ref[0]), parseInt(ref[1])];
}

function getPoolDimensions(tileWidth, tileHeight) {
	var sizeX = Math.floor(1024 / tileWidth);
	var sizeY = Math.floor(1024 / tileHeight);
	if(sizeX < 1) sizeX = 1;
	if(sizeY < 1) sizeY = 1;
	return [sizeX, sizeY];
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

function isHexString(str) {
	if(!str.length) return false;
	for(var i = 0; i < str.length; i++) {
		var chr = str[i];
		var isHex = ("a" <= chr && chr <= "f") || ("A" <= chr && chr <= "F") || ("0" <= chr && chr <= "9");
		if(!isHex) return false;
	}
	return true;
}

function convertToDate(epoch) {
	var months = [
		"January", "February", "March",
		"April", "May", "June",
		"July", "August", "September",
		"October", "November", "December"
	];
	var str = "";
	var date = new Date(epoch);
	var month = date.getMonth();
	var day = date.getDate();
	var year = date.getFullYear();
	var hour = date.getHours();
	var minute = date.getMinutes();
	str += year + " " + months[month] + " " + day + " ";
	var per = "AM";
	if(hour >= 12) {
		per = "PM";
	}
	if(hour > 12) {
		hour = hour - 12;
	}
	if(hour == 0) {
		hour = 12;
	}
	str += hour + ":" + ("0" + minute).slice(-2) + " " + per;
	return str;
}

function int_to_rgb(value) {
	var r = (value >> 16) & 255;
	var g = (value >> 8) & 255;
	var b = value & 255;
	return [r, g, b];
}

function int_to_hexcode(value) {
	return "#" + value.toString(16).padStart(6, 0);
}

function rgb_to_int(r, g, b) {
	return b | g << 8 | r << 16;
}

function easeOutQuad(h, f, j, i) {
	return -j * (h /= i) * (h - 2) + f;
}

if(!Math.trunc) {
	Math.trunc = function(v) {
		v = +v;
		return (v - v % 1) || (!isFinite(v) || v === 0 ? v : v < 0 ? -0 : 0);
	}
}

if(!Object.assign) {
	Object.assign = function(target, vars) {
		for(var i in vars) {
			target[i] = vars[i];
		}
		return target;
	}
}

if(!Array.prototype.fill) {
	Array.prototype.fill = function(val) {
		var ar = this;
		for(var i = 0; i < ar.length; i++) {
			ar[i] = val;
		}
		return ar;
	}
}

if(!String.prototype.startsWith) {
	String.prototype.startsWith = function(search, pos) {
		return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) == search;
	}
}

if(!String.prototype.codePointAt) {
	String.prototype.codePointAt = function() {
		return this[0].charCodeAt();
	}
}

if(!String.prototype.repeat) {
	String.prototype.repeat = function(count) {
		if(count < 0) throw "Range error";
		var res = "";
		for(var i = 0; i < count; i++) {
			res += this;
		}
		return res;
	}
}

if(!String.prototype.padStart) {
	String.prototype.padStart = function(count, fillStr) {
		fillStr += "";
		return (fillStr.repeat(count) + this).slice(-count);
	}
}

if(!Math.log2) {
	Math.log2 = function(x) {
		return Math.log(x) * Math.LOG2E;
	}
}

function CircularBuffer(maxLen) {
	this.len = maxLen;
	this.buffer = [];
	this.pos = 0;
	this.elms = 0;
	return this;
}

CircularBuffer.prototype.push = function(data) {
	if(data === undefined) throw "Element cannot be undefined";
	if(this.pos >= this.buffer.length) {
		this.buffer.push(data);
		this.elms++;
		this.pos++;
		if(this.pos >= this.len) this.pos = 0;
		return;
	}
	this.buffer[this.pos] = data;
	this.elms++;
	if(this.elms > this.len) this.elms = this.len;
	this.pos++;
	if(this.pos >= this.len) this.pos = 0;
}

CircularBuffer.prototype.pop = function() {
	if(!this.buffer.length) return;
	if(!this.elms) return;
	this.pos--;
	if(this.pos < 0) this.pos = this.len - 1;
	var res = this.buffer[this.pos];
	this.elms--;
	return res;
}

CircularBuffer.prototype.unpop = function() {
	if(!this.buffer.length) return;
	if(this.elms >= this.buffer.length) return;
	var res = this.buffer[this.pos];
	if(res === undefined) return;
	this.pos++;
	if(this.pos >= this.len) this.pos = 0;
	this.elms++;
	return res;
}

CircularBuffer.prototype.trim = function() {
	var tmpPos = this.pos;
	for(var i = this.elms; i < this.buffer.length; i++) {
		if(tmpPos >= this.buffer.length) tmpPos = 0;
		if(this.buffer[tmpPos] === undefined) return;
		this.buffer[tmpPos] = undefined;
		tmpPos++;
	}
}

CircularBuffer.prototype.unwind = function() {
	var res = [];
	var tmpPos = this.pos - this.elms;
	if(tmpPos < 0) tmpPos += this.buffer.length;
	for(var i = 0; i < this.elms; i++) {
		if(tmpPos >= this.buffer.length) tmpPos = 0;
		var elm = this.buffer[tmpPos];
		if(elm === undefined) break;
		res.push(elm);
		tmpPos++;
	}
	return res;
}

CircularBuffer.prototype.top = function() {
	if(!this.buffer.length) return;
	if(!this.elms) return;
	var tmpPos = this.pos - 1;
	if(tmpPos < 0) tmpPos = this.len - 1;
	return this.buffer[tmpPos];
}

function getBasicHostname(host) {
	var host = host.toLowerCase().split(".");
	if(host[0] == "www") host.shift();
	return host.join(".");
}

function isSafeHostname(host) {
	return safeLinkHosts.includes(host);
}

var safeLinkHosts = [
	getBasicHostname(window.location.host),
	"yourworldoftext.com",
	"ourworldofpixels.com",
	"ourworldoftext.com",
	"dir.ourworldoftext.com",
	"testserver1.ourworldoftext.com",
	"spooks.me",
	"youtube.com",
	"discord.com",
	"discord.gg",
	"discordapp.com",
	"reddit.com",
	"old.reddit.com"
];

// compatibility (deprecated)
var blankColor = new Array(128).fill(0);

if(state.worldModel.nsfw) {
	var check = localStorage.getItem("nsfw_yes");
	if(check) {
		check = JSON.parse(check);
		if(!check[state.worldModel.name.toUpperCase()]) {
			window.location.pathname = "/accounts/nsfw/" + state.worldModel.name;
		}
	} else {
		window.location.pathname = "/accounts/nsfw/" + state.worldModel.name;
	}
}

function ReconnectingWebSocket(url) {
	this.binaryType = "blob";
	this.onopen = null;
	this.onclose = null;
	this.onmessage = null;
	this.onerror = null;
	this.reconnectTimeout = 1000;
	var closed = false;
	var self = this;
	function connect() {
		self.socket = new WebSocket(url);
		self.socket.onclose = function(r) {
			if(self.onclose) self.onclose(r);
			if(closed) return;
			setTimeout(connect, self.reconnectTimeout);
		}
		self.socket.onopen = function(e) {
			self.socket.binaryType = self.binaryType;
			if(self.onopen) self.onopen(e);
		}
		self.socket.onmessage = function(m) {
			if(self.onmessage) self.onmessage(m);
		}
		self.socket.onerror = function(m) {
			if(self.onerror) self.onerror(m);
		}
	}
	connect();
	this.send = function(data) {
		this.socket.send(data);
	}
	this.close = function() {
		closed = true;
		this.socket.close();
	}
	this.refresh = function() {
		this.socket.close();
	}
	return this;
}

// split a mixed string with surrogates and combining characters
function advancedSplit(str, noSurrog, noComb, norm) {
	if(str && str.constructor == Array) return str.slice(0);
	var chars = [];
	var buffer = "";
	var surrogMode = false;
	var charMode = false;
	var combCount = 0;
	var combLimit = 15;
	for(var i = 0; i < str.length; i++) {
		var char = str[i];
		var code = char.charCodeAt();
		if(code >= 0xDC00 && code <= 0xDFFF) {
			if(surrogMode) {
				buffer += char;
			} else {
				buffer = "";
				chars.push("?");
			}
			surrogMode = false;
			combCount = 0;
			continue;
		} else if(surrogMode) {
			buffer = "";
			chars.push("?");
			surrogMode = false;
			continue;
		}
		if(!noSurrog && code >= 0xD800 && code <= 0xDBFF) {
			if(charMode) {
				chars.push(buffer);
			}
			charMode = true;
			surrogMode = true;
			buffer = char;
			continue;
		}
		if(!norm && ((code >= 0x0300 && code <= 0x036F) ||
		  (code >= 0x1DC0 && code <= 0x1DFF) ||
		  (code >= 0x20D0 && code <= 0x20FF) ||
		  (code >= 0xFE20 && code <= 0xFE2F))) {
			if(!noComb && charMode && combCount < combLimit) {
				buffer += char;
				combCount++;
			}
			continue;
		} else {
			if(charMode) {
				chars.push(buffer);
			}
			combCount = 0;
			charMode = true;
			buffer = char;
		}
	}
	if(buffer) {
		chars.push(buffer);
	}
	return chars;
}

function filterAdvancedChars(array, noSurrogates, noCombining) {
	if(!noSurrogates && !noCombining) {
		return array;
	}
	for(var i = 0; i < array.length; i++) {
		var char = array[i];
		var combSize = 0;
		for(var x = 0; x < char.length; x++) {
			var subchar = char[char.length - 1 - x];
			var scode = subchar.charCodeAt();
			if(((scode >= 0x0300 && scode <= 0x036F) ||
			  (scode >= 0x1DC0 && scode <= 0x1DFF) ||
			  (scode >= 0x20D0 && scode <= 0x20FF) ||
			  (scode >= 0xFE20 && scode <= 0xFE2F))) {
				combSize++;
			} else {
				break;
			}
		}
		var baseChar = char.slice(0, char.length - combSize);
		var combChar = char.slice(char.length - combSize, char.length);
		if(noSurrogates && baseChar.length > 1) {
			baseChar = "?";
		}
		if(noCombining) {
			combChar = "";
		}
		array[i] = baseChar + combChar;
	}
	return array;
}

if(!HTMLElement.prototype.append) {
	HTMLElement.prototype.append = function(string) {
		this.appendChild(document.createTextNode(string));
	}
}

var w = {
	loadScript: function(url, callback) {
		var script = document.createElement("script");
		if(callback === true) {
			// synchronous
			ajaxRequest({
				type: "GET",
				url: url,
				async: true,
				done: function(e) {
					script.innerText = e;
					document.head.appendChild(script);
				}
			});
		} else {
			script.src = url;
			document.head.appendChild(script);
			script.onload = callback;
		}
	},
	clipboard: {
		textarea: null,
		init: function() {
			var area = document.createElement("textarea");
			area.value = "";
			area.id = "textCopy";
			area.style.width = "1px";
			area.style.height = "1px";
			area.style.position = "absolute";
			area.style.left = "-1000px";
			area.style.top = "-1000px";
			document.body.appendChild(area);
			w.clipboard.textarea = area;
		},
		copy: function(string) {
			w.clipboard.textarea.value = string;
			w.clipboard.textarea.select();
			document.execCommand("copy");
			w.clipboard.textarea.value = "";
		}
	},
	events: {},
	on: function(type, call) {
		if(typeof call != "function") {
			throw "Callback is not a function";
		}
		type = type.toLowerCase();
		if(!OWOT.events[type]) {
			OWOT.events[type] = [];
		}
		OWOT.events[type].push(call);
	},
	off: function(type, call) {
		type = type.toLowerCase();
		if(!OWOT.events[type]) return;
		while(true) {
			var idx = OWOT.events[type].indexOf(call);
			if(idx == -1) break;
			OWOT.events[type].splice(idx, 1);
		}
	},
	emit: function(type, data) {
		type = type.toLowerCase();
		var evt = OWOT.events[type];
		if(!evt) return;
		for(var e = 0; e < evt.length; e++) {
			var func = evt[e];
			func(data);
		}
	},
	listening: function(type) {
		type = type.toLowerCase();
		return !!OWOT.events[type];
	},
	split: advancedSplit
};

var OWOT = w;
w.clipboard.init();
