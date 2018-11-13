function assert(exp, optMsg) {
	if (!exp) {
		throw new Error(optMsg || "Assertion failed");
	}
}

function intmax(ints) {
	if(typeof ints == "number") ints = [ints];
	for(var i = 0; i < ints.length; i++)
		if(ints[i] > Number.MAX_SAFE_INTEGER || ints[i] < Number.MIN_SAFE_INTEGER) return false;
	return true;
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
}

function getKeyCode(e) {
	if(e.keyCode != void 0) return e.keyCode;
	if(e.which != void 0) return e.which;
	if(e.code != void 0) return keyCodeTbl[e.code.toUpperCase()];
	return 0;
}