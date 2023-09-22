console.log("Starting process...");

const args = process.argv.slice(2);
const { fork } = require("child_process");
const serverPath = "./runserver.js";

const http = require("http");
let maintenance_port = null;

// Listen for exit command from the console
function listenForExitCommand() {
	process.stdin.resume();
	process.stdin.on("data", function(e) {
		if (e.length && e[0] === 0x03) {
			process.exit();
		}
	});
}

// Function to run the server
function runServer() {
	const owot = fork(serverPath, args);
	let gracefulStop = false;
	let immediateRestart = false;
	let maintenance = false;

	process.stdin.pause();
	owot.on("close", function(code) {
		code += "";
		console.log(`Process exited. [${code}; 0x${code.toString(16).toUpperCase().padStart(8, 0)}]`);
		if (!gracefulStop) {
			if (!immediateRestart) {
				listenForExitCommand();
			}
			console.log("Restarting server...");
			if (immediateRestart) {
				runServer();
			} else {
				setTimeout(runServer, 2000);
			}
		}
		if (maintenance) {
			maintenanceMode();
		}
	});

	owot.on("message", function(msg) {
		if (msg === "EXIT") {
			gracefulStop = true;
		}
		if (msg === "RESTART") {
			immediateRestart = true;
		}
		if (msg === "MAINT") {
			gracefulStop = true;
			maintenance = true;
			listenForExitCommand();
		}
		if (msg.startsWith("PORT=")) {
			maintenance_port = parseInt(msg.slice(5));
		}
	});
}

runServer();

// Function to start maintenance mode
function maintenanceMode() {
	if (!maintenance_port || isNaN(maintenance_port)) {
		throw new Error("Cannot fire up maintenance message server: Invalid port");
	}

	const time = new Date();
	const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	const timeStr = `${months[time.getUTCMonth()]} ${time.getUTCDate()}, ${time.getUTCFullYear()}`;
	const server = http.createServer(function(req, res) {
		try {
			const text = `
				<html>
					<head><title>Maintenance</title></head>
					<span>Our World Of Text is currently down for maintenance.</span><br>
					<span>Maintenance began on ${timeStr}</span>
				</html>`;
			res.write(text);
			res.end();
		} catch (e) {
			console.log(e);
		}
	});

	server.listen(maintenance_port, function() {
		const addr = server.address();
		const ip = addr.address;
		const port = addr.port;
		console.log(`Maintenance: [${ip}]:${port}`);
	});
}
