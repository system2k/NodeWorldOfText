var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;
var templates = require("../../framework/templates.js");

module.exports.GET = async function(req, write, server, ctx) {
	var path = ctx.path;
	var user = ctx.user;
	var render = ctx.render;

	var website = server.website;
	var send_email = server.send_email;
	var handle_error = server.handle_error;
	var db = server.db;
	var new_token = server.new_token;
	var accountSystem = server.accountSystem;

	if(accountSystem == "uvias") {
		return;
	}

	if(!user.authenticated) {
		return;
	}
	if(user.is_active) {
		return;
	}
	var ver_count = (await db.get("SELECT COUNT(*) AS cnt FROM registration_registrationprofile WHERE user_id=?", user.id)).cnt;
	if(ver_count >= 1) {
		return write(render("registration/verify_email.html", {
			verified: true
		}));
	}

	var url_csrftoken = checkURLParam("/accounts/verify_email/:token", path).token;
	
	// invalid csrftoken
	if(user.csrftoken != url_csrftoken) {
		return;
	}

	var token = new_token(20);
	var tokenSendFailed = false;

	var subject = templates.execute(templates.getFile("registration/verification_email_subject.txt"));
	try {
		var email_send = await send_email(user.email, subject, templates.execute(templates.getFile("registration/verification_email.txt"), {
			website,
			reg_key: "accounts/verify/" + token + "/"
		}));
		if(email_send == "error") {
			tokenSendFailed = true;
		}
	} catch(e) {
		handle_error(e);
		tokenSendFailed = true;
	}
	if(!tokenSendFailed) {
		await db.run("INSERT INTO registration_registrationprofile VALUES(null, ?, ?)",
			[user.id, token]);
	}

	write(render("registration/verify_email.html"));
}