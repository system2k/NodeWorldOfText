window.OWOTSearchUtil = true;
w.on("fetch", function(data) {
	var tiles = data.tiles;
	var tileCount = Object.keys(tiles).length;
	for(var i = 0; i < searchAwaitingBlocks.length; i++) {
		var context = searchAwaitingBlocks[i];
		var x1 = context[0];
		var y1 = context[1];
		var x2 = context[2];
		var y2 = context[3];
		var res = context[4];
		var areaSize = (x2 - x1 + 1) * (y2 - y1 + 1);
		if(tileCount != areaSize) continue;
		var isNotVerified = false;
		for(var tpos in tiles) {
			var pos = tpos.split(",");
			var tileX = parseInt(pos[1]);
			var tileY = parseInt(pos[0]);
			var inRange = x1 <= tileX && tileX <= x2 && y1 <= tileY && tileY <= y2;
			if(!inRange) {
				isNotVerified = true;
				break;
			}
		}
		if(isNotVerified) continue;
		searchAwaitingBlocks.splice(i, 1);
		i--;
		res(tiles);
	}
});
var searchAwaitingBlocks = [];
function searchGetBlock(x1, y1, x2, y2) {
	return new Promise(function(res) {
		network.fetch([{
			minX: x1, minY: y1,
			maxX: x2, maxY: y2
		}]);
		searchAwaitingBlocks.push([x1, y1, x2, y2, res]);
	});
}
function searchWait(ms) {
	return new Promise(function(res) {
		setTimeout(res, ms);
	});
}
function searchText(rows, text, startX) {
	var results = []; // [tileX, tileY, charX, charY]
	for(var r in rows) {
		var trow = rows[r];
		var tileY = parseInt(r);
		for(var y = 0; y < 8; y++) {
			var row = trow[y];
			var currentIndex = 0;
			while(true) {
				var lookup = row.indexOf(text, currentIndex);
				if(lookup == -1) break;
				currentIndex = lookup + text.length;
				results.push([
					startX + Math.floor(lookup / 16), tileY,
					lookup % 16, y
				]);
			}
		}
	}
	return results;
}
function searchHighlightResult(tileX, tileY, charX, charY, length) {
	var coords = [];
	var tilesLoaded = true;
	for(var i = 0; i < length; i++) {
		coords.push([tileX, tileY, charX, charY]);
		if(!Tile.loaded(tileX, tileY)) {
			tilesLoaded = false;
		}
		charX++;
		if(charX >= 16) {
			charX = 0;
			tileX++;
		}
	}
	if(!tilesLoaded) {
		var loadTimeout;
		var loadInterval = setInterval(function() {
			var loaded = true;
			for(var i = 0; i < coords.length; i++) {
				if(!Tile.loaded(coords[i][0], coords[i][1])) {
					loaded = false;
				}
			}
			if(loaded) {
				clearInterval(loadInterval);
				clearTimeout(loadTimeout);
				highlight(coords, true);
			}
		}, 1000 / 4);
		loadTimeout = setTimeout(function() {
			clearInterval(loadInterval);
		}, 5000);
	} else {
		highlight(coords, true);
	}
}
function searchTeleportTo(tileX, tileY, charX, charY, length) {
	var posX = tileX * 16 + charX + Math.floor(length / 2);
	var posY = tileY * 8 + charY;
	w.doGoToCoord(-(posY / (8 * 4)), posX / (16 * 4));
	searchHighlightResult(tileX, tileY, charX, charY, length);
}
async function searchLookup(conf, progress_cb) {
	var text = conf.text;
	var pos = w.getCenterCoords();
	var tileX = Math.floor(pos[1]);
	var tileY = Math.floor(pos[0]);
	var blockSize = 20;
	var startX = tileX - 25;
	var startY = tileY - 25;
	var endX = tileX + 25;
	var endY = tileY + 25;
	var areaWidth = endX - startX + 1;
	var areaHeight = endY - startY + 1;
	var areaSegWidth = Math.ceil(areaWidth / blockSize);
	var areaSegHeight = Math.ceil(areaHeight / blockSize);
	var areaSegTotal = areaSegWidth * areaSegHeight;
	var lastReq = 0;
	var reqCount = 0;
	var searchData = [];
	for(var y = 0; y < areaSegHeight; y++) {
		var rows = {};
		for(var x = 0; x < areaSegWidth; x++) {
			var x1 = startX + (x * blockSize);
			var y1 = startY + (y * blockSize);
			var x2 = x1 + blockSize - 1;
			var y2 = y1 + blockSize - 1;
			if(x2 > endX) x2 = endX;
			if(y2 > endY) y2 = endY;
			var time = Date.now();
			var timeDiff = time - lastReq;
			if(timeDiff >= 0 && timeDiff < 600) {
				await searchWait(600 - timeDiff);
			}
			var tiles = await searchGetBlock(x1, y1, x2, y2);
			lastReq = Date.now();
			reqCount++;
			if(typeof progress_cb == "function") {
				progress_cb(reqCount / areaSegTotal);
			}
			for(var ty = y1; ty <= y2; ty++) {
				if(!rows[ty]) {
					rows[ty] = ["", "", "", "", "", "", "", ""];
				}
				var row = rows[ty];
				for(var tx = x1; tx <= x2; tx++) {
					var cont = tiles[ty + "," + tx];
					if(!cont) {
						for(var by = 0; by < 8; by++) {
							row[by] += " ".repeat(16);
						}
						continue;
					}
					if(!conf.norm) {
						cont = w.split(cont.content);
					} else {
						cont = w.split(cont.content, false, false, true);
					}
					for(var cx = 0; cx < 128; cx++) {
						var rowNum = Math.floor(cx / 16);
						row[rowNum] += cont[cx].toLowerCase();
					}
				}	
			}
		}
		var search = searchText(rows, text, startX);
		for(var i = 0; i < search.length; i++) {
			searchData.push(search[i]);
		}
	}
	return searchData;
}