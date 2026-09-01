const crypto = require("crypto");
var { checkWhitelistFeature } = require("../utils/whitelist.js");
var altchaLib = null;
try {
	altchaLib = require("altcha/lib");
} catch(e) {
	// Altcha lib not loaded
}

var hmacKey = null;
var captchaTokens = new Map();

function getHmacKey() {
	if(!hmacKey) {
		hmacKey = crypto.randomBytes(32).toString("hex");
	}
	return hmacKey;
}

function generateCaptchaToken() {
	return crypto.randomBytes(16).toString("hex");
}

function setClientCaptchaToken(ipAddress) {
	let tok = generateCaptchaToken();
	captchaTokens.set(tok, {
		ips: new Set([ipAddress]),
		date: Date.now()
	});
}

// returns: successfully reserved
function reserveClientCaptchaToken(token, ipAddress) {
	if(typeof token != "string") {
		return false;
	}
	// token not defined
	if(!captchaTokens.has(token)) {
		return false;
	}
	let tok = captchaTokens.get(token);
	// token expired
	if(Date.now() - tok.date >= 1000 * 60 * 30) {
		return false;
	}
	// token is valid as long as a max of two IPs are using it
	if(tok.ips.has(ipAddress)) {
		return true;
	} else if(tok.ips.size < 2) {
		tok.ips.set(ipAddress, true);
		return true;
	}
	return false;
}

async function createChallenge(ipAddress) {
	var challenge = await altchaLib.createChallenge({
		algorithm: "SHA-256",
		deriveKey: altchaLib.sha.deriveKey,
		hmacSignatureSecret: getHmacKey() + "-" + ipAddress,
		cost: 1000,
		expiresAt: new Date(Date.now() + 1000 * 60 * 5)
	});
	return challenge;
}

async function verifyChallenge(payload, ipAddress) {
	var data = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
	var result = await altchaLib.verifySolution({
		challenge: data.challenge,
		solution: data.solution,
		deriveKey: altchaLib.sha.deriveKey,
		hmacSignatureSecret: getHmacKey() + "-" + ipAddress
	});
	return result.verified;
}

async function persistVerification(server, user, ipAddress, worldName) {
	var db_misc = server.db_misc;
	var handle_error = server.handle_error;

	var wl_can_captcha_auto_exempt = checkWhitelistFeature(user.id, user.authenticated, ipAddress, worldName, "few_captcha", server);
	if(wl_can_captcha_auto_exempt) {
		try {
			await db_misc.run(`
				INSERT INTO captcha_exempt (id, ip, date_created, captcha_type, user_id)
				VALUES (null, $ip, $date_created, $captcha_type, $user_id)
			`, {
				$ip: ipAddress,
				$date_created: Date.now(),
				$captcha_type: "ALTCHA",
				$user_id: user.id || null
			});
		} catch(e) {
			handle_error(e);
		}
	}
}

async function isRequired(server, user, ipAddress, worldName) {
	var getServerSetting = server.getServerSetting;
	var db_misc = server.db_misc;

	var captchaEnabledGlobally = getServerSetting("captchaEnabled") == "1";
	if(!captchaEnabledGlobally) {
		return false;
	}

	var isRequired = false;

	var captchaExemptWhitelist = checkWhitelistFeature(user.id, user.authenticated, ipAddress, worldName, "no_captcha", server);
	var captchaExemptDatabase = await db_misc.get("SELECT * FROM captcha_exempt WHERE ip=?", ipAddress);

	if(captchaExemptDatabase) {
		let date_created = captchaExemptDatabase.date_created;
		if(Date.now() - date_created >= 1000 * 60 * 60) { // expired after 1 hour
			await db_misc.run("DELETE FROM captcha_exempt WHERE ip=?", ipAddress);
			captchaExemptDatabase = null;
		}
	}

	if(!captchaExemptWhitelist && !captchaExemptDatabase) {
		isRequired = true;
	}

	return isRequired;
}

module.exports = {
	createChallenge,
	verifyChallenge,
	persistVerification,
	isRequired,
	setClientCaptchaToken,
	reserveClientCaptchaToken
};