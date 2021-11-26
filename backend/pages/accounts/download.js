var download_busy = {};

module.exports.startup_internal = function(vars) {
	intv = vars.intv;

	// periodically clear the list in case of a bug
	intv.downloadBusyCheck = setInterval(function() {
		for(var i in download_busy) {
			delete download_busy[i];
		}
	}, 1000 * 60 * 5);
}

module.exports.GET = async function(req, serve, vars, evars) {
	var path = evars.path;
	var user = evars.user;
	var setCallback = evars.setCallback;

	var dispage = vars.dispage;
	var checkURLParam = vars.checkURLParam;
	var db = vars.db;
	var filename_sanitize = vars.filename_sanitize;
	var getOrCreateWorld = vars.getOrCreateWorld;
	var releaseWorld = vars.releaseWorld;

	var world_name = checkURLParam("/accounts/download/*world", path).world;

	var world = await getOrCreateWorld(world_name);
	if(!world) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	setCallback(function() {
		releaseWorld(world);
		delete download_busy[user.id];
	});

	// not a superuser nor owner
	var is_owner = world.ownerId == user.id;
	if(!(user.superuser || is_owner)) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	if(is_owner && !user.superuser) {
		if(download_busy[user.id]) {
			return serve("You are already downloading a world. Please wait.");
		} else {
			download_busy[user.id] = true;
		}
	}

	var count = (await db.get("SELECT count(*) AS cnt FROM tile WHERE world_id=?", world.id)).cnt;

	if(count > 500000 && !user.superuser) {
		return serve("World is too large to download");
	}

	var groupSize = 2048;

	serve.startStream();

	// set up headers
	serve(null, null, {
		mime: "application/force-download; charset=utf-8",
		download_file: filename_sanitize("World_" + world_name + ".json")
	});

	var groups = Math.ceil(count / groupSize);
	var status = await serve.writeStream("[");
	if(status) return; // socket aborted
	var loopEnded = false;
	for(var i = 0; i < groups; i++) {
		var data = await db.all("SELECT * FROM tile WHERE world_id=? ORDER BY rowid LIMIT ?,?",
			[world.id, i * groupSize, groupSize]);
		if(!data || data.length == 0) {
			var status = await serve.writeStream("]");
			if(status) return; // socket aborted
			loopEnded = true;
			break;
		}
		var tileData = "";
		if(i != 0) tileData += ",";
		for(var t = 0; t < data.length; t++) {
			var tile = data[t];
			if(t != 0) tileData += ",";
			tileData += JSON.stringify({
				content: tile.content,
				tileX: tile.tileX,
				tileY: tile.tileY,
				properties: tile.properties,
				writability: tile.writability,
				created_at: tile.created_at
			});
		}
		var status = await serve.writeStream(tileData);
		if(status) return; // socket aborted
	}
	if(!loopEnded) {
		var status = await serve.writeStream("]");
		if(status) return; // socket aborted
	}

	serve.endStream();
}