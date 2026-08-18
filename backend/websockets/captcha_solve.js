var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

var { checkWhitelistFeature } = require("../utils/whitelist.js");

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var captcha_manager = server.captcha_manager;
	var db_misc = server.db_misc;

	var user = ctx.user;
	var world = ctx.world;

	var solved = await captcha_manager.verifyAndSolve(ws.sdata.ipAddress, data.payload);
	if(solved) {
		ws.sdata.captchaRequired = false;
	}

	var wl_can_captcha_auto_exempt = checkWhitelistFeature(user.id, user.authenticated, ws.sdata.ipAddress, world.name, "few_captcha", server);
	if(wl_can_captcha_auto_exempt) {
		try {
			await db_misc.run(`
				INSERT INTO captcha_exempt (id, ip, date_created, captcha_type, user_id)
				VALUES (null, $ip, $date_created, $captcha_type, $user_id)
			`, {
				$ip: ws.sdata.ipAddress,
				$date_created: Date.now(),
				$captcha_type: "ALTCHA",
				$user_id: user.id || null
			});
		} catch(e) {
			handle_error(e);
		}
	}

	send({
		kind: "captcha_solved",
		verified: solved
	});
}