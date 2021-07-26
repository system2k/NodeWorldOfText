function searchRankLevel(rankCache, level) {
	for(var i in rankCache) {
		if(rankCache[i].level == level) return rankCache[i];
	}
	return false;
}

module.exports.GET = async function(req, serve, vars, evars, params) {
	var HTML = evars.HTML;
	var user = evars.user;

	var dispage = vars.dispage;
	var ranks_cache = vars.ranks_cache;

	if(!user.superuser) {
		return await dispage("404", null, req, serve, vars, evars);
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

	var data = {
		misc_ranks,
		rank_order: JSON.stringify(rank_order)
	};

	serve(HTML("administrator_manage_ranks.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var user = evars.user;

	var db_misc = vars.db_misc;
	var ranks_cache = vars.ranks_cache;

	if(!user.superuser) return;

	var action = post_data.action;

	if(action == "update") {
		var order = JSON.parse(post_data.order);
		var ranks = JSON.parse(post_data.ranks);

		var ids = ranks_cache.ids;

		if(!Array.isArray(order)) return serve("PARAM");
		if(order.length != ids.length) return serve("ORDER_RACE");
		var orderParamTotal = 0;
		// check if the id array from the client doesn't contain all of the ids,
		// or contains multiple instances of the same id.
		for(var i = 0; i < order.length; i++) {
			var elm = order[i];
			var pos = ids.indexOf(elm);
			if(pos == -1) return serve("ORDER_RACE");
			if(pos > -1) orderParamTotal++;
		}
		if(orderParamTotal != order.length) {
			return serve("ORDER_RACE");
		}

		for(var i = 0; i < ids.length; i++) {
			var id = ids[i];
			if(!ranks[id]) serve("ORDER_RACE");
			if(typeof ranks[id] != "object") return serve("PARAM");
			if(Array.isArray(ranks[id])) return serve("PARAM");
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

		return serve("SUCCESS");

	} else if(action == "add") {
		var name = post_data.name;
		var cc = post_data.cc;

		var newId = await db_misc.get("SELECT value FROM properties WHERE key=?", "max_rank_id");
		if(!newId) return serve("CRITICAL");
		newId = newId.value;

		await db_misc.run("UPDATE properties SET value=? WHERE key=?", [newId + 1, "max_rank_id"]);

		var newLevel = await db_misc.get("SELECT value FROM properties WHERE key=?", "rank_next_level");
		if(!newLevel) return serve("CRITICAL");
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

		return serve("SUCCESS");
	}

	serve("ACTION");
}