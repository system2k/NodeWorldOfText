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

// sanitize number input
function san_nbr(x) {
    x -= 0;
    if(x >= 9007199254740991) x = 9007199254740991;
    if(x <= -9007199254740991) x = -9007199254740991;
    x = parseInt(x);
    if(!x || isNaN(x) || !isFinite(x)) {
        x = 0;
    }
    x = Math.floor(x);
    if(x >= 9007199254740991) x = 9007199254740991;
    if(x <= -9007199254740991) x = -9007199254740991;
    return x;
}

// just to make things easier
function toUpper(x) {
    return x.toString().toUpperCase();
}

function NCaseCompare(str1, str2) {
	str1 += "";
	str2 += "";
	var res = str1.localeCompare(str2, "en", {
		sensitivity: "base"
	});
	return !res;
}

/*
    usage:
    split_limit("a|b|c|d|e|f|g", "|", 3) = ["a", "b", "c", "d|e|f|g"]
*/
function split_limit(str, char, limit) {
    if(!limit && limit != 0) limit = Infinity;
    var arr = str.split(char);
    var result = arr.splice(0, limit);
    result.push(arr.join(char));
    return result;
}

function get_third(url, first, second) {
    var value = split_limit(url, first + "/" + second + "/", 1)[1];
    if(value.charAt(value.length - 1) === "/") {
        value = value.substring(0, value.length - 1);
    }
    return value;
}

function get_fourth(url, first, second, third) {
    var value = split_limit(url, first + "/" + second + "/" + third + "/", 1)[1];
    if(value.charAt(value.length - 1) === "/") {
        value = value.substring(0, value.length - 1);
    }
    return value;
}

function removeLastSlash(text) {
    if(text.charAt(text.length - 1) == "/") {
        text = text.slice(0, text.length - 1);
    }
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

// make sure filenames don't contain invalid sequences
var filename_sanitize = (function() {
    var illegalRe = /[\/\?<>\\:\*\|":]/g;
    var controlRe = /[\x00-\x1f\x80-\x9f]/g;
    var reservedRe = /^\.+$/;
    var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    var windowsTrailingRe = /[\. ]+$/;

    function sanitize(input, replacement) {
        var sanitized = input
            .replace(illegalRe, replacement)
            .replace(controlRe, replacement)
            .replace(reservedRe, replacement)
            .replace(windowsReservedRe, replacement)
            .replace(windowsTrailingRe, replacement);
        return sanitized;
    }

    return function(input) {
        var replacement = "_";
        return sanitize(input, replacement);
    }
})();

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
    return new Buffer(str).toString("base64");
}
function decode_base64(b64str) {
    return new Buffer(b64str, "base64").toString("ascii");
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
    coord = coord.split(",")
    return [parseInt(coord[0]), parseInt(coord[1])];
}

var start_time = Date.now();
var _time_ago = ["millisecond", "second", "minute", "hour", "day", "month", "year"];
function uptime(custom_ms_ago) {
    // (milliseconds ago)
    var difference = custom_ms_ago || (Date.now() - start_time);
    var milliseconds_ago = difference;
    var _data = _time_ago[0];
    var show_minutes = true; // EG: ... and 20 minutes
    var divided = 1;
	if(milliseconds_ago >= 30067200000) {
        _data = _time_ago[6];
        divided = 30067200000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else if(milliseconds_ago >= 2505600000) {
        _data = _time_ago[5];
        divided = 2505600000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else if(milliseconds_ago >= 86400000) {
        _data = _time_ago[4];
        divided = 86400000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else if(milliseconds_ago >= 3600000) {
        _data = _time_ago[3];
        divided = 3600000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
    } else if(milliseconds_ago >= 60000) {
        _data = _time_ago[2];
        divided = 60000;
        show_minutes = false;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
    } else if(milliseconds_ago >= 1000) {
        _data = _time_ago[1];
        divided = 1000;
        show_minutes = false;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else {
        show_minutes = false;
    }
	if(milliseconds_ago !== 1) {
		_data += "s";
    }
    var extra = "";
    if(show_minutes) {
        var t_difference = difference;
        t_difference -= divided;
        if(t_difference > 0) {
            t_difference %= divided;
            t_difference = Math.floor(t_difference / 60000);
            if(t_difference > 0) {
                extra = " and " + t_difference + " minute";
                if(t_difference != 1) extra += "s";
            }
        }
    }
	return milliseconds_ago + " " + _data + extra;
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
        this.setChar(chrInf.tlPipe, x1, y1, fore, back)
        this.setChar(chrInf.brPipe, x2, y2, fore, back)
        this.setChar(chrInf.trPipe, x2, y1, fore, back)
        this.setChar(chrInf.blPipe, x1, y2, fore, back)

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
function encodeCharProt(array) {
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
    var str = "@";
    var bytes = Math.ceil(128 / 3);
    for(var i = 0; i < bytes; i++) {
        var idx = i * 3;
        var char1 = ((4*4)*arrayCom[idx + 0]);
        var char2 = ((4)*arrayCom[idx + 1]);
        var char3 = ((1)*arrayCom[idx + 2]);
        if(idx + 1 > 127) char2 = 0;
        if(idx + 2 > 127) char3 = 0;
        var code = char1 + char2 + char3;
        str += base64table.charAt(code);
    }
    return str;
}

function decodeCharProt(str) {
    var res = new Array(128).fill(0);
    str = str.substr(1);
    for(var i = 0; i < str.length; i++) {
        var code = base64table.indexOf(str.charAt(i));
        var char1 = Math.trunc(code / (4*4) % 4);
        var char2 = Math.trunc(code / (4) % 4);
        var char3 = Math.trunc(code / (1) % 4);
        res[i*3 + 0] = char1;
        if(i*3 + 1 > 127) break;
        res[i*3 + 1] = char2;
        if(i*3 + 2 > 127) break;
        res[i*3 + 2] = char3;
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

// split a string properly with characters containing surrogates and combining characters
function advancedSplit(str) {
    str += "";
    var data = str.match(/([\uD800-\uDBFF][\uDC00-\uDFFF])|(([\0-\u02FF\u0370-\u1DBF\u1E00-\u20CF\u2100-\uD7FF\uDC00-\uFE1F\uFE30-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF])([\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+))|.|\n|\r/g)
    if(data == null) return [];
    for(var i = 0; i < data.length; i++) {
        // contains surrogates without second character?
        // This invalid character would not have been added to the string anyway
        if(data[i].match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g)) {
            data.splice(i, 1)
        }
    }
    for(var i = 0; i < data.length; i++) {
        data[i] = data[i].slice(0, 16); // limit of 16 combining characters
    }
    // if a part contains a single nul character, make the entire part nul
    for(var i = 0; i < data.length; i++) {
        var chr = data[i];
        for(var x = 0; x < chr.length; x++) {
            if(chr[x] == "\0") {
                data[i] = "\0";
                break;
            }
        }
    }
    return data;
}

function insert_char_at_index(string, char, index) {
    string += "";
    char += "";
    string = advancedSplit(string);
    var stringPrev = string.slice(0);
    char = advancedSplit(char);
    if(char.length == 0) return string.join("");
    if(char.length > 1) char = char.slice(0, 1);
    char = char[0];
    
    if(char == "\0") return string.join("");
    
    var c1 = /([\0-\u02FF\u0370-\u1DBF\u1E00-\u20CF\u2100-\uD7FF\uDC00-\uFE1F\uFE30-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF])/g;

    var c2 = /([\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+)/g;

    var ex1 = char.match(c1);
    var ex2 = char.match(c2);

    if(ex2 && !ex1) { // combining char without the first char?
        char = "@";
    }
    
    string[index] = char;
    
    string = string.join("");
    
    string = advancedSplit(string);
    
    for(var i = 0; i < 128; i++) {
        var char1 = stringPrev[i];
        var char2 = string[i];
        
        if(i == index) continue;
        if(char1 != char2) {
            stringPrev[index] = "!";
            string = stringPrev;
        }
    }
    
    // make sure content is exactly 128
    if(string.length > 128) string = string.slice(0, 128);
    if(string.length < 128) string = string.concat(Array(128).fill(" ")).slice(0, 128);
    
    return string.join("");
}

function html_tag_esc(str, non_breaking_space) {
    str = str.replace(/\&/g, "&amp;");
    str = str.replace(/\"/g, "&quot;");
    str = str.replace(/\'/g, "&#39;");
    if(non_breaking_space) { // replace spaces with non-breaking space html tags
        str = str.replace(/\u0020/g, "&nbsp;");
    }
    str = str.replace(/\</g, "&lt;");
    str = str.replace(/\>/g, "&gt;");
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

function fixColors(colors) {
    if(Array.isArray(colors)) {
        colors = colors.slice(0, 128);
        for(var g = 0; g < colors.length; g++) {
            colors[g] = sanitize_color(colors[g]);
        }
    } else {
        colors = sanitize_color(colors);
    }
    return colors;
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

module.exports = {
    trimHTML,
    create_date,
    san_nbr,
    toUpper,
    NCaseCompare,
    split_limit,
    get_third,
    get_fourth,
    removeLastSlash,
    parseCookie,
    ar_str_trim,
    ar_str_decodeURI,
    filename_sanitize,
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
    insert_char_at_index,
    html_tag_esc,
    sanitize_color,
    fixColors,
    parseAcceptEncoding
}