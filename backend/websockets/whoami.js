module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var accountSystem = server.accountSystem;

	var res = {
		user_login: null,
		user_disp: null
	};

	if(user.authenticated) {
		res.user_login = user.username;

		if(accountSystem == "uvias") {
			res.user_disp = user.display_username;
		} else {
			res.user_disp = user.username;
		}
	}

	send(res);
}
