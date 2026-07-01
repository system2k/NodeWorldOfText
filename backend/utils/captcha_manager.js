const { createChallenge, verifySolution, sha } = require("altcha/lib");
const altchaPage = require("../pages/other/altcha.js");

function getHmacKey() {
	return altchaPage.getHmacKey();
}

var captchaConfig = {
	enabled: true,
	threshold: 250, // writes/chats per windowMs to trigger "lockdown"
	windowMs: 10000, // sliding window duration in milliseconds
	solveCost: 1000, // PoW difficulty (some ALTCHA bs) (higher = harder?)
	cleanupInterval: 300000 // how often stale state is cleaned up in ms
};

var ipChallenges = {};
var worldTraffic = {};
var worldLockdown = {};
var cleanupTimer = null;

function incrementWorldTraffic(worldId) {
	if(!worldTraffic[worldId]) {
		worldTraffic[worldId] = { count: 0, windowStart: Date.now() };
	}
	var wt = worldTraffic[worldId];
	var now = Date.now();
	if(now - wt.windowStart > captchaConfig.windowMs) {
		wt.count = 1;
		wt.windowStart = now;
	} else {
		wt.count++;
	}
}

function getWorldTrafficCount(worldId) {
	var wt = worldTraffic[worldId];
	if(!wt) return 0;
	var now = Date.now();
	if(now - wt.windowStart > captchaConfig.windowMs) {
		delete worldTraffic[worldId];
		delete worldLockdown[worldId];
		return 0;
	}
	return wt.count;
}

function isWorldLockdown(worldId) {
	if(!captchaConfig.enabled) return false;
	var count = getWorldTrafficCount(worldId);
	if(count >= captchaConfig.threshold) {
		worldLockdown[worldId] = true;
		return true;
	}
	if(worldLockdown[worldId] && count > 0) {
		return true;
	}
	delete worldLockdown[worldId];
	return false;
}

function isCaptchaRequired(ip, worldId) {
	if(!captchaConfig.enabled) return false;
	if(!isWorldLockdown(worldId)) return false;
	return true;
}

async function requireCaptcha(ip) {
	var challenge = await createChallenge({
		algorithm: "SHA-256",
		deriveKey: sha.deriveKey,
		hmacSignatureSecret: getHmacKey(),
		cost: captchaConfig.solveCost
	});
	ipChallenges[ip] = challenge;
	return challenge;
}

async function verifyAndSolve(ip, payload) {
	var challenge = ipChallenges[ip];
	if(!challenge) return false;
	try {
		var data = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
		var result = await verifySolution({
			challenge: data.challenge,
			solution: data.solution,
			deriveKey: sha.deriveKey,
			hmacSignatureSecret: getHmacKey()
		});
		if(result.verified) {
			delete ipChallenges[ip];
		}
		return result.verified;
	} catch(e) {}
	return false;
}

function hasPendingChallenge(ip) {
	return !!ipChallenges[ip];
}

function clearExpired() {
	var now = Date.now();
	for(var ip in ipChallenges) {
		if(now - ipChallenges[ip].expires > 0) {
			delete ipChallenges[ip];
		}
	}
	var cutoff = now - captchaConfig.windowMs;
	for(var wid in worldTraffic) {
		if(worldTraffic[wid].windowStart < cutoff) {
			delete worldTraffic[wid];
			delete worldLockdown[wid];
		}
	}
}

function setConfig(updates) {
	for(var k in updates) {
		if(k in captchaConfig) {
			captchaConfig[k] = updates[k];
		}
	}
}

function getConfig() {
	return Object.assign({}, captchaConfig);
}

function getStatus(ip, worldId) {
	if(worldId) {
		var inLockdown = isWorldLockdown(worldId);
		return {
			required: inLockdown,
			lockdown: inLockdown,
			trafficCount: getWorldTrafficCount(worldId)
		};
	}
	return {
		challengeCount: Object.keys(ipChallenges).length,
		worldsInLockdown: Object.keys(worldLockdown).length
	};
}

function startCleanup() {
	if(cleanupTimer) return;
	cleanupTimer = setInterval(clearExpired, captchaConfig.cleanupInterval);
}

function stopCleanup() {
	if(cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}

startCleanup();

module.exports = {
	incrementWorldTraffic,
	getWorldTrafficCount,
	isWorldLockdown,
	isCaptchaRequired,
	requireCaptcha,
	verifyAndSolve,
	hasPendingChallenge,
	setConfig,
	getConfig,
	getStatus,
	clearExpired,
	startCleanup,
	stopCleanup
};
