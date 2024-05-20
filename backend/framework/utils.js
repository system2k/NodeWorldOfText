
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

module.exports = {
	parseCookie
};
