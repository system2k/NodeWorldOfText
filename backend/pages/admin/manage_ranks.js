function searchRankLevel(rankCache, level) {
	for(var i in rankCache) {
		if(rankCache[i].level == level) return rankCache[i];
	}
	return false;
}

module.exports.GET = async function(req, write, server, ctx, params) {
	var render = ctx.render;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var ranks_cache = server.ranks_cache;
	var createCSRF = server.createCSRF;

	if(!user.superuser) {
		return await callPage("404");
	}

	var rankCount = ranks_cache.count;
	var misc_ranks = [];

	for(var i = 0; i < rankCount; i++) {
		var rank = searchRankLevel(ranks_cache, i + 4);
		if(!rank) continue;
		misc_ranks.push(rank);
	}

	var rank_order = [];
	for(var i = 0; i < misc_ranks.length; i++) {
		var mr = misc_ranks[i];
		rank_order.push(mr.id);
	}

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		misc_ranks,
		rank_order: JSON.stringify(rank_order),
		csrftoken
	};

	write(render("administrator_manage_ranks.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;

	var db_misc = server.db_misc;
	var ranks_cache = server.ranks_cache;
	var checkCSRF = server.checkCSRF;

	if(!user.superuser) return;

	var csrftoken = req.headers["x-csrf-token"];
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed");
	}

	var action = post_data.action;

	if(action == "update") {
		var order = JSON.parse(post_data.order);
		var ranks = JSON.parse(post_data.ranks);

		var ids = ranks_cache.ids;

		if(!Array.isArray(order)) return write("PARAM");
		if(order.length != ids.length) return write("ORDER_RACE");
		var orderParamTotal = 0;
		// check if the id array from the client doesn't contain all of the ids,
		// or contains multiple instances of the same id.
		for(var i = 0; i < order.length; i++) {
			var elm = order[i];
			var pos = ids.indexOf(elm);
			if(pos == -1) return write("ORDER_RACE");
			if(pos > -1) orderParamTotal++;
		}
		if(orderParamTotal != order.length) {
			return write("ORDER_RACE");
		}

		for(var i = 0; i < ids.length; i++) {
			var id = ids[i];
			if(!ranks[id]) write("ORDER_RACE");
			if(typeof ranks[id] != "object") return write("PARAM");
			if(Array.isArray(ranks[id])) return write("PARAM");
		}
		for(var i = 0; i < ids.length; i++) {
			var id = ids[i];
			var rank = ranks[id];

			var name = rank.name;
			var cc = rank.cc;

			ranks_cache[id].name = name;
			ranks_cache[id].chat_color = cc;

			await db_misc.run("UPDATE ranks SET name=?, props=? WHERE id=?", [name, JSON.stringify({
				chat_color: cc
			}), id]);
		}

		for(var i = 0; i < order.length; i++) {
			var ord_id = order[i];
			ranks_cache[ord_id].level = i + 4;
			await db_misc.run("UPDATE ranks SET level=? WHERE id=?", [i + 4, ord_id]);
		}

		return write("SUCCESS");

	} else if(action == "add") {
		var name = post_data.name;
		var cc = post_data.cc;

		var newId = await db_misc.get("SELECT value FROM properties WHERE key=?", "max_rank_id");
		if(!newId) return write("CRITICAL");
		newId = newId.value;

		await db_misc.run("UPDATE properties SET value=? WHERE key=?", [newId + 1, "max_rank_id"]);

		var newLevel = await db_misc.get("SELECT value FROM properties WHERE key=?", "rank_next_level");
		if(!newLevel) return write("CRITICAL");
		newLevel = newLevel.value;

		await db_misc.run("UPDATE properties SET value=? WHERE key=?", [newLevel + 1, "rank_next_level"]);

		await db_misc.run("INSERT INTO ranks VALUES(?, ?, ?, ?)", [newId, newLevel, name, JSON.stringify({
			chat_color: cc
		})]);

		ranks_cache[newId] = {
			id: newId,
			level: newLevel,
			name,
			chat_color: cc
		}

		ranks_cache.count++;
		ranks_cache.ids.push(newId);

		return write("SUCCESS");
	}

	write("ACTION");
}