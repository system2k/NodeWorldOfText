console.log("Starting process...");

var args = process.argv.slice(2);
var fork = require("child_process").fork;
var serverPath = "./runserver.js";

// server used for maintenance message
var http = require("http");
var maintenance_port = null;

function listenForExitCommand() {
	process.stdin.resume();
	process.stdin.on("data", function(e) {
		if(e.length && e[0] == "0x03") {
			process.exit();
		}
	});
}

function runServer() {
	var owot = fork(serverPath, args);
	var gracefulStop = false;
	var immediateRestart = false;
	var maintenance = false;

	process.stdin.pause();
	owot.on("close", function(code) {
		code += "";
		console.log("Process exited. [" + code + "; 0x" + code.toString(16).toUpperCase().padStart(8, 0) + "]");
		if(!gracefulStop) {
			if(!immediateRestart) {
				listenForExitCommand();
			}
			console.log("Restarting server...");
			if(immediateRestart) {
				runServer();
			} else {
				setTimeout(function() {
					runServer();
				}, 2000);
			}
		}
		if(maintenance) {
			maintenanceMode();
		}
	});

	owot.on("message", function(msg) {
		if(msg == "EXIT") {
			gracefulStop = true;
		}
		if(msg == "RESTART") {
			immediateRestart = true;
		}
		if(msg == "MAINT") {
			gracefulStop = true;
			maintenance = true;
			listenForExitCommand();
		}
		if(msg.startsWith("PORT=")) {
			maintenance_port = parseInt(msg.slice(5));
		}
	});
}

runServer();

function maintenanceMode() {
	if(!maintenance_port || Number.isNaN(maintenance_port)) {
		throw "Cannot fire up maintenance message server: Invalid port";
	}
	var time = new Date();
	var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	var timeStr = "";
	timeStr += months[time.getUTCMonth()] + " ";
	timeStr += time.getUTCDate() + ", ";
	timeStr += time.getUTCFullYear();
	var server = http.createServer(function(req, res) {
		try {
			var text = "<html>" +
				"<head><title>Maintenance</title></head>" +
				"<span>Our World Of Text is currently down for maintenance.</span><br>" +
				"<span>Maintenance began on " + timeStr + "</span>" +
			"</html>";
			res.write(text);
			res.end();
		} catch(e) {
			console.log(e);
		}
	});
	server.listen(maintenance_port, function() {
		var addr = server.address();
		var ip = addr.address;
		var port = addr.port;
		console.log("Maintenance: [" + ip + "]:" + port);
	});
}