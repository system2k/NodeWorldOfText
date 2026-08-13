const { createChallenge, verifySolution, sha } = require("altcha/lib");
const altchaPage = require("../api/captcha/altcha.js");

function getHmacKey() {
	return altchaPage.getHmacKey();
}

var captchaConfig = {
	enabled: true,
	threshold: 250, // writes/chats per windowMs to trigger "lockdown"
	windowMs: 10000, // sliding window duration in milliseconds
	solveCost: 1000, // PoW difficulty
	cleanupInterval: 300000 // how often stale state is cleaned up in ms
};

var ipChallenges = {};
var cleanupTimer = null;

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
	requireCaptcha,
	verifyAndSolve,
	hasPendingChallenge,
	setConfig,
	getConfig,
	clearExpired,
	startCleanup,
	stopCleanup
};
