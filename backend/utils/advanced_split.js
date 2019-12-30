function cd(chr) {
	return chr.charCodeAt();
}

function takeSurrogates(str) {
	var res = [];
	var range1A = 0xD800;
	var range1B = 0xDBFF;
	var range2A = 0xDC00;
	var range2B = 0xDFFF;
	var len = str.length;
	for(var i = 0; i < len; i++) {
		if(cd(str[i]) >= range2A && cd(str[i]) <= range2B) { // second pair without first pair must be omitted
			continue;
		}
		if(cd(str[i]) >= range1A && cd(str[i]) <= range1B) {
			i++;
			if(i >= len) break; // reached beyond string
			if(cd(str[i]) >= range2A && cd(str[i]) <= range2B) {
				res.push(str[i - 1] + str[i]);
			} else { // ignore malformed surrogate pair
                res.push(str[i]);
            }
		} else {
			res.push(str[i]);
		}
	}
	return res;
}

function inRange(chr) {
	return (0x0300 <= chr && 0x036F >= chr) || (0x1DC0 <= chr && 0x1DFF >= chr) || (0x20D0 <= chr && 0x20FF >= chr) || (0xFE20 <= chr && 0xFE2F >= chr);
}

function takeCombining(str) {
	var res = [];
	var combLimit = 15;
	var len = str.length;
	for(var i = 0; i < len; i++) {
		if(!inRange(cd(str[i])) || str[i].length > 1) {
			var buffer = str[i];
			if(cd(buffer) == 0) {
				res.push(buffer);
				continue;
			}
			if(i + 1 < len && inRange(cd(str[i + 1]))) {
				i++;
				var cnt = 0;
				while(i < len && inRange(cd(str[i]))) {
					cnt++;
					if(cnt <= combLimit) buffer += str[i];
					i++;
				}
				i--;
			}
			res.push(buffer);
		}
	}
	return res;
}

// must output a set of valid characters. must not be single surrogate chars nor single combining chars.
function advancedSplit(str) {
	return takeCombining(takeSurrogates(str));
}

var test_cases = [
    "",
    "A",
    "ABCDEF",
    "😃",
    "\u0315",
    "Test123",
    "test123[\x00]456",
    "😃\u0315\u0315\u0315",
    " 😃Ṭ̮͔̳͈̕e̴͓̻͎͇s̟̟͉͇̞͕͡ͅt̛̻̖̱̪͙ :: [ 😃\u0315\u0315\u0315, \u0315\u0315 ]",
    "This is only a test. 😃 Ṭ̮͔̳͈̕e̴͓̻͎͇s̟̟͉͇̞͕͡ͅt̛̻̖̱̪͙ asd <\u2028> [\ud83d]asd <\0\1\2\3\4\5> 😃Ṭ̮͔̳͈̕e̴͓̻͎͇s̟̟͉͇̞͕͡ͅt̛̻̖̱̪͙ :: [ 😃\u0315\u0315\u0315, \u0315\u0315 ]",
    "A\u2028C",
    "\u0315\u0315\u0315",
    "Q\u0315\u0315\u0315",
    "\u0315\u0315\u0315😃",
    "[\u2028*\u2029]",
    "Modifier<👨🏻‍💻>",
    "✈️[\ufe0f]",
    "✈️\ufe0f",
    "\ufe0f",
    "Surrogate(\ud83d)(\ude03)",
    "\ud83d",
    "👨🏻‍💻",
    "\ud83d\u0323\u0323 ; \ude03\u0323\u0323",
    "\0\u0323",
    "\ud83d\u1111 ; \ude03\u1111",
    "LimitA\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315","Limit😃\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315\u0315",
    "\uFFFF\u0000\uFFFE",
    "\u0315A\u0315A\u0315A",
    "\ud83d\ud83d\ud83d\ud83d\ud83d\ud83d\ud83d\ud83d\ud83d\ud83d"
];

function runTestCases() {
    for(var i = 0; i < test_cases.length; i++) {
        console.log(i, advancedSplit(test_cases[i]));
    }
}

module.exports = {
    advancedSplit
};