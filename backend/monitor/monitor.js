/*
	Traffic monitor utility
	Must be kept behind another authentication layer!
*/

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const querystring = require("querystring");
const WebSocket = require("ws");
const worker = require("node:worker_threads");

var util = require("../framework/utils.js");

var parentPort = worker.parentPort;
var workerData = worker.workerData;

const auth_user = workerData.user;
const auth_pass = workerData.pass;

var pageTemplate = fs.readFileSync("./backend/monitor/monitor.html");
var loginTemplate = fs.readFileSync("./backend/monitor/login.html");

var cachedTileCount = null;
var sessionKeys = {};
var csrfTokens = {};

function loadResponse(req) {
	return new Promise(function(resolve) {
		let resData = "";
		req.on("data", function(data) {
			resData += data;
		});
		req.on("end", function() {
			resolve(querystring.parse(resData, null, null, { maxKeys: 256 }));
		});
	});
}

function isAuthenticated(key) {
	if(!key) return false;
	if(typeof key != "string") return false;
	if(sessionKeys.hasOwnProperty(key) && sessionKeys[key].isSessionKey) {
		// authenticated
		return true;
	} else {
		return false;
	}
}

var server = http.createServer(async function(req, res) {
	let path = req.url;
	let method = req.method;
	let cookies = util.parseCookie(req.headers.cookie);
	let ip = req.socket.remoteAddress;
	if(path == "/") {
		if(method == "GET") {
			let key = cookies.key;
			let hasAccess = isAuthenticated(key);
			// preliminary checks
			if(hasAccess) {
				if(sessionKeys[key].ip != ip) {
					hasAccess = false;
				}
				if(Date.now() - sessionKeys[key].created > 1000 * 60 * 60 * 1) {
					hasAccess = false;
					delete sessionKeys[key];
				}
			}
			if(hasAccess) {
				// authenticated
				let csrf = crypto.randomBytes(16).toString("hex");
				csrfTokens[csrf] = {
					isCsrfToken: true,
					key: key
				};
				res.writeHead(200, {
					"Content-Type": "text/html",
					"Set-Cookie": "moncsrftoken=" + csrf
				});
				res.end(pageTemplate);
			} else {
				res.end(loginTemplate);
				res.writeHead(200, {
					"Content-Type": "text/html"
				});
			}
			return;
		} else if(method == "POST") {
			if(!auth_user || !auth_pass) return res.end("Try again");
			if(typeof auth_user != "string" || typeof auth_pass != "string") return res.end("Try again");
			if(auth_pass.length < 3) return res.end("Try again");
			let resp = await loadResponse(req);
			let user = resp.i_user;
			let pass = resp.i_pass;
			if(user.length != auth_user.length) return res.end("Try again");
			if(pass.length != auth_pass.length) return res.end("Try again");
			var equal1 = crypto.timingSafeEqual(Buffer.from(user), Buffer.from(auth_user));
			var equal2 = crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(auth_pass));
			if(equal1 && equal2 && user == auth_user && pass == auth_pass) {
				let key = crypto.randomBytes(32).toString("hex");
				sessionKeys[key] = {
					isSessionKey: true,
					ip: ip,
					created: Date.now()
				};
				res.writeHead(302, {
					"Location": ".",
					"Set-Cookie": "key=" + key
				});
				res.end();
			} else {
				res.end("Try again");
			}
			return;
		}
	}
	res.writeHead(404);
	res.end("404: Not found");
});

parentPort.on("message", function(data) {
	if(typeof data == "object") {
		if(data.type == "dbCount") {
			cachedTileCount = data;
		}
		data = "$" + JSON.stringify(data);
	}
	wsServer.clients.forEach(function(ws) {
		if(ws.readyState == WebSocket.OPEN) {
			if(!ws.authenticated) return;
			try {
				ws.send(data);
			} catch(e) {}
		}
	});
});

var wsServer = new WebSocket.Server({
	server,
	perMessageDeflate: true,
	maxPayload: 128000
});

function sendPreliminaryData(ws) {
	if(cachedTileCount) {
		try {
			ws.send("$" + JSON.stringify(cachedTileCount));
		} catch(e) {}
	}
	let socketCount = 0;
	wsServer.clients.forEach(function(ws) {
		if(ws.authenticated && ws.readyState == WebSocket.OPEN) {
			socketCount++;
		}
	});
	try {
		ws.send("[Server] " + socketCount + " monitor socket(s)");
	} catch(e) {}
}

function startup() {
	server.listen(workerData.port, workerData.ip);
	wsServer.on("connection", function(ws, req) {
		let cookies = util.parseCookie(req.headers.cookie);
		let key = cookies.key;
		if(!isAuthenticated(key)) {
			ws.close();
			return;
		}
		ws.on("message", function(data) {
			try {
				let msg = JSON.parse(data.toString("utf8"));
				if(msg.kind == "csrftoken") {
					let token = msg.csrftoken;
					if(!ws.authenticated) {
						if(csrfTokens.hasOwnProperty(token) && csrfTokens[token].isCsrfToken && csrfTokens[token].key == key) {
							ws.authenticated = true;
							sendPreliminaryData(ws);
						}
					}
				}
			} catch(e) {}
		});
	});
}

startup();