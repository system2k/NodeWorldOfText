module.exports.GET = async function(req, serve, vars, evars) {
	var path = evars.path;
	var user = evars.user;
	var HTML = evars.HTML;

	var website = vars.website;
	var send_email = vars.send_email;
	var template_data = vars.template_data;
	var handle_error = vars.handle_error;
	var db = vars.db;
	var new_token = vars.new_token;
	var get_third = vars.get_third;
	var accountSystem = vars.accountSystem;

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
		return serve(HTML("registration/verify_email.html", {
			verified: true
		}));
	}

	var url_csrftoken = get_third(path, "accounts", "verify_email");
	
	// invalid csrftoken
	if(user.csrftoken != url_csrftoken) {
		return;
	}

	var token = new_token(20);
	var tokenSendFailed = false;

	var subject = template_data["registration/verification_email_subject.txt"]();
	try {
		var email_send = await send_email(user.email, subject, template_data["registration/verification_email.txt"]({
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

	serve(HTML("registration/verify_email.html"));
}