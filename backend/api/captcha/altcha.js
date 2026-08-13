const { createChallenge, verifySolution, sha } = require("altcha/lib");

var hmacKey = null;

function getHmacKey() {
	if(!hmacKey) {
		hmacKey = require("crypto").randomBytes(32).toString("hex");
	}
	return hmacKey;
}

module.exports.getHmacKey = getHmacKey;

module.exports.GET = async function(req, write, server, ctx) {
	var challenge = await createChallenge({
		algorithm: "SHA-256",
		deriveKey: sha.deriveKey,
		hmacSignatureSecret: getHmacKey(),
		cost: 1000
	});
	write(JSON.stringify(challenge), 200, {
		mime: "application/json"
	});
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var payload = post_data.altcha;
	if(!payload) {
		return write(JSON.stringify({ verified: false }), 200, {
			mime: "application/json"
		});
	}
	try {
		var data = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
		var result = await verifySolution({
			challenge: data.challenge,
			solution: data.solution,
			deriveKey: sha.deriveKey,
			hmacSignatureSecret: getHmacKey()
		});
		write(JSON.stringify({ verified: result.verified }), 200, {
			mime: "application/json"
		});
	} catch(e) {
		write(JSON.stringify({ verified: false }), 200, {
			mime: "application/json"
		});
	}
}
