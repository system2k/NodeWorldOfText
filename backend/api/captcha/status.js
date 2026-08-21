var { checkWhitelistFeature } = require("../../utils/whitelist.js")

module.exports.GET = async function(req, write, server, ctx) {
	var user = ctx.user;
	var ipAddress = ctx.ipAddress;

	var getServerSetting = server.getServerSetting;
	var db_misc = server.db_misc;
	var captcha_manager = server.captcha_manager;

	var captchaExemptWhitelist = checkWhitelistFeature(user.id, user.authenticated, ipAddress, server, "no_captcha", server);
	var captchaExemptDatabase = await db_misc.get("SELECT * FROM captcha_exempt WHERE ip=?", ipAddress);

	if(captchaExemptDatabase) {
		let date_created = captchaExemptDatabase.date_created;
		if(Date.now() - date_created >= 1000 * 60 * 60) { // expired after 1 hour
			await db_misc.run("DELETE FROM captcha_exempt WHERE ip=?", ipAddress);
			captchaExemptDatabase = null;
		}
	}

	var captchaEnabledGlobally = getServerSetting("captchaEnabled") == "1";
	if(!captchaExemptWhitelist && !captchaExemptDatabase && captchaEnabledGlobally) {
		ws.sdata.captchaRequired = true;
		let challenge = await captcha_manager.requireCaptcha(ipAddress);
		return write(JSON.stringify({
			status: "REQUIRED"
		}));
	}

	return write(JSON.stringify({
		status: "PASS"
	}));
}
