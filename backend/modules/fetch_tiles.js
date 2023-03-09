var WebSocket = require("ws");
var utils = require("../utils/utils.js");
var normalizeCacheTile = utils.normalizeCacheTile;
var advancedSplit = utils.advancedSplit;
var san_nbr = utils.san_nbr;

function partitionRectangle(rect) {
	var minY = rect.minY;
	var minX = rect.minX;
	var maxY = rect.maxY;
	var maxX = rect.maxX;

	var regWidth = maxX - minX + 1;
	var regHeight = maxY - minY + 1;

	if(!regWidth || !regHeight) {
		return [];
	}

	var res = [];

	var sectorWidth, sectorHeight;
	if(regWidth > 100) {
		sectorWidth = 100;
		sectorHeight = 1;
	} else {
		sectorWidth = regWidth;
		sectorHeight = Math.floor(100 / regWidth);
	}

	var divW = Math.ceil(regWidth / sectorWidth);
	var divH = Math.ceil(regHeight / sectorHeight);

	for(var y = 0; y < divH; y++) {
		for(var x = 0; x < divW; x++) {
			var x1 = minX + sectorWidth * x;
			var y1 = minY + sectorHeight * y;
			var x2 = Math.min(x1 + sectorWidth - 1, maxX);
			var y2 = Math.min(y1 + sectorHeight - 1, maxY);
			res.push([x1, y1, x2, y2]);
		}
	}

	return res;
}

module.exports = async function(data, server, params) {
	var world = params.world;

	var memTileCache = server.memTileCache;
	var broadcastMonitorEvent = server.broadcastMonitorEvent;
	var tile_fetcher = server.tile_fetcher;

	var tiles = {};
	var fetchRectLimit = 50;
	var totalAreaLimit = 5000;

	var ipAddress;
	if(params.ws && params.ws.sdata) {
		ipAddress = params.ws.sdata.ipAddress;
	} else {
		ipAddress = params.ipAddress;
	}

	if(!Array.isArray(data.fetchRectangles)) return "Invalid parameters";
	var len = data.fetchRectangles.length;
	if(len >= fetchRectLimit) len = fetchRectLimit;
	var q_utf16 = data.utf16; // strip out surrogates and combining chars
	var q_array = data.array; // split content into array
	var q_content_only = data.content_only; // return an array of contents only
	var q_concat = data.concat; // (q_content_only required) return a string of joined contents, or array of joined contents (q_array)

	// if not null, return special value instead of object containing tiles
	var alt_return_obj = null;

	var total_area = 0;
	for(var v = 0; v < len; v++) {
		var rect = data.fetchRectangles[v];
		if(typeof rect != "object" || Array.isArray(rect) || rect == null) return "Invalid parameters";
		var minY = san_nbr(rect.minY);
		var minX = san_nbr(rect.minX);
		var maxY = san_nbr(rect.maxY);
		var maxX = san_nbr(rect.maxX);

		var tmp;
		if(minX > maxX) {
			tmp = minX;
			minX = maxX;
			maxX = tmp;
		}
		if(minY > maxY) {
			tmp = minY;
			minY = maxY;
			maxY = tmp;
		}
		
		var area = Math.abs(maxY - minY + 1) * Math.abs(maxX - minX + 1);
		if(area > 50 * 50) {
			return "Too many tiles";
		}

		total_area += area;

		if(total_area > totalAreaLimit) {
			return "Too many tiles";
		}

		var monPos = `minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}, area=${area}`;
		broadcastMonitorEvent("Fetch", ipAddress + " requested tiles on world '" + world.name + "' (" + world.id + "), " + monPos);

		rect.minY = minY;
		rect.minX = minX;
		rect.maxY = maxY;
		rect.maxX = maxX;
	}

	var fetchedTiles = {};
	for(var i = 0; i < len; i++) {
		var rect = partitionRectangle(data.fetchRectangles[i]);
		for(var x = 0; x < rect.length; x++) {
			var subRect = rect[x];

			// set all tiles to null first
			var x1 = subRect[0];
			var y1 = subRect[1];
			var x2 = subRect[2];
			var y2 = subRect[3];
			for(var ty = y1; ty <= y2; ty++) {
				for(var tx = x1; tx <= x2; tx++) {
					tiles[ty + "," + tx] = null;
				}
			}

			var tileData = await tile_fetcher.fetch(ipAddress, world.id, subRect, params.channel);
			if(params.ws && params.ws.readyState !== WebSocket.OPEN) {
				tile_fetcher.cancel(params.channel);
				return null;
			}
			// merge our fetched tiles together
			for(var t = 0; t < tileData.length; t++) {
				var tileX = tileData[t].tileX;
				var tileY = tileData[t].tileY;
				fetchedTiles[tileY + "," + tileX] = tileData[t];
			}
		}
	}

	// normalize the retrieved tiles
	// first - we must check the cache for more up-to-date tile data
	for(var i in tiles) {
		var pos = i.split(",");
		var tileX = parseInt(pos[1]);
		var tileY = parseInt(pos[0]);
		var dbTile = fetchedTiles[i];

		var properties, content;

		if(memTileCache[world.id] && memTileCache[world.id][tileY] && memTileCache[world.id][tileY][tileX]) {
			var memTile = memTileCache[world.id][tileY][tileX];
			var normTile = normalizeCacheTile(memTile);
			properties = normTile.properties;
			content = normTile.content;
		} else if(dbTile) {
			properties = JSON.parse(dbTile.properties);
			properties.writability = dbTile.writability;
			content = dbTile.content;
		} else {
			continue;
		}

		if(q_utf16) content = advancedSplit(content, true, true).join("");
		if(q_array) content = advancedSplit(content);

		tiles[i] = {
			content,
			properties
		};
	}

	// special parameters
	if(q_content_only) {
		if(q_concat) {
			if(q_array) {
				alt_return_obj = [];
			} else {
				alt_return_obj = "";
			}
			var joinedTiles = {};
			for(var i = 0; i < len; i++) {
				var reg = data.fetchRectangles[i];
				var x1 = reg.minX;
				var y1 = reg.minY;
				var x2 = reg.maxX;
				var y2 = reg.maxY;
				for(var ty = y1; ty <= y2; ty++) {
					for(var tx = x1; tx <= x2; tx++) {
						var pos = ty + "," + tx;
						var tile = tiles[pos];
						if(!tile) continue;
						if(joinedTiles[pos]) continue;
						joinedTiles[pos] = true;
						if(q_array) {
							alt_return_obj.push(...tile.content);
						} else {
							alt_return_obj += tile.content;
						}
					}
				}
			}
		} else {
			for(var i in tiles) {
				if(!tiles[i]) continue;
				tiles[i] = tiles[i].content;
			}
		}
	}

	if(alt_return_obj !== null) {
		return {
			data: alt_return_obj
		};
	}

	return tiles;
}