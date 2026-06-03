"use strict";

var net = require("net");

var redisHost = "127.0.0.1";
var redisPort = 6379;
var ready = false;

function parseRedisUrl(url) {
	if(!url) return;
	try {
		var parsed = new URL(url);
		redisHost = parsed.hostname || redisHost;
		if(parsed.port) redisPort = parseInt(parsed.port, 10);
	} catch(e) {}
}

function respBulk(str) {
	return "$" + Buffer.byteLength(str) + "\r\n" + str + "\r\n";
}

function redisCommand(args) {
	return new Promise(function(resolve, reject) {
		var parts = ["*" + args.length + "\r\n"];
		for(var i = 0; i < args.length; i++) {
			parts.push(respBulk(String(args[i])));
		}
		var socket = net.createConnection({ host: redisHost, port: redisPort }, function() {
			socket.write(parts.join(""));
		});
		var buf = "";
		socket.setEncoding("utf8");
		socket.on("data", function(chunk) {
			buf += chunk;
			if(buf.indexOf("\r\n") !== -1) {
				socket.end();
				resolve(buf);
			}
		});
		socket.on("error", reject);
	});
}

module.exports.init = async function(redisUrl) {
	parseRedisUrl(redisUrl);
	try {
		await redisCommand(["PING"]);
		ready = true;
	} catch(e) {
		console.warn("\x1b[93mSidecar broadcast: Redis unavailable (" + e.message + ")\x1b[0m");
		ready = false;
	}
};

module.exports.publishTileUpdate = async function(worldId, payload) {
	if(!ready || worldId == null) return;
	var envelope = JSON.stringify({ world_id: worldId, payload: payload });
	try {
		await redisCommand(["PUBLISH", "owot:ws:broadcast", envelope]);
	} catch(e) {
		ready = false;
	}
};
