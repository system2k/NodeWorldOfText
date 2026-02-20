var utils = require("../utils/utils.js");
var san_nbr = utils.san_nbr;
var getClientIPByChatID = utils.getClientIPByChatID;

module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var world = ctx.world
	var chat_mgr = server.chat_mgr;
	var tell_blocks = chat_mgr.tell_blocks;

	var ipHeaderAddr = ws.sdata.ipAddress;
	var blocks = ws.sdata.chat_blocks;

	var id = san_nbr(data.id);
	if(id < 0) {
		if(data.block) {
			send({
				success: false,
				error: "bad_id"
			});
		}

		return;
	}

	var location = "";
	if(!(data.location == "global" || data.location == "page")) data.location = "page";
	location = data.location;

	if(data.block) {
		if ((blocks.id.length + blocks.user.length) >= 1280) {
			send({
				success: false,
				error: "too_many"
			});
			return;
		}

		if (blocks.id.indexOf(id) > -1) return;
		blocks.id.push(id);

		var blocked_ip = getClientIPByChatID(server, world.id, id, location == "global");
		if(blocked_ip) {
			var blist = tell_blocks[ipHeaderAddr];
			if(!blist) {
				blist = {};
				tell_blocks[ipHeaderAddr] = blist;
			}
			if(!blist[blocked_ip]) {
				blist[blocked_ip] = Date.now();
			}
		}

		send({
			success: true
		});
	} else {
		var idx = blocks.id.indexOf(id);
		if(idx == -1) return;
		blocks.id.splice(idx, 1);

		var unblocked_ip = getClientIPByChatID(server, world.id, id, location == "global");
		if(unblocked_ip) {
			var blist = tell_blocks[ipHeaderAddr];
			if(blist) {
				delete blist[unblocked_ip];
			}
		}
	}
}
