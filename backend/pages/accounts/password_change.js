module.exports.GET = async function(req, write, server, ctx, params) {
	var cookies = ctx.cookies;
	var render = ctx.render;
	var user = ctx.user;

	if(!user.authenticated) {
		return write(null, null, {
			redirect: "/accounts/login/?next=/accounts/password_change/"
		});
	}

	var data = {
		csrftoken: cookies.csrftoken,
		error: params.error
	};

	write(render("password_change.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;

	var db = server.db;
	var dispage = server.dispage;
	var checkHash = server.checkHash;
	var encryptHash = server.encryptHash;

	if(!user.authenticated) return;

	var old_pass = post_data.old_password;
	var confirm_pass_1 = post_data.new_password1;
	var confirm_pass_2 = post_data.new_password2;

	var old_hash = (await db.get("SELECT password FROM auth_user WHERE username=? COLLATE NOCASE",
		user.username)).password;

	var valid = checkHash(old_hash, old_pass);
	if(!valid) {
		return await dispage("accounts/password_change", {
			error: "Your old password was entered incorrectly. Please enter it again."
		}, req, write, server, ctx);
	}

	if(confirm_pass_1 != confirm_pass_2) {
		return await dispage("accounts/password_change", {
			error: "The passwords do not match."
		}, req, write, server, ctx);
	}

	if(confirm_pass_1.length < 3 || confirm_pass_1.length > 128) {
		return await dispage("accounts/password_change", {
			error: "The new password must be 3 - 128 characters."
		}, req, write, server, ctx);
	}

	var new_hash = encryptHash(confirm_pass_1);

	await db.run("UPDATE auth_user SET password=? WHERE id=?", [new_hash, user.id]);

	write(null, null, {
		redirect: "/accounts/password_change/done/"
	});
}