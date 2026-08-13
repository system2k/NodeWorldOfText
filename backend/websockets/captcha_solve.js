var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var captcha_manager = server.captcha_manager;

	var solved = await captcha_manager.verifyAndSolve(ws.sdata.ipAddress, data.payload);
	if(solved) {
		ws.sdata.captchaRequired = false;
	}
	send({
		kind: "captcha_solved",
		verified: solved
	});
}