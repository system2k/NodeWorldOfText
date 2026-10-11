var { checkWhitelistFeature } = require("../../utils/whitelist.js");
const { createChallenge, verifySolution, sha } = require("altcha/lib");
var captcha = require("../../subsystems/captcha.js");

var world_mgr = require("../../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var getWorld = world_mgr.getWorld;
var canViewWorld = world_mgr.canViewWorld;

var hmacKey = null;

function getHmacKey() {
	if(!hmacKey) {
		hmacKey = require("crypto").randomBytes(32).toString("hex");
	}
	return hmacKey;
}

module.exports.GET = async function(req, write, server, ctx) {
	var ipAddress = ctx.ipAddress;

	var challenge = await captcha.createChallenge(ipAddress);

	write(JSON.stringify(challenge), 200, {
		mime: "application/json"
	});
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var ipAddress = ctx.ipAddress;
	var user = ctx.user;
	var setCallback = ctx.setCallback;

	var db_misc = server.db_misc;
	var handle_error = server.handle_error;

	var worldIncluded = post_data.world != void 0;
	var worldName = null;

	if(worldIncluded) {
		if(typeof post_data.world != "string") return write(null, 400);
		let world = await getWorld(post_data.world);
		if(!world) {
			return write(null, 404);
		}
		
		setCallback(function() {
			releaseWorld(world);
		});

		let perm = await canViewWorld(world, user, {
			memKey: post_data.key
		});
		if(!perm) {
			return write(null, 403);
		}
		worldName = world.name.toUpperCase();
	}

	var payload = post_data.payload;
	if(!payload) {
		return write(null, 400);
	}

	var verifiedStatus = await captcha.verifyChallenge(payload, ipAddress);
	var token = null;

	if(verifiedStatus) {
		await captcha.persistVerification(server, user, ipAddress, worldName);
		token = captcha.setClientCaptchaToken(ipAddress);
	}

	write(JSON.stringify({
		verified: verifiedStatus,
		token
	}), 200, {
		mime: "application/json"
	});
}
