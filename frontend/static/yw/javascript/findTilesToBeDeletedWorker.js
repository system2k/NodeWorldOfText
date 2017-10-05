onmessage = function(e) {
	var parsedData = JSON.parse(e.data);
	var tileByCoord = parsedData.tileByCoord;
	var bounds = parsedData.bounds;
	var tilesToBeDeleted = [];
	for (var tileYX in tileByCoord) {
		var _a = tileYX.split(','),
			tileY = _a[0],
			tileX = _a[1];
		if (tileY < bounds.minY || tileY > bounds.maxY || tileX < bounds.minX || tileX > bounds.maxX) {
			tilesToBeDeleted.push({
				tileY: tileY,
				tileX: tileX
			});
		}
	}
	postMessage(tilesToBeDeleted);
};