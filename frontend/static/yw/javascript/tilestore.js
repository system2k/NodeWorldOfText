function coordsToString(coords) {
	return coords.tileY + "," + coords.tileX;
}

function stringToCoords(tileYX) {
	var _a = tileYX.split(","),
		tileY = _a[0],
		tileX = _a[1];
	return {
		tileY: Number(tileY),
		tileX: Number(tileX)
	};
}
var TILE_YX_ATTR = "data-tileYX";
var TileStore = (function() {
	function TileStore(_config) {
		var _this = this;
		this._config = _config;
		this.createTileContainer = function(coords, initTop, initLeft) {
			var tileContainer = document.createElement("div");
			var tileYX = coordsToString(coords);
			var $tileContainer = $(tileContainer);
			$tileContainer.attr(TILE_YX_ATTR, tileYX);
			$tileContainer.addClass("tilecont");
			$tileContainer.css("top", initTop);
			$tileContainer.css("left", initLeft);
			return tileContainer;
		};
		this.createTile = function(coords, container, initTop, initLeft) {
			var tileContainer = _this.createTileContainer(coords, initTop, initLeft);
			var tile = new Tile(coords, _this._config, tileContainer);
			_this.rememberTile(coords, tile);
			_this.numTiles++;
			return tile;
		};
		this.deleteMultipleTiles = function(tilesToBeDeleted) {
			var i;
			var tilesToBeDeletedLength = tilesToBeDeleted.length;
			for (i = 0; i < tilesToBeDeletedLength; i++) {
				_this.deleteTile(tilesToBeDeleted[i]);
			}
		};
		this.numTiles = 0;
		this.tileByCoord = {};
	}
	TileStore.prototype.getTile = function(coords) {
		var tileYX = coordsToString(coords);
		var tile = this.tileByCoord[tileYX];
		if (!tile) {
			throw new Error("Could not find expected tile " + tileYX);
		}
		return tile;
	};
	TileStore.prototype.softGetTile = function(coords) {
		var tileYX = coordsToString(coords);
		return this.tileByCoord[tileYX];
	};
	TileStore.prototype.deleteTile = function(coords) {
		var tile = this.getTile(coords);
		var tileYX = coordsToString(coords);
		delete this.tileByCoord[tileYX];
		tile.remove();
		this.numTiles--;
	};
	TileStore.prototype.getTileByCoord = function() {
		return this.tileByCoord;
	};
	TileStore.prototype.rememberTile = function(coords, tile) {
		var tileYX = coordsToString(coords);
		if (this.tileByCoord[tileYX]) {
			throw new Error("Recording same tile twice.");
		}
		this.tileByCoord[tileYX] = tile;
	};
	return TileStore;
}());