module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var user = ctx.user;
	var clientId = ws.sdata.clientId;
	var ranks_cache = server.ranks_cache;
	var accountSystem = server.accountSystem;

	var nick = "";
	if(data.nickname) {
		nick = data.nickname + "";
	}
	if(!user.staff) {
		nick = nick.slice(0, 40);
	} else {
		nick = nick.slice(0, 3030);
	}

	var username_to_display = user.username;
	if(accountSystem == "uvias") {
		username_to_display = user.display_username;
	}

	var chatData = {
		kind: "chat",
		nickname: nick,
		realUsername: username_to_display,
		id: clientId,
		message: "This message is visible to only you.",
		registered: user.authenticated,
		location: data.location,
		op: user.operator,
		admin: user.superuser,
		staff: user.staff,
		color: data.color
	};

	if(user.authenticated && user.id in ranks_cache.users) {
		var rank = ranks_cache[ranks_cache.users[user.id]];
		chatData.rankName = rank.name;
		chatData.rankColor = rank.chat_color;
	}

	send(chatData);
}
