var utils = require("../../utils/utils.js");
var san_nbr = utils.san_nbr;

var validCategories = [
	"write", "load_tile",
	"color", "own_color",
	"chat", "chat_dm", "load_chat",
	"profile",
	"uc_picto", "uc_dot", "uc_nonletter", "own_uc_special",
	"no_captcha", "few_captcha",
	"pchat_anon"
];

var validStatuses = ["public", "authenticated", "whitelisted", "disabled"];

module.exports.GET = async function(req, write, server, ctx, params) {
	var user = ctx.user;
	var query_data = ctx.query_data;
	var db_misc = server.db_misc;
	var uvias = server.uvias;
	var accountSystem = server.accountSystem;
	var getUserIdFromUsername = server.getUserIdFromUsername;
	var getUsernameFromUserId = server.getUsernameFromUserId;
	var siteWhitelistStatus = server.siteWhitelistStatus;

	if(!user.superuser) {
		return write(null, 403);
	}

	var after =	query_data.after != undefined ? san_nbr(query_data.after) : 0;
	var limit = query_data.limit != undefined ? san_nbr(query_data.limit) : 250;
	var id_type = query_data.id_type != undefined ? query_data.id_type : null;
	var include_status = Boolean(query_data.include_status);
	limit = Math.min(Math.max(limit, 0), 250);

	var whitelistRules = await db_misc.all(`
		SELECT * FROM site_whitelist WHERE id > $id AND ($id_type IS NULL OR id_type=$id_type) LIMIT $limit
	`, {
		$id: after,
		$limit: limit,
		$id_type: id_type
	});
	for(let i = 0; i < whitelistRules.length; i++) {
		let rule = whitelistRules[i];
		if(rule.id_type == "user") {
			rule.username = await getUsernameFromUserId(rule.user_id);
		}
	}

	write(JSON.stringify({
		status: include_status ? Object.fromEntries(siteWhitelistStatus) : undefined,
		rules: whitelistRules
	}), null, {
		mime: "application/json"
	});
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;

	var db_misc = server.db_misc;
	var siteWhitelistStatus = server.siteWhitelistStatus;

	if(!user.superuser) {
		return await callPage("404");
	}

	var optionAdditionIdMapping = {};

	if(post_data.type == "features") {
		let changes = post_data.changes;
		for(let type in changes) {
			if(!validCategories.includes(type)) {
				continue;
			}
			let change = changes[type];
			if(!validStatuses.includes(change)) {
				continue;
			}
			await db_misc.all("UPDATE site_whitelist_status SET status=? WHERE code=?", [change, type]);
			siteWhitelistStatus.set(type, change);
		}

		write(JSON.stringify({}), null, {
			mime: "application/json"
		});
		
		return;
	} else if(post_data.type == "options") {
		let category = post_data.category;
		let changes = post_data.changes;
		let additions = post_data.additions;
		let removals = post_data.removals;
		
		for(let id in changes) {
			let updateSet = [];
			for(let type in changes[id]) {
				if(!validCategories.includes(type)) {
					continue;
				}
				let flag = Boolean(changes[id][type]) ? 1 : 0;
				updateSet.push(`${type}=${flag}`);
			}
			if(updateSet.length) {
				let query = updateSet.join(",");
				await db_misc.all(`UPDATE site_whitelist SET ${query} WHERE id=?`, id);
			}
		}

		for(let tid in additions) {
			let colSet = [];
			let valSet = [];

			let additionsObj = additions[tid];
			let options = additionsObj.options;

			for(let type in options) {
				if(!validCategories.includes(type)) {
					continue;
				}
				let flag = Boolean(options[type]) ? 1 : 0;
				colSet.push(type);
				valSet.push(flag);
			}
			if(category == "user") {
				colSet.push("id_type");
				valSet.push("user");

				colSet.push("user_id");
				valSet.push(additionsObj.user_id);
			} else if(category == "world") {
				colSet.push("id_type");
				valSet.push("world");

				colSet.push("world_name");
				valSet.push(additionsObj.world_name);
			} else if(category == "ip") {
				colSet.push("id_type");
				valSet.push("ip");

				colSet.push("ip");
				valSet.push(additionsObj.ip);
			} else {
				write(`Unknown category ${category}`, 400);
				return;
			}

			if(colSet.length) {
				let query = `INSERT INTO site_whitelist (${colSet.join(",")}) VALUES (${new Array(valSet.length).fill("?").join(",")})`;
				let resp = await db_misc.run(query, valSet);
				if(resp.lastID) {
					optionAdditionIdMapping[tid] = resp.lastID;
				}
			}
		}

		for(let id in removals) {
			await db_misc.run("DELETE FROM site_whitelist WHERE id=?", id);
		}

		write(JSON.stringify({
			additions: optionAdditionIdMapping
		}), null, {
			mime: "application/json"
		});

		return;
	}

	write("Unknown type", 400);
}