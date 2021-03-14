var advancedSplit;
var san_nbr;
function initialize(vars) {
	advancedSplit = vars.advancedSplit;
	san_nbr = vars.san_nbr;
}

function parse(tcode) {
	tcode = advancedSplit(tcode);

	var index = 0;
	var pasteColor = 0;

	var textData = [];
	var colorData = [];
	var protData = [];
	var linkData = [];

	var tileX = 0;
	var tileY = 0;
	var charX = 0;
	var charY = 0;

	var hex = "ABCDEF";

	while(true) {
		var chr = tcode[index];
		var doWriteChar = true;
		var noNewline = false;
		if(chr == "\x1b") {
			doWriteChar = false;
			var hCode = tcode[index + 1];
			if(hCode == "$") { // contains links
				index += 2;
				var lType = tcode[index];
				index++;
				if(lType == "c") { // coord
					var strPoint = index;
					var buf = "";
					var mode = 0;
					while(true) {
						if(tcode[strPoint] == "[" && mode == 0) {
							mode = 1;
							if(++strPoint >= tcode.length) break;
							continue;
						}
						if(tcode[strPoint] == "]" && mode == 1) {
							strPoint++;
							break;
						}
						if(mode == 1) {
							buf += tcode[strPoint];
							if(++strPoint >= tcode.length) break;
							continue;
						}
						if(++strPoint >= tcode.length) break;
					}
					index = strPoint;
					buf = buf.split(",");
					var coordTileX = parseFloat(buf[0].trim());
					var coordTileY = parseFloat(buf[1].trim());
					linkData.push(["coord", tileX, tileY, charX, charY, coordTileX, coordTileY]);
				} else if(lType == "u") { // urllink
					var strPoint = index;
					var buf = "";
					var quotMode = 0;
					while(true) {
						if(tcode[strPoint] == "\"" && quotMode == 0) {
							quotMode = 1;
							if(++strPoint >= tcode.length) break;
							continue;
						}
						if(tcode[strPoint] == "\"" && quotMode == 1) {
							strPoint++;
							break;
						}
						if(quotMode == 1) {
							if(tcode[strPoint] == "\\") {
								quotMode = 2;
								if(++strPoint >= tcode.length) break;
								continue;
							}
							buf += tcode[strPoint];
						}
						if(quotMode == 2) {
							buf += tcode[strPoint];
							quotMode = 1;
							if(++strPoint >= tcode.length) break;
							continue;
						}
						if(++strPoint >= tcode.length) break;
					}
					index = strPoint;
					linkData.push(["url", tileX, tileY, charX, charY, buf]);
				}
			} else if(hCode == "P") { // contains area protections
				index += 2;
				var protType = parseInt(tcode[index]);
				index++;
				if(isNaN(protType)) return;
				if(!(protType >= 0 && protType <= 2)) return;
				protData.push([protType, tileX, tileY, charX, charY]);
			} else if(hCode == "\r" || hCode == "\n" || hCode == "\x1b" || hCode == "r" || hCode == "n") {
				index++;
				doWriteChar = true;
				if(hCode == "\n") { // paste newline character itself
					chr = "\n";
					noNewline = true;
				} else if(hCode == "\r") { // paste carriage return character itself
					chr = "\r";
					noNewline = true;
				} else if(hCode == "\x1b") { // paste ESC character itself
					chr = "\x1b";
				} else if(hCode == "r") { // newline
					chr = "\r";
				} else if(hCode == "n") { // newline
					chr = "\n";
				}
			} else if(hCode == "*") { // skip character
				index++;
				chr = "";
				doWriteChar = true;
			} else { // colored paste
				var cCol = "";
				if(hCode == "x") {
					cCol = "000000";
					index += 2;
				} else if(hCode == "X") {
					cCol = "-1";
					index += 2;
				} else {
					var code = hex.indexOf(hCode);
					if(code > -1) {
						cCol = tcode.slice(index + 2, index + 2 + code + 1).join("");
						index += code + 1;
					}
					index += 2;
				}
				pasteColor = parseInt(cCol, 16);
			}
		}
		if(doWriteChar) {
			textData.push(chr);
			pasteColor = san_nbr(pasteColor);
			if(pasteColor > 16777215) pasteColor = 16777215;
			if(pasteColor < -1) pasteColor = -1;
			colorData.push(pasteColor);
			charX++;
			if(charX >= CONST.tileCols) {
				charX = 0;
				tileX++;
			}
			if((chr == "\r" || chr == "\n") && !noNewline) {
				charX = 0;
				tileX = 0;
				charY++;
				if(charY >= CONST.tileRows) {
					charY = 0;
					tileY++;
				}
			}
			index++;
		}
		if(index >= tcode.length) break;
	}
	return {
		text: textData,
		color: colorData,
		prot: protData,
		link: linkData
	};
}

module.exports = {
	initialize,
	parse
};