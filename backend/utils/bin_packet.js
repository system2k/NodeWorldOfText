function findByteDepthUnsigned(number) {
	if(!number) return 1;
	if(number < 256) return 1;
	if(number < 65536) return 2;
	if(number < 16777216) return 3;
	if(number < 4294967296) return 4;
	if(number < 1099511627776) return 5;
	if(number < 281474976710656) return 6;
	return 7;
}

function generateBytesInt(number) {
	var neg = (number < 0);
	if(neg) number = -(number + 1);
	var bitDepth = findByteDepthUnsigned(number);
	var res = new Uint8Array(bitDepth);
	var div = 1;
	for(var i = 0; i < bitDepth; i++) {
		res[i] = number / div % 256;
		div *= 256;
	}
	var len = bitDepth;
	if(neg) len = 17 - len;
	var ar = [len];
	for(var i = 0; i < bitDepth; i++) {
		ar.push(res[bitDepth - 1 - i]);
	}
	return ar;
}

function pushNumber(ar, number) {
	if(number == null) {
		ar.push(0);
		return;
	}
	var nums = generateBytesInt(number);
	for(var i = 0; i < nums.length; i++) {
		ar.push(nums[i]);
	}
}

function stringToUTF8(str) {
	var array = [];
	for(var i = 0; i < str.length; i++) {
		var u = str.charCodeAt(i);
		if(u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(i++) & 1023;
		if(u <= 127) {
			array.push(u);
		} else if(u <= 2047) {
			array.push(192 | u >> 6, 128 | u & 63);
		} else if(u <= 65535) {
			array.push(224 | u >> 12, 128 | u >> 6 & 63, 128 | u & 63);
		} else if(u <= 2097151) {
			array.push(240 | u >> 18, 128 | u >> 12 & 63, 128 | u >> 6 & 63, 128 | u & 63);
		} else if(u <= 67108863) {
			array.push(248 | u >> 24, 128 | u >> 18 & 63, 128 | u >> 12 & 63, 128 | u >> 6 & 63, 128 | u & 63);
		} else {
			array.push(252 | u >> 30, 128 | u >> 24 & 63, 128 | u >> 18 & 63, 128 | u >> 12 & 63, 128 | u >> 6 & 63, 128 | u & 63);
		}
	}
	return array;
}

function pushString(ar, string) {
	if(!string) ar.push(0); // blank string
	var is8bitChars = true;
	var count16bit = 0;
	for(var i = 0; i < string.length; i++) {
		if(string.charCodeAt(i) > 255) {
			is8bitChars = false;
			count16bit++;
		}
	}
	if(is8bitChars) { // 0-255 string
		if(string.length == 1) {
			ar.push(1, string.charCodeAt(0)); // single 8 bit char
		} else {
			ar.push(2); // 8 bit chars, null terminated string
			for(var i = 0; i < string.length; i++) {
				ar.push(string.charCodeAt(i));
			}
			ar.push(0); // null termination
		}
	} else { // utf8 string
		if(string.length == 1) { // 16 bit char
			var code = string.charCodeAt(0);
			ar.push(3, Math.floor(code / 256) % 256, code % 256); // single 16 bit char
		} else if(string.length == count16bit) { // 16 bit chars, null terminated string
			ar.push(4);
			for(var i = 0; i < string.length; i++) {
				var code = string.charCodeAt(i);
				ar.push(Math.floor(code / 256) % 256, code % 256);
			}
			ar.push(0); // null termination
		} else { // utf8 null terminated string
			ar.push(5);
			var data = stringToUTF8(string);
			for(var i = 0; i < data.length; i++) {
				ar.push(data[i]);
			}
			ar.push(0); // null termination
		}
	}
}

function encode(data) {
	var type = data.kind;
	var bin = [0x01];
	if(type == "write") {
		/*
			0x00, tileY, tileX, charY, charX, date, char, id, color, animation
			{
				edits: [[4, 1, 7, 15, 1561152433382, "A", 177, 65280, [
					"PWD", 500, true, [
						["ddd" (128), [123, 123, 123] (128)],
						["fff" (128), [456, 456, 456] (128)]
					]
				]],
				public_only: true,
				preserve_links: true,
				bypass: "abc123"
			}
		*/
		/*
			1   edits
			2   public_only
			3   preserve_links
			4   bypass
		*/
		bin.push("w".charCodeAt());
		var edits = data.edits;
		bin.push(0x01); // edits
		pushNumber(bin, edits.length);
		for(var i = 0; i < edits.length; i++) {
			var dataLen = 6;
			if(color) dataLen++;
			if(animation) {
				dataLen++;
				if(!color) dataLen++; // padding
			}
			bin.push(dataLen);
			var edit = edits[i];
			var tileY = edit[0];
			var tileX = edit[1];
			var charY = edit[2];
			var charX = edit[3];
			var time = edit[4];
			var char = edit[5];
			var id = edit[6];
			var color = edit[7];
			var animation = edit[8];
			pushNumber(bin, tileY);
			pushNumber(bin, tileX);
			pushNumber(bin, charY);
			pushNumber(bin, charX);
			pushNumber(bin, time);
			pushString(bin, char);
			pushNumber(bin, id);
			if(color) pushNumber(bin, color);
			if(animation) {
				if(!color) pushNumber(bin, 0); // padding
				var pwd = animation[0];
				var intv = animation[1];
				var rept = animation[2];
				var frames = animation[3];
				pushString(bin, pwd);
				pushNumber(bin, intv);
				pushNumber(bin, rept + 0);
				pushNumber(bin, frames.length);
				for(var f = 0; f < frames.length; f++) {
					var frame = frames[f];
					var str = frame[0];
					var col = frame[1];
					pushString(bin, str);
					pushNumber(bin, col.length);
					for(var c = 0; c < col.length; c++) {
						pushNumber(bin, col[c]);
					}
				}
			}
		}
		if(data.public_only) {
			bin.push(2);
		}
		if(data.preserve_links) {
			bin.push(3);
		}
		if(data.bypass) {
			bin.push(4);
			pushString(bin, data.bypass);
		}
	}
	if(type == "fetch") {
		bin.push("f".charCodeAt());
		/*
			{
				"kind":"fetch",
				"fetchRectangles": [
					{"minX":-12,"minY":-1,"maxX":-9,"maxY":6},
					{"minX":-8,"minY":4,"maxX":2,"maxY":6}
				],
				utf16: true,
				array: true,
				content_only: true,
				concat: true
			}	
		*/
		/*
			1   fetchRectangles
			2   utf16
			3   array
			4   content_only
			5   concat
		*/
		bin.push(0x01);
		pushNumber(bin, data.fetchRectangles.length);
		for(var i = 0; i < data.fetchRectangles.length; i++) {
			var range = data.fetchRectangles[i];
			pushNumber(bin, range.minX);
			pushNumber(bin, range.minY);
			pushNumber(bin, range.maxX);
			pushNumber(bin, range.maxY);
		}
		if(data.utf16) {
			bin.push(2);
		}
		if(data.array) {
			bin.push(3);
		}
		if(data.content_only) {
			bin.push(4);
		}
		if(data.concat) {
			bin.push(5);
		}
	}
	if(type == "link") {
		/*
			{
				"kind":"link",
				"data":{
					"tileY":4,"tileX":-7,"charY":1,"charX":15,"url":""
				},
				"type":"url"
			}
			{
				"kind":"link",
				"data":{
					"tileY":4,"tileX":-9,"charY":1,"charX":12,"link_tileX":123,"link_tileY":456
				},
				"type":"coord"
			}		
		*/
		/*
			1   coordinates (tileY, tileX, charY, charX)
			2   type (url: 1, coord: 2)
			3   params (url: (url), coord: (link_tileX, link_tileY))
		*/
		bin.push("l".charCodeAt());
		bin.push(0x01);
		pushNumber(bin, data.data.tileY);
		pushNumber(bin, data.data.tileX);
		pushNumber(bin, data.data.charY);
		pushNumber(bin, data.data.charX);
		bin.push(0x02);
		if(data.type == "url") {
			bin.push(0x01);
			bin.push(0x03); // params
			pushString(bin, data.data.url);
		} else if(data.type == "coord") {
			bin.push(0x02);
			bin.push(0x03); // params
			pushNumber(bin, data.data.link_tileX);
			pushNumber(bin, data.data.link_tileY);
		}
	}
	if(type == "protect") {
		/*
			{"kind":"protect","data":{"tileY":5,"tileX":-6,"type":"owner-only"},"action":"protect"}
			{"kind":"protect","data":{"tileY":5,"tileX":-6,"type":"member-only"},"action":"protect"}
			{"kind":"protect","data":{"tileY":5,"tileX":-6,"type":"owner-only","precise":true,"charX":0,"charY":1},"action":"protect"}
			{"kind":"protect","data":{"tileY":5,"tileX":-6,"type":"member-only","precise":true,"charX":0,"charY":1},"action":"protect"}
			{"kind":"protect","data":{"tileY":5,"tileX":-6},"action":"unprotect"}
			{"kind":"protect","data":{"tileY":5,"tileX":-6,"precise":true,"charX":3,"charY":4},"action":"unprotect"}
			{"kind":"protect","data":{"tileY":5,"tileX":-6,"type":"public","precise":true,"charX":7,"charY":0},"action":"protect"}
			{"kind":"protect","data":{"tileY":5,"tileX":-6,"type":"public"},"action":"protect"}
		*/
		/*
			1   coords (tileY, tileX)
			2   action (unprotect: 1, public: 2, member-only: 3, owner-only: 4)
			3   precise with coordinates (charY, charX)
		*/
		bin.push("p".charCodeAt());
		bin.push(0x01);
		pushNumber(bin, data.data.tileY);
		pushNumber(bin, data.data.tileX);
		bin.push(0x02);
		if(data.data.action == "unprotect") {
			bin.push(0x01);
		} else {
			if(data.data.type == "public") {
				bin.push(0x02);
			} else if(data.data.type == "member-only") {
				bin.push(0x03);
			} else if(data.data.type == "owner-only") {
				bin.push(0x04);
			}
		}
		if(data.data.precise) {
			bin.push(0x03); // precise switch
			pushNumber(bin, data.data.charY);
			pushNumber(bin, data.data.charX);
		}
	}
	if(type == "chat") {
		/*
			{
				kind: "chat",
				nickname: nick,
				message: message,
				location: location,
				color: chatColor
			}
			{"kind":"chat","nickname":"root","message":"test","location":"page","color":"#ff0000"}
			{"kind":"chat","nickname":"root","message":"123","location":"global","color":"#ff0000"}
		*/
		/*
			1   nickname
			2   message
			3   location (1: page, 2: global)
			4   color
		*/
		bin.push("c".charCodeAt());
		bin.push(0x01);
		pushString(bin, data.nickname);
		bin.push(0x02);
		pushString(bin, data.message);
		bin.push(0x03);
		if(data.location == "page") {
			bin.push(0x01);
		} if(data.location == "global") {
			bin.push(0x02);
		}
		bin.push(0x04);
		pushString(bin, data.color);
	}
	return JSON.stringify(bin);
}

/*encode({
	"kind": "write",
	"edits": [
		[-1,0,2,2,1561251059010,"t",1,16711680],
		[-1,0,2,3,1561251059054,"e",2,16711680],
		[-1,0,2,4,1561251059114,"s",3,16711680],
		[-1,0,2,5,1561251059144,"t",4,16711680, ["PWD03859136", 500, true, [
			["abcdefg", [123, 123, 123, 123, 123, 123, 123]],
			["fdsajkl", [321, 321, 321, 321, 321, 321, 321]]
		]]]
	],
	public_only: true,
	preserve_links: true,
	bypass: "abc123"
});*/

/*encode({
	"kind":"fetch",
	"fetchRectangles": [
		{"minX":-12,"minY":-1,"maxX":-9,"maxY":6},
		{"minX":-8,"minY":4,"maxX":2,"maxY":6}
	],
	utf16: true,
	array: true,
	content_only: true,
	concat: true
});*/

function encode_response(data) {
	var type = data.kind;
	if(type == "fetch") {
		
	}
}

function decode(data) {

}
/*

write - 'w'
fetch - 'f'
link - 'l'
paste - 'P'
protect - 'p'
chat - 'c'
chathistory - 'h'
cmd - 'C'
cmd_opt - 'o'
ping - 'v'

clear_tile - 'x'
debug - 'D'
set_tile - 'S'

--------------------

0x01 = to server, 0x02 = from server
type [wflPpchCoxDS]
... packet specific data at this point ...


-----------------------

server responses:

ping - 'v'
error - 'E'
chat - 'c'
chathistory - 'h'
cmd_opt - 'D'
cmd - 'd'
fetch - 'f'
tileUpdate - 'U'
write - 'w'
colors - 'C'
channel - 'H'
user_count - 'u'
tile_clear - 'x'
announcement - 'a'

*/

module.exports = {
	encode,
	decode
};