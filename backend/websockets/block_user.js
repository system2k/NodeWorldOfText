module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var blocks = ws.sdata.chat_blocks;

	var username = data.username;
	if(typeof username != "string" || !username) {
		send({
			success: false,
			error: "bad_username"
		});
		return;
	}

	if(data.block) {
		if (!/^[^\s\x00-\x20]+$/.test(username)) return;

		// The case-insensitive value to be stored in chat_blocks.
		var username_value = username.toUpperCase();

		// Ensure maximum block count not exceeded, and check if it already exists.
		if ((blocks.id.length + blocks.user.length) >= 1280) {
			send({
				success: false,
				error: "too_many"
			});
			return;
		}

		if (blocks.user.indexOf(username_value) > -1) return;
		blocks.user.push(username_value);

		send({
			success: true
		});
	} else {
		var username_value = username.toUpperCase();

		var idx = blocks.user.indexOf(username_value);
		if(idx == -1) return;
		blocks.user.splice(idx, 1);
	}
}
