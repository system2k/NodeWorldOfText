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

var V2_MAGIC_0 = 0x4F; // O
var V2_MAGIC_1 = 0x57; // W
var V2_MAGIC_2 = 0x32; // 2
var V2_VERSION = 2;
var V2_HELLO = 1;
var V2_PING = 2;
var V2_WRITE = 3;
var V2_FETCH = 4;
var V2_WRITE_RESPONSE = 0x83;
var V2_SCRATCH_SIZE = 1024 * 64;
var v2Scratch = Buffer.allocUnsafe(V2_SCRATCH_SIZE);

function isV2Packet(data) {
	return data && data.length >= 5 &&
		data[0] == V2_MAGIC_0 && data[1] == V2_MAGIC_1 && data[2] == V2_MAGIC_2 &&
		data[3] == V2_VERSION;
}

function byteLengthString(str) {
	if(!str) return 0;
	return Buffer.byteLength(str);
}

function writeString(buf, offset, str) {
	if(!str) {
		buf.writeUInt16BE(0, offset);
		return offset + 2;
	}
	var len = Buffer.byteLength(str);
	if(len > 65535) len = 65535;
	buf.writeUInt16BE(len, offset);
	offset += 2;
	buf.write(str, offset, len);
	return offset + len;
}

function readString(buf, state) {
	if(state.offset + 2 > buf.length) return null;
	var len = buf.readUInt16BE(state.offset);
	state.offset += 2;
	if(state.offset + len > buf.length) return null;
	var str = buf.toString("utf8", state.offset, state.offset + len);
	state.offset += len;
	return str;
}

function allocV2Packet(type, bodySize) {
	var packetSize = 5 + bodySize;
	var buf = packetSize <= V2_SCRATCH_SIZE ? v2Scratch : Buffer.allocUnsafe(packetSize);
	buf[0] = V2_MAGIC_0;
	buf[1] = V2_MAGIC_1;
	buf[2] = V2_MAGIC_2;
	buf[3] = V2_VERSION;
	buf[4] = type;
	return [buf, packetSize];
}

function finishV2Packet(packet) {
	// Small packets are copied out of the reusable scratch buffer because ws.send is async.
	// Larger packets already own their Buffer and can be passed through unchanged.
	var buf = packet[0];
	var len = packet[1];
	if(buf === v2Scratch) return Buffer.from(buf.subarray(0, len));
	return len == buf.length ? buf : buf.subarray(0, len);
}

function decodeV2(data) {
	var buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
	if(!isV2Packet(buf)) return null;
	var state = { offset: 5 };
	var type = buf[4];
	if(type == V2_HELLO) {
		if(state.offset + 1 > buf.length) return null;
		return {
			kind: "protocol",
			protocolVersion: 2,
			binarySupport: true,
			capabilities: buf[state.offset]
		};
	}
	if(type == V2_PING) {
		if(state.offset + 8 > buf.length) return null;
		return {
			kind: "ping",
			request: buf.readUInt32BE(state.offset),
			id: buf.readUInt32BE(state.offset + 4)
		};
	}
	if(type == V2_FETCH) {
		if(state.offset + 7 > buf.length) return null;
		var request = buf.readUInt32BE(state.offset);
		state.offset += 4;
		var flags = buf[state.offset++];
		var count = buf.readUInt16BE(state.offset);
		state.offset += 2;
		var fetchRectangles = [];
		for(var i = 0; i < count; i++) {
			if(state.offset + 16 > buf.length) return null;
			fetchRectangles.push({
				minX: buf.readInt32BE(state.offset),
				minY: buf.readInt32BE(state.offset + 4),
				maxX: buf.readInt32BE(state.offset + 8),
				maxY: buf.readInt32BE(state.offset + 12)
			});
			state.offset += 16;
		}
		return {
			kind: "fetch",
			request,
			fetchRectangles,
			utf16: !!(flags & 1),
			array: !!(flags & 2),
			content_only: !!(flags & 4),
			concat: !!(flags & 8)
		};
	}
	if(type == V2_WRITE) {
		if(state.offset + 7 > buf.length) return null;
		var request = buf.readUInt32BE(state.offset);
		state.offset += 4;
		var flags = buf[state.offset++];
		var count = buf.readUInt16BE(state.offset);
		state.offset += 2;
		var edits = [];
		for(var i = 0; i < count; i++) {
			if(state.offset + 22 > buf.length) return null;
			var tileY = buf.readInt32BE(state.offset);
			var tileX = buf.readInt32BE(state.offset + 4);
			var charY = buf[state.offset + 8];
			var charX = buf[state.offset + 9];
			var editId = buf.readUInt32BE(state.offset + 10);
			var color = buf.readInt32BE(state.offset + 14);
			var bgColor = buf.readInt32BE(state.offset + 18);
			state.offset += 22;
			var char = readString(buf, state);
			if(char === null) return null;
			edits.push([tileY, tileX, charY, charX, 0, char, editId, color, bgColor]);
		}
		return {
			kind: "write",
			request,
			edits,
			public_only: !!(flags & 1),
			preserve_links: !!(flags & 2)
		};
	}
	return null;
}

function encodeV2Hello() {
	var packet = allocV2Packet(V2_HELLO, 1);
	var buf = packet[0];
	buf[5] = 1;
	return finishV2Packet(packet);
}

function encodeV2Ping(data) {
	var packet = allocV2Packet(V2_PING, 8);
	var buf = packet[0];
	buf.writeUInt32BE(data.request || 0, 5);
	buf.writeUInt32BE(data.id || 0, 9);
	return finishV2Packet(packet);
}

function encodeV2WriteResponse(data) {
	var accepted = Array.isArray(data.accepted) ? data.accepted : [];
	var rejected = data.rejected || {};
	var rejectedKeys = Object.keys(rejected);
	var packet = allocV2Packet(V2_WRITE_RESPONSE, 4 + 2 + accepted.length * 4 + 2 + rejectedKeys.length * 8);
	var buf = packet[0];
	var offset = 5;
	buf.writeUInt32BE(data.request || 0, offset);
	offset += 4;
	buf.writeUInt16BE(accepted.length, offset);
	offset += 2;
	for(var i = 0; i < accepted.length; i++) {
		buf.writeUInt32BE(accepted[i] >>> 0, offset);
		offset += 4;
	}
	buf.writeUInt16BE(rejectedKeys.length, offset);
	offset += 2;
	for(var i = 0; i < rejectedKeys.length; i++) {
		var key = +rejectedKeys[i];
		buf.writeUInt32BE(key >>> 0, offset);
		buf.writeUInt32BE((rejected[rejectedKeys[i]] || 0) >>> 0, offset + 4);
		offset += 8;
	}
	return finishV2Packet(packet);
}

function encodeV2Request(data) {
	if(!data || data.constructor != Object) return null;
	if(data.kind == "protocol") return encodeV2Hello();
	if(data.kind == "ping") return encodeV2Ping(data);
	if(data.kind == "fetch") {
		var rects = data.fetchRectangles || [];
		var packet = allocV2Packet(V2_FETCH, 7 + rects.length * 16);
		var buf = packet[0];
		var offset = 5;
		buf.writeUInt32BE(data.request || 0, offset);
		offset += 4;
		buf[offset++] = (data.utf16 ? 1 : 0) | (data.array ? 2 : 0) | (data.content_only ? 4 : 0) | (data.concat ? 8 : 0);
		buf.writeUInt16BE(rects.length, offset);
		offset += 2;
		for(var i = 0; i < rects.length; i++) {
			var rect = rects[i];
			buf.writeInt32BE(rect.minX || 0, offset);
			buf.writeInt32BE(rect.minY || 0, offset + 4);
			buf.writeInt32BE(rect.maxX || 0, offset + 8);
			buf.writeInt32BE(rect.maxY || 0, offset + 12);
			offset += 16;
		}
		return finishV2Packet(packet);
	}
	if(data.kind == "write") {
		var edits = data.edits || [];
		var bodySize = 7;
		for(var i = 0; i < edits.length; i++) {
			bodySize += 22 + 2 + byteLengthString(edits[i][5]);
		}
		var packet = allocV2Packet(V2_WRITE, bodySize);
		var buf = packet[0];
		var offset = 5;
		buf.writeUInt32BE(data.request || 0, offset);
		offset += 4;
		buf[offset++] = (data.public_only ? 1 : 0) | (data.preserve_links ? 2 : 0);
		buf.writeUInt16BE(edits.length, offset);
		offset += 2;
		for(var i = 0; i < edits.length; i++) {
			var edit = edits[i];
			buf.writeInt32BE(edit[0] || 0, offset);
			buf.writeInt32BE(edit[1] || 0, offset + 4);
			buf[offset + 8] = edit[2] || 0;
			buf[offset + 9] = edit[3] || 0;
			buf.writeUInt32BE((edit[6] || 0) >>> 0, offset + 10);
			buf.writeInt32BE(edit[7] == null ? 0 : edit[7], offset + 14);
			buf.writeInt32BE(edit[8] == null ? -1 : edit[8], offset + 18);
			offset += 22;
			offset = writeString(buf, offset, edit[5]);
		}
		return finishV2Packet(packet);
	}
	return null;
}

function encodeV2Response(data) {
	if(!data || data.constructor != Object) return null;
	if(data.kind == "ping") return encodeV2Ping(data);
	if(data.kind == "write") return encodeV2WriteResponse(data);
	if(data.kind == "protocol") return encodeV2Hello();
	return null;
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
	decodeV2,
	encodeV2Request,
	encodeV2Response,
	isV2Packet
};
