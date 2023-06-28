var utils = require("../../utils/utils.js");
var checkURLParam = utils.checkURLParam;

var world_mgr = require("../../subsystems/world_mgr.js");
var releaseWorld = world_mgr.releaseWorld;
var getOrCreateWorld = world_mgr.getOrCreateWorld;

async function iterateWorld(db, worldId, onTile) {
	var groupSize = 16;
	var initPos = await db.get("SELECT tileX, tileY FROM tile WHERE world_id=? LIMIT 1", [worldId]);
	if(!initPos) return;
	var posX = initPos.tileX - 1; // start before the first tile
	var posY = initPos.tileY;
	while(true) {
		var td = await db.all("SELECT * FROM tile WHERE world_id=? AND (tileY, tileX) > (?, ?) LIMIT ?", [worldId, posY, posX, groupSize]);
		if(!td.length) return;
		for(var t = 0; t < td.length; t++) {
			var tile = td[t];
			var resp = await onTile(tile);
			if(resp == -1) return;
		}
		if(td.length < groupSize) return; // last batch
		var lastTile = td[td.length - 1];
		posX = lastTile.tileX;
		posY = lastTile.tileY;
	}
}

function sanitize_world_filename(input) {
	var rSlash = /\//g;
	var rIllegal = /[\/\?<>\\:\*\|":]/g;
	var rControl = /[\x00-\x1f\x80-\x9f]/g;
	return input.replace(rSlash, "$").replace(rIllegal, "_").replace(rControl, "_");
}

module.exports.GET = async function(req, write, server, ctx) {
	var path = ctx.path;
	var user = ctx.user;
	var setCallback = ctx.setCallback;

	var callPage = server.callPage;
	var db = server.db;

	var world_name = checkURLParam("/accounts/download/*world", path).world;

	var world = await getOrCreateWorld(world_name);
	if(!world) {
		return await callPage("404", null, req, write, server, ctx);
	}

	setCallback(function() {
		releaseWorld(world);
	});

	// not a superuser nor owner
	var is_owner = world.ownerId == user.id;
	if(!(user.superuser || is_owner)) {
		return await callPage("404", null, req, write, server, ctx);
	}

	write.startStream();

	// set up headers
	write(null, null, {
		mime: "application/json; charset=utf-8",
		download_file: "World_" + sanitize_world_filename(world_name) + ".json"
	});

	var firstTile = true;
	async function procTile(tile) {
		var data = JSON.stringify({
			content: tile.content,
			tileX: tile.tileX,
			tileY: tile.tileY,
			properties: tile.properties,
			writability: tile.writability,
			created_at: tile.created_at
		});
		if(!firstTile) data = "," + data;
		firstTile = false;
		if(await write.writeStream(data)) return -1; // aborted
	}

	if(await write.writeStream("[")) return;
	await iterateWorld(db, world.id, procTile);
	if(await write.writeStream("]")) return;

	write.endStream();
}