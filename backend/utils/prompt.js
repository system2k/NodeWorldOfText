var readline = require("readline");
var Writable = require("stream").Writable;

var passMode = false;
var isAsking = false;

var output = new Writable({
	write: function(chunk, encoding, callback) {
		if(passMode) {
			var str = chunk.toString("utf8");
			var res = "";
			for(var i = 0; i < str.length; i++) {
				var chr = str[i];
				if(chr == "\n" || chr == "\r") {
					res += chr;
				} else {
					res += "*";
				}
			}
			process.stdout.write(res);
		} else {
			process.stdout.write(chunk, encoding);
		}
		callback();
	}
});

var interface = readline.createInterface({
	input: process.stdin,
	output: output,
	terminal: true
});

interface.on("SIGINT", function() {
	process.emit("SIGINT");
});

async function ask(question, isPassword) {
	if(isAsking) return;
	isAsking = true;
	return new Promise(function(res) {
		interface.question(question, function(data) {
			isAsking = false;
			passMode = false;
			res(data);
		});
		passMode = Boolean(isPassword);
	});
}

function stop() {
	interface.close();
}

module.exports = {
	ask,
	stop
};