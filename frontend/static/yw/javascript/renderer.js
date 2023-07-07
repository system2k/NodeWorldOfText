var tilePixelCache = {};
var tileCanvasPool = [];
var renderQueue = [];
var renderQueueMap = new Map();
var canBypassRenderDefer = true;
var renderSerial = 1;

function isTileQueued(x, y) {
	var pos = y + "," + x;
	return renderQueueMap.has(pos);
}
function queueTile(x, y, highPriority) {
	if(isTileQueued(x, y)) return;
	var pos = y + "," + x;
	renderQueueMap.set(pos, true);
	if(highPriority) {
		renderQueue.unshift([x, y]);
	} else {
		renderQueue.push([x, y]);
	}
}

function createTilePool() {
	var pCanv = document.createElement("canvas");
	var pDims = getPoolDimensions(tileWidth, tileHeight);
	var pWidth = pDims[0] * tileWidth;
	var pHeight = pDims[1] * tileHeight;
	pCanv.width = pWidth;
	pCanv.height = pHeight;
	var pCtx = pCanv.getContext("2d");
	var pMap = {};
	var pool = {
		canv: pCanv,
		ctx: pCtx,
		map: pMap,
		tileWidth: tileWidth,
		tileHeight: tileHeight,
		maxWidth: pDims[0],
		maxHeight: pDims[1],
		width: 1,
		height: 1,
		size: 0
	};
	tileCanvasPool.push(pool);
	return pool;
}

function expandPool(pool) {
	if(pool.width < pool.maxWidth) {
		pool.width *= 2;
		if(pool.width > pool.maxWidth) {
			pool.width = pool.maxWidth;
		}
	} else if(pool.height < pool.maxHeight) {
		pool.height *= 2;
		if(pool.height > pool.maxHeight) {
			pool.height = pool.maxHeight;
		}
	} else {
		return;
	}
	
	var pCanv = document.createElement("canvas");
	var pWidth = pool.width * tileWidth;
	var pHeight = pool.height * tileHeight;
	pCanv.width = pWidth;
	pCanv.height = pHeight;
	var pCtx = pCanv.getContext("2d");
	pCtx.drawImage(pool.canv, 0, 0);

	pool.canv.height = 0;
	pool.canv = pCanv;
	pool.ctx = pCtx;
}

function locateAvailablePool() {
	var pObj, pTilePos;
	var pLocated = false;
	for(var i = 0; i < tileCanvasPool.length; i++) {
		var pool = tileCanvasPool[i];
		if(pool.tileWidth != tileWidth || pool.tileHeight != tileHeight) continue;
		var maxArea = pool.maxWidth * pool.maxHeight;
		if(pool.size >= maxArea) continue;
		var currentArea = pool.width * pool.height;
		if(pool.size >= currentArea) {
			// expand canvas
			expandPool(pool);
			currentArea = pool.width * pool.height;
		}
		var map = pool.map;
		for(var t = 0; t < currentArea; t++) {
			if(map[t]) continue;
			pLocated = true;
			pObj = pool;
			pTilePos = t;
			break;
		}
		if(pLocated) break;
	}
	if(!pLocated) {
		return null;
	}
	return {
		pool: pObj,
		index: pTilePos
	}
}

function allocateTile() {
	var pool, index;
	var poolObj = locateAvailablePool();
	if(poolObj) {
		pool = poolObj.pool;
		index = poolObj.index;
	} else {
		pool = createTilePool();
		index = 0;
	}
	var pMap = pool.map;
	pool.size++;
	var mapX = index % pool.width;
	var mapY = Math.floor(index / pool.width);
	var tileObj = {
		pool: pool,
		x: mapX,
		y: mapY,
		idx: index,
		poolX: mapX * tileWidth,
		poolY: mapY * tileHeight,
		clampW: tileWidth,
		clampH: tileHeight
	};
	pMap[index] = tileObj;
	return tileObj;
}

function deallocateTile(obj) {
	var pool = obj.pool;
	var idx = obj.idx;
	if(pool.map[idx]) {
		delete pool.map[idx];
		pool.size--;
	}
}

function reallocateTile(obj) {
	var pX = obj.poolX;
	var pY = obj.poolY;
	var pool = obj.pool;
	deallocateTile(obj);
	var newObj = allocateTile();
	var newPool = newObj.pool;
	var newPX = newObj.poolX;
	var newPY = newObj.poolY;
	// transfer rendered text data if it has moved to a new spot
	if(pX != newPX || pY != newPY || pool != newPool) {
		newPool.ctx.clearRect(newPX, newPY, tileWidth, tileHeight);
		newPool.ctx.drawImage(pool.canv, pX, pY, tileWidth, tileHeight, newPX, newPY, tileWidth, tileHeight);
	}
	return newObj;
}

function deletePool(pool) {
	var canv = pool.canv;
	canv.height = 0;
	delete pool.canv;
	for(var t in pool.map) {
		delete pool.map[t];
	}
}

function deleteEmptyPools() {
	for(var i = 0; i < tileCanvasPool.length; i++) {
		var pool = tileCanvasPool[i];
		if(pool.size == 0) {
			deletePool(pool);
			tileCanvasPool.splice(i, 1);
			i--;
		}
	}
}

function deleteAllPools() {
	for(var i = 0; i < tileCanvasPool.length; i++) {
		var pool = tileCanvasPool[i];
		deletePool(pool);
		tileCanvasPool.splice(i, 1);
		i--;
	}
}

function countTotalPoolPixels() {
	var pixels = 0;
	for(var i = 0; i < tileCanvasPool.length; i++) {
		var pool = tileCanvasPool[i];
		pixels += pool.canv.width * pool.canv.height;
	}
	return pixels;
}

function cleanupDirtyTiles() {
	for(var t in tilePixelCache) {
		var pos = getPos(t);
		var tileX = pos[1];
		var tileY = pos[0];
		var tileImage = loadTileFromPool(tileX, tileY, true);
		if(!Tile.visible(tileX, tileY)) {
			if(tileImage && (tileImage.pool.tileWidth != tileWidth || tileImage.pool.tileHeight != tileHeight)) {
				removeTileFromPool(tileX, tileY);
			}
			if(tileImage === null) {
				delete tilePixelCache[t];
			}
		}
	}
}

function markTileFromPoolAsEmpty(tileX, tileY) {
	var pos = tileY + "," + tileX;
	var poolTile = tilePixelCache[pos];
	if(poolTile) {
		removeTileFromPool(tileX, tileY);
	}
	tilePixelCache[pos] = null;
}

function loadTileFromPool(tileX, tileY, doNotCreate) {
	var pos = tileY + "," + tileX;
	var poolTile = tilePixelCache[pos];
	if(doNotCreate) {
		return poolTile;
	}
	if(poolTile && poolTile.pool.tileWidth == tileWidth && poolTile.pool.tileHeight == tileHeight) {
		return poolTile;
	}
	if(poolTile) {
		deallocateTile(poolTile);
		w.periodDeletedTiles++; // important for forcing cleanup
	}
	var newTile = allocateTile();
	tilePixelCache[pos] = newTile;
	return newTile;
}

function shiftAllTilesInPools() {
	if(tileCanvasPool.length <= 1) return;
	for(var tile in tilePixelCache) {
		var tp = tilePixelCache[tile];
		if(tp == null) continue;
		if(tp.pool.tileWidth == tileWidth && tp.pool.tileHeight == tileHeight) {
			tilePixelCache[tile] = reallocateTile(tp);
		}
	}
	deleteEmptyPools();
}

function removeTileFromPool(tileX, tileY) {
	var pos = tileY + "," + tileX;
	var tileObj = tilePixelCache[pos];
	delete tilePixelCache[pos];
	if(!tileObj) return;
	deallocateTile(tileObj);
	w.periodDeletedTiles++;
}

function removeAllTilesFromPools() {
	for(var tile in tilePixelCache) {
		var tileObj = tilePixelCache[tile];
		delete tilePixelCache[tile];
		if(tileObj) {
			deallocateTile(tileObj);
		}
	}
}

function getPoolDimensions(tileWidth, tileHeight) {
	var sizeX = Math.floor(1024 / tileWidth);
	var sizeY = Math.floor(1024 / tileHeight);
	if(sizeX < 1) sizeX = 1;
	if(sizeY < 1) sizeY = 1;
	return [sizeX, sizeY];
}

function getTileCoordsFromMouseCoords(x, y) {
	var tileX = 0;
	var tileY = 0;
	var charX = 0;
	var charY = 0;
	var mpX = x - positionX - Math.trunc(owotWidth / 2);
	var mpY = y - positionY - Math.trunc(owotHeight / 2);
	// add global cell position
	charX = Math.floor(mpX / cellW);
	charY = Math.floor(mpY / cellH);
	// add tile position
	tileX = Math.floor(charX / tileC);
	tileY = Math.floor(charY / tileR);
	// add in-tile cell position
	charX = charX - (Math.floor(charX / tileC) * tileC);
	charY = charY - (Math.floor(charY / tileR) * tileR);
	return [tileX, tileY, charX, charY];
}

function getTileScreenPosition(tileX, tileY) {
	var offsetX = tileX * tileW + Math.trunc(owotWidth / 2) + Math.floor(positionX);
	var offsetY = tileY * tileH + Math.trunc(owotHeight / 2) + Math.floor(positionY);
	return [offsetX, offsetY];
}

function getVisibleTileRange(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, owotHeight - 1 + margin);
	var startX = clipIntMax(A[0]);
	var startY = clipIntMax(A[1]);
	var endX = clipIntMax(B[0]);
	var endY = clipIntMax(B[1]);
	if(startX > endX || startY > endY || (B[0] - A[0] + 1) > 100000 || (B[1] - A[1] + 1) > 100000) {
		throw "Invalid ranges";
	}
	return [[startX, startY], [endX, endY]];
}

function getVisibleTiles(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, owotHeight - 1 + margin);
	return getRange(A[0], A[1], B[0], B[1]);
}

function getWidth(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, 0);
	return B[0] - A[0] + 1;
}

function getHeight(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0, 0 - margin);
	var B = getTileCoordsFromMouseCoords(0, owotHeight - 1 + margin);
	return B[1] - A[1] + 1;
}

function getArea(margin) {
	if(!margin) margin = 0;
	var A = getTileCoordsFromMouseCoords(0 - margin, 0 - margin);
	var B = getTileCoordsFromMouseCoords(owotWidth - 1 + margin, owotHeight - 1 + margin);
	return (B[0] - A[0] + 1) * (B[1] - A[1] + 1);
}

function tileAndCharsToWindowCoords(tileX, tileY, charX, charY) {
	var x = tileX * tileW;
	var y = tileY * tileH;
	x += charX * cellW;
	y += charY * cellH;
	x += positionX;
	y += positionY;
	x += Math.trunc(owotWidth / 2);
	y += Math.trunc(owotHeight / 2);
	return [Math.trunc(x / zoomRatio), Math.trunc(y / zoomRatio)];
}

function testCanvasForCrossOriginError() {
	if(!textRenderCtx) return;
	try {
		textRenderCtx.getImageData(0, 0, 1, 1);
		canBypassRenderDefer = true;
	} catch(e) {
		canBypassRenderDefer = false;
	}
}

var lcsShardCharVectors = [
	[[0,3],[1,4],[0,4],[0,3]],
	[[0,3],[2,4],[0,4],[0,3]],
	[[0,1],[1,4],[0,4],[0,1]],
	[[0,1],[2,4],[0,4],[0,1]],
	[[0,0],[1,4],[0,4],[0,0]],
	[[1,0],[2,0],[2,4],[0,4],[0,1],[1,0]],
	[[2,0],[2,4],[0,4],[0,1],[2,0]],
	[[1,0],[2,0],[2,4],[0,4],[0,3],[1,0]],
	[[2,0],[2,4],[0,4],[0,3],[2,0]],
	[[1,0],[2,0],[2,4],[0,4],[1,0]],
	[[2,1],[2,4],[0,4],[0,3],[2,1]],
	[[2,3],[2,4],[1,4],[2,3]],
	[[2,3],[2,4],[0,4],[2,3]],
	[[2,1],[2,4],[1,4],[2,1]],
	[[2,1],[2,4],[0,4],[2,1]],
	[[2,0],[2,4],[1,4],[2,0]],
	[[0,0],[1,0],[2,1],[2,4],[0,4],[0,0]],
	[[0,0],[2,1],[2,4],[0,4],[0,0]],
	[[0,0],[1,0],[2,3],[2,4],[0,4],[0,0]],
	[[0,0],[2,3],[2,4],[0,4],[0,0]],
	[[0,0],[1,0],[2,4],[0,4],[0,0]],
	[[0,1],[2,3],[2,4],[0,4],[0,1]],
	[[0,0],[2,0],[2,4],[1,4],[0,3],[0,0]],
	[[0,0],[2,0],[2,4],[0,3],[0,0]],
	[[0,0],[2,0],[2,4],[1,4],[0,1],[0,0]],
	[[0,0],[2,0],[2,4],[0,1],[0,0]],
	[[0,0],[2,0],[2,4],[1,4],[0,0]],
	[[0,0],[1,0],[0,1],[0,0]],
	[[0,0],[2,0],[0,1],[0,0]],
	[[0,0],[1,0],[0,3],[0,0]],
	[[0,0],[2,0],[0,3],[0,0]],
	[[0,0],[1,0],[0,4],[0,0]],
	[[0,0],[2,0],[2,1],[0,3],[0,0]],
	[[0,0],[2,0],[2,3],[1,4],[0,4],[0,0]],
	[[0,0],[2,0],[2,3],[0,4],[0,0]],
	[[0,0],[2,0],[2,1],[1,4],[0,4],[0,0]],
	[[0,0],[2,0],[2,1],[0,4],[0,0]],
	[[0,0],[2,0],[1,4],[0,4],[0,0]],
	[[1,0],[2,0],[2,1],[1,0]],
	[[0,0],[2,0],[2,1],[0,0]],
	[[1,0],[2,0],[2,3],[1,0]],
	[[0,0],[2,0],[2,3],[0,0]],
	[[1,0],[2,0],[2,4],[1,0]],
	[[0,0],[2,0],[2,3],[0,1],[0,0]],
	[[0,0],[2,0],[2,4],[0,4],[1,2],[0,0]],
	[[0,0],[1,2],[2,0],[2,4],[0,4],[0,0]],
	[[0,0],[2,0],[1,2],[2,4],[0,4],[0,0]],
	[[0,0],[2,0],[2,4],[1,2],[0,4],[0,0]],
	[[0,0],[1,2],[0,4],[0,0]],
	[[0,0],[2,0],[1,2],[0,0]],
	[[2,0],[2,4],[1,2],[2,0]],
	[[1,2],[2,4],[0,4],[1,2]],
	// skip (lcs)
	[[0,0],[2,4],[0,4],[2,0],[0,0]],
	[[2,0],[2,4],[0,0],[0,4],[2,0]],
	// box-drawing bold mode; four 90-deg, four iso
	[[2,0],[2,4],[0,4],[2,0]], // 54
	[[0,0],[2,4],[0,4],[0,0]],
	[[0,0],[2,0],[0,4],[0,0]],
	[[0,0],[2,0],[2,4],[0,0]],
	[[1,0],[2,4],[0,4],[1,0]], // 58
	[[0,0],[2,2],[0,4],[0,0]],
	[[0,0],[2,0],[1,4],[0,0]],
	[[2,0],[2,4],[0,2],[2,0]] 
];

// 2x4 octant character lookup (relative char code -> bit pattern)
// range: 0x1CD00 - 0x1CDE5
var lcsOctantCharPoints = [
	4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
	32, 33, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
	55, 56, 57, 58, 59, 60, 61, 62, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78,
	79, 81, 82, 83, 84, 86, 87, 88, 89, 91, 92, 93, 94, 96, 97, 98, 99, 100, 101, 102, 103,
	104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
	122, 123, 124, 125, 126, 127, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
	141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158,
	159, 161, 162, 163, 164, 166, 167, 168, 169, 171, 172, 173, 174, 176, 177, 178, 179, 180,
	181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 193, 194, 195, 196, 197, 198, 199,
	200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217,
	218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235,
	236, 237, 238, 239, 241, 242, 243, 244, 246, 247, 248, 249, 251, 253, 254
];

var fracBlockTransforms = [
	// relative offset: 0x2580 (until 0x2590)
	[[2, 4/8],
	[3, 1/8],
	[3, 2/8],
	[3, 3/8],
	[3, 4/8],
	[3, 5/8],
	[3, 6/8],
	[3, 7/8],
	[0, 8/8],
	[0, 7/8],
	[0, 6/8],
	[0, 5/8],
	[0, 4/8],
	[0, 3/8],
	[0, 2/8],
	[0, 1/8],
	[1, 4/8]],

	// relative offset: 0x2594 (until 0x2595)
	[[2, 1/8],
	[1, 1/8]],
	
	// relative offset: 0x1FB82 (until 0x1FB8B)
	[[2, 2/8],
	[2, 3/8],
	[2, 5/8],
	[2, 6/8],
	[2, 7/8],
	[1, 2/8],
	[1, 3/8],
	[1, 5/8],
	[1, 6/8],
	[1, 7/8]]
];

function isValidSpecialSymbol(charCode) {
	if(charCode >= 0x2580 && charCode <= 0x2590) return true;
	if(charCode >= 0x2594 && charCode <= 0x259F) return true;
	if(charCode >= 0x25E2 && charCode <= 0x25E5) return true;
	if(charCode >= 0x1CD00 && charCode <= 0x1CDE5) return true;
	if(charCode >= 0x1FB00 && charCode <= 0x1FB3B) return true;
	if(charCode >= 0x1FB3C && charCode <= 0x1FB6F) return true;
	if(charCode >= 0x1FB82 && charCode <= 0x1FB8B) return true;

	switch(charCode) {
		case 0x25B2: return true;
		case 0x25BA: return true;
		case 0x25BC: return true;
		case 0x25C4: return true;
		case 0x1CEA0: return true;
		case 0x1CEA3: return true;
		case 0x1CEA8: return true;
		case 0x1CEAB: return true;
		case 0x1FB9A: return true;
		case 0x1FB9B: return true;
		case 0x1FBE6: return true;
		case 0x1FBE7: return true;
	}

	return false;
}

function draw2by2Char(charCode, textRender, x, y, width, height) {
	// relative offset: 0x2596 - 0x259F
	var pattern = [2, 1, 8, 11, 9, 14, 13, 4, 6, 7][charCode - 0x2596];
	textRender.beginPath();
	if(pattern & 8) textRender.rect(x, y, width / 2, height / 2);
	if(pattern & 4) textRender.rect(x + width / 2, y, width / 2, height / 2);
	if(pattern & 2) textRender.rect(x, y + height / 2, width / 2, height / 2);
	if(pattern & 1) textRender.rect(x + width / 2, y + height / 2, width / 2, height / 2);
	textRender.fill();
}

function draw2by3Char(charCode, textRender, x, y, width, height) {
	var code = 0;
	if(charCode >= 0x1FB00 && charCode <= 0x1FB13) code = charCode - 0x1FB00 + 1;
	if(charCode >= 0x1FB14 && charCode <= 0x1FB27) code = charCode - 0x1FB00 + 2;
	if(charCode >= 0x1FB28 && charCode <= 0x1FB3B) code = charCode - 0x1FB00 + 3;
	textRender.beginPath();
	for(var i = 0; i < 6; i++) {
		if(!(code >> i & 1)) continue;
		textRender.rect(x + (width / 2) * (i & 1), y + (height / 3) * (i >> 1), width / 2, height / 3);
	}
	textRender.fill();
}

function drawTriangleShardChar(charCode, textRender, x, y, width, height) {
	var is90degTri = charCode >= 0x25E2 && charCode <= 0x25E5;
	var isIsoTri = charCode == 0x25B2 || charCode == 0x25BA || charCode == 0x25BC || charCode == 0x25C4;

	var vecIndex = charCode - 0x1FB3C;
	if(charCode >= 0x1FB9A && charCode <= 0x1FB9B) {
		vecIndex -= 42;
	} else if(is90degTri) {
		vecIndex = (charCode - 0x25E2) + 54;
	} else if(isIsoTri) {
		switch(charCode) {
			case 0x25B2: vecIndex = 58; break;
			case 0x25BA: vecIndex = 59; break;
			case 0x25BC: vecIndex = 60; break;
			case 0x25C4: vecIndex = 61; break;
		}
	}
	var vecs = lcsShardCharVectors[vecIndex];
	var gpX = [0, width / 2, width];
	var gpY = [0, height / 3, height / 2, (height / 3) * 2, height];
	textRender.beginPath();
	for(var i = 0; i < vecs.length; i++) {
		var vec = vecs[i];
		var gx = gpX[vec[0]];
		var gy = gpY[vec[1]];
		if(i == 0) {
			textRender.moveTo(x + gx, y + gy);
		} else {
			textRender.lineTo(x + gx, y + gy);
		}
	}
	textRender.closePath();
	textRender.fill();
}

function draw2by4Char(charCode, textRender, x, y, width, height) {
	var code = 0;
	if(charCode >= 0x1CD00 && charCode <= 0x1CDE5) {
		code = lcsOctantCharPoints[charCode - 0x1CD00];
	} else {
		switch(charCode) {
			case 0x1CEA8: code = 1; break;
			case 0x1CEAB: code = 2; break;
			case 0x1CEA3: code = 64; break;
			case 0x1CEA0: code = 128; break;
			case 0x1FBE6: code = 20; break;
			case 0x1FBE7: code = 40; break;
		}
	}
	if(!code) return false;
	textRender.beginPath();
	for(var py = 0; py < 4; py++) {
		for(var px = 0; px < 2; px++) {
			var idx = py * 2 + px;
			if(code >> idx & 1) {
				textRender.rect(x + px * (width / 2), y + py * (height / 4), width / 2, height / 4);
			}
		}
	}
	textRender.fill();
}

function drawFractionalBlockChar(charCode, textRender, x, y, width, height) {
	var transform = null;
	// basic fractional blocks
	if(charCode >= 0x2580 && charCode <= 0x2590) {
		transform = fracBlockTransforms[0][charCode - 0x2580];
	} else if(charCode >= 0x2594 && charCode <= 0x2595) {
		transform = fracBlockTransforms[1][charCode - 0x2594];
	} else if(charCode >= 0x1FB82 && charCode <= 0x1FB8B) {
		transform = fracBlockTransforms[2][charCode - 0x1FB82];
	}
	if(!transform) return;

	var dir = transform[0];
	var frac = transform[1];
	var x2 = x + width - 1;
	var y2 = y + height - 1;

	switch(dir) {
		case 0: x2 -= width - (width * frac); break;
		case 1: x += width - (width * frac); break;
		case 2: y2 -= height - (height * frac); break;
		case 3: y += height - (height * frac); break;
	}

	textRender.fillRect(x, y, x2 - x + 1, y2 - y + 1);
}

function drawBlockChar(charCode, textRender, x, y, clampW, clampH) {
	// since the char grid varies on other zoom levels, we must account for it to avoid line artifacts
	var tmpCellW = clampW / tileC;
	var tmpCellH = clampH / tileR;
	var sx = Math.floor(x * tmpCellW);
	var sy = Math.floor(y * tmpCellH);
	var ex = Math.floor((x + 1) * tmpCellW);
	var ey = Math.floor((y + 1) * tmpCellH);
	tmpCellW = ex - sx;
	tmpCellH = ey - sy;

	var isFractionalBlock = (charCode >= 0x2580 && charCode <= 0x2590) ||
							(charCode >= 0x2594 && charCode <= 0x2595) ||
							(charCode >= 0x1FB82 && charCode <= 0x1FB8B);
	var is2by2 = charCode >= 0x2596 && charCode <= 0x259F;
	var is2by3 = charCode >= 0x1FB00 && charCode <= 0x1FB3B;
	var is2by4 = (charCode >= 0x1CD00 && charCode <= 0x1CDE5) ||
					charCode == 0x1CEA8 || charCode == 0x1CEAB || charCode == 0x1CEA3 || 
					charCode == 0x1CEA0 || charCode == 0x1FBE6 || charCode == 0x1FBE7;
	var is90degTri = charCode >= 0x25E2 && charCode <= 0x25E5;
	var isIsoTri = charCode == 0x25B2 || charCode == 0x25BA || charCode == 0x25BC || charCode == 0x25C4;
	var isTriangleShard = (charCode >= 0x1FB3C && charCode <= 0x1FB6F) ||
							(charCode >= 0x1FB9A && charCode <= 0x1FB9B) ||
							(is90degTri || isIsoTri);

	if(isFractionalBlock) { // basic fractional blocks (full, half, n/8)
		drawFractionalBlockChar(charCode, textRender, sx, sy, tmpCellW, tmpCellH);
	} else if(is2by2) { // 2x2 blocks
		draw2by2Char(charCode, textRender, sx, sy, tmpCellW, tmpCellH);
	} else if(is2by3) { // 2x3 blocks
		draw2by3Char(charCode, textRender, sx, sy, tmpCellW, tmpCellH);
	} else if(isTriangleShard) { // LCS shard characters
		drawTriangleShardChar(charCode, textRender, sx, sy, tmpCellW, tmpCellH);
	} else if(is2by4) { // 2x4 LCS octant characters
		draw2by4Char(charCode, textRender, sx, sy, tmpCellW, tmpCellH);
	}
}

function dispatchCharClientHook(cCode, textRender, str, x, y, clampW, clampH) {
	var funcs = specialClientHooks.renderchar;
	if(!funcs.length) return false;
	for(var i = 0; i < funcs.length; i++) {
		var func = funcs[i];
		var tilePos = getPos(str);
		// duplicate from drawBlockChar - needs refactoring
		var tmpCellW = clampW / tileC;
		var tmpCellH = clampH / tileR;
		var sx = Math.floor(x * tmpCellW);
		var sy = Math.floor(y * tmpCellH);
		var ex = Math.floor((x + 1) * tmpCellW);
		var ey = Math.floor((y + 1) * tmpCellH);
		tmpCellW = ex - sx;
		tmpCellH = ey - sy;
		var status = func(cCode, textRender, tilePos[1], tilePos[0], x, y, sx, sy, tmpCellW, tmpCellH);
		if(status) {
			return true;
		}
	}
	return false;
}

function renderChar(textRender, x, y, clampW, clampH, str, tile, writability, props, offsetX, offsetY, charOverflowMode) {
	var content = tile.content;
	var colors = tile.properties.color;
	var hasDrawn = false;

	// adjust baseline
	var textYOffset = cellH - (5 * zoom);

	var fontX = x * cellW + offsetX;
	var fontY = y * cellH + offsetY;

	var char = content[y * tileC + x] || " ";

	var deco = null;
	if(textDecorationsEnabled) {
		deco = getCharTextDecorations(char);
	}
	char = clearCharTextDecorations(char);
	char = resolveCharEmojiCombinations(char);

	var cCode = char.codePointAt(0);
	if(charOverflowMode) {
		if(cCode < 1024 && !deco) return;
		if(cCode == 0xFDFD) return;
		if(cCode >= 0x12427 && cCode <= 0x1242B) return;
	}

	// fill background if defined
	if(coloredChars[str] && coloredChars[str][y] && coloredChars[str][y][x]) {
		var color = coloredChars[str][y][x];
		if(Array.isArray(color)) {
			color = color[color.length - 1];
		}
		color = colorClasses[color];
		textRender.fillStyle = color;
		textRender.fillRect(fontX, fontY, cellW, cellH);
		hasDrawn = true;
	}

	var color = colors ? colors[y * tileC + x] : 0;
	// initialize link color to default text color in case there's no link to color
	var linkColor = styles.text;
	if(textColorOverride) {
		if(writability == 0 && textColorOverride & 4) linkColor = styles.public_text;
		if(writability == 1 && textColorOverride & 2) linkColor = styles.member_text;
		if(writability == 2 && textColorOverride & 1) linkColor = styles.owner_text;
	}

	var isLink = false;

	// check if this char is a link
	if(linksRendered && props[y] && props[y][x]) {
		var link = props[y][x].link;
		if(link) {
			isLink = true;
			if(link.type == "url") {
				linkColor = defaultURLLinkColor;
			} else if(link.type == "coord") {
				linkColor = defaultCoordLinkColor;
			}
		}
	}

	// if text has no color, use default text color. otherwise, colorize it
	if(color == 0 || !colorsEnabled || (isLink && !colorizeLinks)) {
		textRender.fillStyle = linkColor;
	} else {
		textRender.fillStyle = `rgb(${color >> 16 & 255},${color >> 8 & 255},${color & 255})`;
	}

	// x padding of text if the char width is > 10
	var XPadding = cellWidthPad * zoom;

	// underline link
	if(isLink) {
		textRender.fillRect(fontX, fontY + textYOffset + zoom, cellW, zoom);
		hasDrawn = true;
	}

	if(deco) {
		if(deco.under) {
			textRender.fillRect(fontX, fontY + textYOffset + zoom, cellW, zoom);
			hasDrawn = true;
		}
		if(deco.strike) {
			textRender.fillRect(fontX, fontY + Math.floor((16 * zoom) / 2), cellW, zoom);
			hasDrawn = true;
		}
	}

	if(((specialClientHookMap >> 0) & 1) && !charOverflowMode) {
		var status = dispatchCharClientHook(cCode, textRender, str, x, y, clampW, clampH);
		if(status) {
			return true;
		}
	}

	// don't render whitespaces
	if(char == "\u0020" || char == "\u00A0") return hasDrawn;

	if(!surrogateCharsEnabled || !combiningCharsEnabled) {
		char = w.split(char, !surrogateCharsEnabled, !combiningCharsEnabled);
		if(char.length) {
			char = char[0];
		} else {
			char = "?";
		}
	}

	var isBold = deco && deco.bold;
	var isItalic = deco && deco.italic;
	var isHalfShard = ((cCode >= 0x25E2 && cCode <= 0x25E5) ||
						cCode == 0x25B2 || cCode == 0x25C4 || cCode == 0x25BA || cCode == 0x25BC);
	var checkIdx = 1;
	if(char.codePointAt(0) > 65535) checkIdx = 2;
	var isSpecial = char.codePointAt(checkIdx) != void 0;
	isSpecial = isSpecial || (cCode >= 0x2500 && cCode <= 0x257F);

	if(ansiBlockFill && isValidSpecialSymbol(cCode) && !(isHalfShard && !isBold)) {
		if(!charOverflowMode) {
			drawBlockChar(cCode, textRender, x, y, clampW, clampH);
			hasDrawn = true;
		}
	} else { // character rendering
		var tempFont = null;
		var prevFont = null;
		if(isSpecial || deco) {
			prevFont = textRender.font;
			tempFont = textRender.font;
			if(isSpecial) tempFont = specialCharFont;
			if(isBold) tempFont = "bold " + tempFont;
			if(isItalic) tempFont = "italic " + tempFont;
			textRender.font = tempFont;
		}
		textRender.fillText(char, Math.round(fontX + XPadding), Math.round(fontY + textYOffset));
		hasDrawn = true;
		if(prevFont) {
			textRender.font = prevFont;
		}
	}
	return hasDrawn;
}

function drawGrid(renderCtx, gridColor, offsetX, offsetY, tileX, tileY) {
	if(subgridEnabled && zoom >= 0.3) {
		var b = 0xB9;
		if(zoom < 0.5) {
			b += (0xFF - b) * (0.5 - zoom) * 2;
		}
		b = Math.floor(b);
		renderCtx.strokeStyle = "rgb(" + b + ", " + b + ", " + b + ")";
		var dashSize = 1;
		renderCtx.setLineDash([dashSize]);
		renderCtx.lineWidth = dashSize;
		for(var x = 1; x < tileC; x++) {
			for(var y = 1; y < tileR; y++) {
				renderCtx.beginPath();
				renderCtx.moveTo(0, Math.floor(y * cellH) + 0.5);
				renderCtx.lineTo(tileW, Math.floor(y * cellH) + 0.5);
				renderCtx.stroke();
			}
			renderCtx.beginPath();
			renderCtx.moveTo(Math.floor(x * cellW) + 0.5, 0);
			renderCtx.lineTo(Math.floor(x * cellW) + 0.5, tileH);
			renderCtx.stroke();
		}
	}
	renderCtx.fillStyle = gridColor;
	renderCtx.fillRect(Math.floor(offsetX), Math.floor(offsetY), tileWidth, 1);
	renderCtx.fillRect(Math.floor(offsetX), Math.floor(offsetY), 1, tileHeight);
}

function drawObstructedCursor(renderCtx, content, curX, curY, offsetX, offsetY) {
	var idx = curY * tileC + curX;
	// if the char is a full block, force the cursor over it.
	if(content) {
		if(content[idx] == "\u2588") {
			renderCtx.fillStyle = styles.cursor;
			renderCtx.fillRect(offsetX + curX * cellW, offsetY + curY * cellH, cellW, cellH);
		}
	}
}

function getTileBackgroundColor(tile) {
	var writability = tile.properties.writability;
	if(writability == null) writability = state.worldModel.writability;
	
	if(tile.backgroundColor) {
		return tile.backgroundColor;
	}
	if(writability == 0) return styles.public;
	if(writability == 1) return styles.member;
	if(writability == 2) return styles.owner;
}

function renderTileBackground(renderCtx, offsetX, offsetY, tile, tileX, tileY, cursorVisibility) {
	var hasDrawn = false;
	renderCtx.fillStyle = getTileBackgroundColor(tile);

	var clamp, clampW, clampH;
	if(transparentBackground) {
		clamp = getTileScreenPosition(tileX + 1, tileY + 1);
		clampW = Math.floor(clamp[0]) - offsetX;
		clampH = Math.floor(clamp[1]) - offsetY;
	} else {
		// in opaque mode, the offsets are always (0, 0) within the text-render tile
		// in transparent mode, backgrounds are placed directly on the main canvas
		clampW = tileWidth;
		clampH = tileHeight;
	}

	// fill tile background color
	// in this case, we don't mark 'hasDrawn' as true since the bg drawing can be outsourced to a different component
	renderCtx.fillRect(offsetX, offsetY, clampW, clampH);

	// render char protections
	if(tile.properties.char && !tile.backgroundColor) {
		for(var p = 0; p < tileArea; p++) {
			var code = tile.properties.char[p]; // writability
			var cX = p % tileC;
			var cY = Math.floor(p / tileC);
			if(code != null) {
				if(code == 0) renderCtx.fillStyle = styles.public;
				if(code == 1) renderCtx.fillStyle = styles.member;
				if(code == 2) renderCtx.fillStyle = styles.owner;
				if(cellW >= 1 && cellH >= 1) {
					// clamp to next position in axis
					var tmpCellW = clampW / tileC;
					var tmpCellH = clampH / tileR;
					var sx = Math.floor(cX * tmpCellW);
					var sy = Math.floor(cY * tmpCellH);
					var x2 = Math.floor((cX + 1) * tmpCellW);
					var y2 = Math.floor((cY + 1) * tmpCellH);
					renderCtx.fillRect(offsetX + sx, offsetY + sy, x2 - sx, y2 - sy);
					hasDrawn = true;
				} else {
					renderCtx.fillRect(offsetX + cX * cellW, offsetY + cY * cellH, cellW, cellH);
					hasDrawn = true;
				}
			}
		}
	}

	if(guestCursorsEnabled) {
		var dCursor = renderGuestCursors(renderCtx, offsetX, offsetY, tile, tileX, tileY);
		if(dCursor) {
			hasDrawn = true;
		}
	}

	// render cursor
	if(cursorVisibility) {
		var charX = cursorCoords[2];
		var charY = cursorCoords[3];
		renderCtx.fillStyle = styles.cursor;
		renderCtx.fillRect(offsetX + charX * cellW, offsetY + charY * cellH, cellW, cellH);
		hasDrawn = true;
	}

	var highlight = highlightFlash[tileY + "," + tileX];
	if(highlight) { // highlighted edits
		for(var y = 0; y < tileR; y++) {
			for(var x = 0; x < tileC; x++) {
				if(highlight[y]) {
					if(highlight[y][x] !== void 0) {
						var flashRGB = highlight[y][x][1];
						renderCtx.fillStyle = "rgb(" + flashRGB[0] + "," + flashRGB[1] + "," + flashRGB[2] + ")";
						renderCtx.fillRect(offsetX + x * cellW, offsetY + y * cellH, cellW, cellH);
						hasDrawn = true;
					}
				}
			}
		}
	}
	return hasDrawn;
}

function renderTileBackgroundImage(renderCtx, tileX, tileY, ctxOffX, ctxOffY) {
	var startX = tileX * tileWidth;
	var startY = tileY * tileHeight;
	
	var backRatioW = tileWidth / dTileW;
	var backRatioH = tileHeight / dTileH;

	var imgWidth = backgroundPatternSize[0];
	var imgHeight = backgroundPatternSize[1];

	var repeat = w.backgroundInfo.rmod;
	var offX = w.backgroundInfo.x;
	var offY = w.backgroundInfo.y;
	var patWidth = w.backgroundInfo.w;
	var patHeight = w.backgroundInfo.h;
	var alpha = w.backgroundInfo.alpha;

	if(!patWidth) patWidth = imgWidth;
	if(!patHeight) patHeight = imgHeight;

	startX += offX * backRatioW;
	startY += offY * backRatioH;

	backRatioW *= patWidth / imgWidth;
	backRatioH *= patHeight / imgHeight;

	/*
		0: repeat
		1: center
		2: singular
	*/
	if(repeat == 0) {
		if(!window.DOMMatrix || !backgroundPattern) return false;
		backgroundPattern.setTransform(new DOMMatrix([backRatioW, 0, 0, backRatioH, -startX, -startY]));
		renderCtx.fillStyle = backgroundPattern;
		renderCtx.globalAlpha = alpha;
		renderCtx.fillRect(ctxOffX, ctxOffY, tileWidth, tileHeight);
		renderCtx.globalAlpha = 1;
		return true;
	} else if(repeat == 1 || repeat == 2) {
		if(!backgroundImage) return false;
		if(repeat == 1) {
			startX += Math.floor(imgWidth / 2) * backRatioW;
			startY += Math.floor(imgHeight / 2) * backRatioH;
		}
		renderCtx.globalAlpha = alpha;
		renderCtx.drawImage(backgroundImage, -startX + ctxOffX, -startY + ctxOffY, imgWidth * backRatioW, imgHeight * backRatioH);
		renderCtx.globalAlpha = 1;
		return true;
	}
	return false;
}

function clearTile(tileX, tileY) {
	if(!Tile.visible(tileX, tileY)) return;
	var tileScreenPos = getTileScreenPosition(tileX, tileY);
	var offsetX = Math.floor(tileScreenPos[0]);
	var offsetY = Math.floor(tileScreenPos[1]);

	var clamp = getTileScreenPosition(tileX + 1, tileY + 1);
	var clampW = Math.floor(clamp[0]) - offsetX;
	var clampH = Math.floor(clamp[1]) - offsetY;

	owotCtx.clearRect(offsetX, offsetY, clampW, clampH);
}

function renderContent(textRenderCtx, tileX, tileY, clampW, clampH, offsetX, offsetY, bounds, charOverflowMode) {
	var str = tileY + "," + tileX;
	var tile = Tile.get(tileX, tileY);
	if(!tile) return;
	var props = tile.properties.cell_props || {};
	var writability = tile.writability;
	var x1 = 0;
	var y1 = 0;
	var x2 = tileC - 1;
	var y2 = tileR - 1;
	if(bounds) {
		x1 = bounds[0];
		y1 = bounds[1];
		x2 = bounds[2];
		y2 = bounds[3];
	}
	var hasDrawn = false;
	for(var y = y1; y <= y2; y++) {
		for(var x = x1; x <= x2; x++) {
			var protValue = writability;
			if(tile.properties.char) {
				protValue = tile.properties.char[y * tileC + x];
			}
			if(protValue == null) protValue = tile.properties.writability;
			if(protValue == null) protValue = state.worldModel.writability;
			var dChar = renderChar(textRenderCtx, x, y, clampW, clampH, str, tile, protValue, props, offsetX, offsetY, charOverflowMode);
			if(dChar) {
				hasDrawn = true;
			}
		}
	}
	return hasDrawn;
}

function renderCellBgColors(textRenderCtx, tileX, tileY, clampW, clampH) {
	var tile = Tile.get(tileX, tileY);
	if(!tile) return;
	var containsCursor = cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY;
	var bgcolors = tile.properties.bgcolor;
	var hasDrawn = false;
	if(!bgcolors) return;
	for(var y = 0; y < tileR; y++) {
		for(var x = 0; x < tileC; x++) {
			var bgColor = bgcolors[y * tileC + x];
			if(bgColor == -1) continue;
			if(containsCursor && cursorCoords && cursorCoords[2] == x && cursorCoords[3] == y) continue;
			var tmpCellW = clampW / tileC;
			var tmpCellH = clampH / tileR;
			var sx = Math.floor(x * tmpCellW);
			var sy = Math.floor(y * tmpCellH);
			var ex = Math.floor((x + 1) * tmpCellW);
			var ey = Math.floor((y + 1) * tmpCellH);
			textRenderCtx.fillStyle = `rgb(${bgColor >> 16 & 255},${bgColor >> 8 & 255},${bgColor & 255})`;
			textRenderCtx.fillRect(sx, sy, ex - sx, ey - sy);
			hasDrawn = true;
		}
	}
	return hasDrawn;
}

function drawTile(tileX, tileY) {
	var tile = Tile.get(tileX, tileY);
	if(!tile) return;

	var hasDrawn = false;

	var tileScreenPos = getTileScreenPosition(tileX, tileY);
	var offsetX = Math.floor(tileScreenPos[0]);
	var offsetY = Math.floor(tileScreenPos[1]);

	var clamp = getTileScreenPosition(tileX + 1, tileY + 1);
	var clampW = Math.floor(clamp[0]) - offsetX;
	var clampH = Math.floor(clamp[1]) - offsetY;

	if(transparentBackground) {
		textRenderCtx.clearRect(0, 0, textRenderCanvas.width, textRenderCanvas.height);
	} else {
		var cursorVisibility = cursorRenderingEnabled && cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY;
		var dBack = renderTileBackground(textRenderCtx, 0, 0, tile, tileX, tileY, cursorVisibility);
		if(dBack) {
			hasDrawn = true;
		}
	}

	if(backgroundEnabled) {
		var dImage = renderTileBackgroundImage(textRenderCtx, tileX, tileY, 0, 0);
		if(dImage) {
			hasDrawn = true;
		}
	}

	if(colorsEnabled) {
		var dCell = renderCellBgColors(textRenderCtx, tileX, tileY, clampW, clampH);
		if(dCell) {
			hasDrawn = true;
		}
	}

	if(!bufferLargeChars) {
		var dCont = renderContent(textRenderCtx, tileX, tileY, clampW, clampH, 0, 0);
		if(dCont) {
			hasDrawn = true;
		}
	} else {
		var d1 = renderContent(textRenderCtx, tileX - 1, tileY, clampW, clampH, clampW * -1, 0, [tileC - 1, 0, tileC - 1, tileR - 1], true); // left
		var d2 = renderContent(textRenderCtx, tileX, tileY, clampW, clampH, 0, 0); // main
		var d3 = renderContent(textRenderCtx, tileX - 1, tileY + 1, clampW, clampH, clampW * -1, clampH * 1, [tileC - 1, 0, tileC - 1, 0], true); // bottom-left corner
		var d4 = renderContent(textRenderCtx, tileX, tileY + 1, clampW, clampH, 0, clampH * 1, [0, 0, tileC - 1, 0], true); // bottom
		if(d1 || d2 || d3 || d4) {
			hasDrawn = true;
		}
	}

	if(gridEnabled) {
		var gridColor = int_to_hexcode(0xFFFFFF - resolveColorValue(getTileBackgroundColor(tile)));
		drawGrid(textRenderCtx, gridColor, 0, 0);
		hasDrawn = true;
	}

	if(hasDrawn) {
		var tileImage = loadTileFromPool(tileX, tileY);
		var poolCtx = tileImage.pool.ctx;
		var poolCanv = tileImage.pool.canv;
		var poolX = tileImage.poolX;
		var poolY = tileImage.poolY;

		tileImage.clampW = clampW;
		tileImage.clampH = clampH;

		if(bgImageHasChanged) {
			testCanvasForCrossOriginError();
			bgImageHasChanged = false;
		}

		// we read a single pixel to force the browser to draw immediately,
		// since we want to precisely control the timing for the queue
		if(canBypassRenderDefer) {
			textRenderCtx.getImageData(0, 0, 1, 1);
		}

		poolCtx.clearRect(poolX, poolY, tileWidth, tileHeight);
		poolCtx.drawImage(textRenderCanvas, 0, 0, tileWidth, tileHeight, poolX, poolY, tileWidth, tileHeight);
	} else {
		markTileFromPoolAsEmpty(tileX, tileY);
	}
}

function renderTile(tileX, tileY) {
	if(!Tile.loaded(tileX, tileY)) return;
	var tileScreenPos = getTileScreenPosition(tileX, tileY);
	var offsetX = Math.floor(tileScreenPos[0]);
	var offsetY = Math.floor(tileScreenPos[1]);

	var tile = Tile.get(tileX, tileY);

	if(!Tile.visible(tileX, tileY)) return;

	var clamp = getTileScreenPosition(tileX + 1, tileY + 1);
	var clampW = Math.floor(clamp[0]) - offsetX;
	var clampH = Math.floor(clamp[1]) - offsetY;

	var cursorVisibility = cursorRenderingEnabled && cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY;

	if(transparentBackground) {
		renderTileBackground(owotCtx, offsetX, offsetY, tile, tileX, tileY, cursorVisibility);
	} else {
		var backgroundUpdated = false;
		var hasHighlightFlash = highlightFlash[tileY + "," + tileX];
		if(hasHighlightFlash) {
			backgroundUpdated = true;
			tile.tp_highlight = true;
		} else {
			if(tile.tp_highlight) {
				backgroundUpdated = true;
				delete tile.tp_highlight;
			}
		}
		if(cursorVisibility) {
			backgroundUpdated = true;
			tile.tp_cursor = true;
		} else if(tile.tp_cursor) {
			backgroundUpdated = true;
			delete tile.tp_cursor;
		}
		if(backgroundUpdated) {
			tile.redraw = true;
		}
	}

	if(tile.redraw || (tile.serial && tile.serial != renderSerial)) {
		tile.redraw = false;
		tile.serial = renderSerial;
		if(!isTileQueued(tileX, tileY)) {
			queueTile(tileX, tileY);
		}
	}

	var tileImage = loadTileFromPool(tileX, tileY, true);
	if(tileImage) {
		// render text data from cache
		var pCanv = tileImage.pool.canv;
		var pX = tileImage.poolX;
		var pY = tileImage.poolY;
		if(tileImage.pool.tileWidth == tileWidth && tileImage.pool.tileHeight == tileHeight) {
			owotCtx.drawImage(pCanv, pX, pY, clampW, clampH, offsetX, offsetY, clampW, clampH);
		} else {
			owotCtx.drawImage(pCanv, pX, pY, tileImage.clampW, tileImage.clampH, offsetX, offsetY, clampW, clampH);
		}
		if(cursorRenderingEnabled && cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
			if(unobstructCursor) {
				drawObstructedCursor(owotCtx, tile.content, cursorCoords[2], cursorCoords[3], offsetX, offsetY);
			}
			if(cursorOutlineEnabled) {
				renderCursorOutline(owotCtx, offsetX, offsetY, tileX, tileY);
			}
		}
	} else {
		var isEmpty = tileImage === null;
		if(!isTileQueued(tileX, tileY) && !isEmpty) {
			queueTile(tileX, tileY);
		}
		if(isEmpty) {
			// tile has no cached image, so render a background
			if(!transparentBackground) {
				owotCtx.fillStyle = getTileBackgroundColor(tile);
				owotCtx.fillRect(offsetX, offsetY, clampW, clampH);
			}
		} else {
			// tile has no cached image, and rendering is in progress
			if(transparentBackground) {
				if(shiftOptimization) {
					owotCtx.fillStyle = "#C0C0C0";
					owotCtx.fillRect(offsetX, offsetY, clampW, clampH);
				} else {
					clearTile(tileX, tileY);
				}
			}
		}
	}

	if(cursorRenderingEnabled && cursorCoords && cursorCoords[0] == tileX && cursorCoords[1] == tileY) {
		if(unobstructCursor) {
			drawObstructedCursor(owotCtx, tile.content, cursorCoords[2], cursorCoords[3], offsetX, offsetY);
		}
		if(cursorOutlineEnabled) {
			renderCursorOutline(owotCtx, offsetX, offsetY, tileX, tileY);
		}
	}

	if(w.events.tilerendered) w.emit("tileRendered", {
		tileX: tileX, tileY: tileY,
		startX: offsetX, startY: offsetY,
		endX: offsetX + clampW - 1, endY: offsetY + clampH - 1
	});
}

function renderNextTilesInQueue() {
	var start = performance.now();
	var size = renderQueue.length;
	var fastQueue = true;
	for(var i = 0; i < size; i++) {
		var tileCoords = renderQueue.shift();
		if(tileCoords) {
			var tileX = tileCoords[0];
			var tileY = tileCoords[1];
			var tile = Tile.get(tileX, tileY);
			renderQueueMap.delete(tileY + "," + tileX);
			if(Tile.visible(tileX, tileY)) {
				drawTile(tileX, tileY);
				renderTile(tileX, tileY);
			} else if(tile) {
				tile.redraw = true;
			}
			if(tile && tile.fastQueue) {
				tile.fastQueue = false;
			} else {
				fastQueue = false;
			}
		} else {
			break;
		}
		var end = performance.now();
		var diff = end - start;
		if(diff >= 16 && (!fastQueue || diff > 700)) break;
	}
}

// the 'redraw' parameter is deprecated
function renderTiles(redraw) {
	w.emit("beforeTilesRendered");
	updateCoordDisplay();
	if(unloadedPatternPanning) {
		elm.owot.style.backgroundPosition = positionX + "px " + positionY + "px";
	}
	var optShifted = false;
	var canOptimizeShift = shiftOptimization && zoom <= 0.5 && shiftOptState.zoom == zoom;
	if(!canOptimizeShift) {
		owotCtx.clearRect(0, 0, owotWidth, owotHeight);
	} else {
		owotCtx.drawImage(owot, Math.floor(positionX) - shiftOptState.prevX, Math.floor(positionY) - shiftOptState.prevY);
		optShifted = true;
	}
	if(redraw) w.redraw();
	// render all visible tiles
	var visibleRange = getVisibleTileRange(1.0);
	var startX = visibleRange[0][0];
	var startY = visibleRange[0][1];
	var endX = visibleRange[1][0];
	var endY = visibleRange[1][1];
	for(var y = startY; y <= endY; y++) {
		for(var x = startX; x <= endX; x++) {
			var tile = Tile.get(x, y);
			var shouldRender = false;
			if(tile) {
				shouldRender = tile.redraw || tile.rerender || (tile.serial && tile.serial != renderSerial);
			}
			if(optShifted && !shouldRender) {
				// at really far zooms, we can just shift the whole screen and only blit the tiles beyond the edges
				if(!(shiftOptState.x1 < x && x < shiftOptState.x2 && shiftOptState.y1 < y && y < shiftOptState.y2)) {
					renderTile(x, y);
				}
			} else {
				renderTile(x, y);
			}
			if(optShifted && !Tile.loaded(x, y)) {
				clearTile(x, y);
			}
		}
	}
	if(shiftOptimization) {
		shiftOptState.prevX = Math.floor(positionX);
		shiftOptState.prevY = Math.floor(positionY);
		shiftOptState.x1 = startX;
		shiftOptState.y1 = startY;
		shiftOptState.x2 = endX;
		shiftOptState.y2 = endY;
		shiftOptState.zoom = zoom;
	}
	w.emit("tilesRendered");
}

// re-render only tiles that have changed to the screen
function renderTilesSelective() {
	var visibleRange = getVisibleTileRange(1.0);
	var startX = visibleRange[0][0];
	var startY = visibleRange[0][1];
	var endX = visibleRange[1][0];
	var endY = visibleRange[1][1];
	for(var y = startY; y <= endY; y++) {
		for(var x = startX; x <= endX; x++) {
			var tile = Tile.get(x, y);
			if(!tile) continue;
			if(tile.rerender) {
				delete tile.rerender;
				renderTile(x, y);
			} else if(tile.redraw || (tile.serial && tile.serial != renderSerial)) {
				renderTile(x, y);
			}
		}
	}
}

function setRedrawPatterned(pattern) {
	var visibleRange = getVisibleTileRange(1.0);
	var startX = visibleRange[0][0];
	var startY = visibleRange[0][1];
	var endX = visibleRange[1][0];
	var endY = visibleRange[1][1];
	if(pattern == "square") {
		var midX = Math.floor((startX + endX) / 2);
		var midY = Math.floor((startY + endY) / 2);
		queueTile(midX, midY);
		var dist = Math.max(endY - midY, endX - midX);
		for(var i = 1; i < dist; i++) {
			var xh1 = Math.max(midX - i, startX);
			var xh2 = Math.min(midX + i, endX);
			var yv1 = Math.max(midY - i, startY);
			var yv2 = Math.min(midY + i, endY);
			for(var x = xh1; x <= xh2; x++) {
				if(x < startX || x > endX) break;
				queueTile(x, yv1);
				queueTile(x, yv2);
			}
			for(var y = yv1; y <= yv2; y++) {
				if(y < startY || y > endY) break;
				queueTile(xh1, y);
				queueTile(xh2, y);
			}
		}
	} else if(pattern == "random") {
		var tiles = getVisibleTiles(1.0);
		for(var i = tiles.length - 1; i >= 0; i--) {
			var pos = Math.floor(Math.random() * (i + 1));
			var temp = tiles[i];
			tiles[i] = tiles[pos];
			tiles[pos] = temp;
		}
		for(var i = 0; i < tiles.length; i++) {
			var pos = tiles[i];
			queueTile(pos[0], pos[1]);
		}
	}
}

function renderGuestCursors(renderCtx, offsetX, offsetY, tile, tileX, tileY) {
	var hasDrawn = false;
	var tilePos = tileY + "," + tileX;
	var list = guestCursorsByTile[tilePos];
	for(var channel in list) {
		var cursor = list[channel];
		var charX = cursor.charX;
		var charY = cursor.charY;
		renderCtx.fillStyle = styles.guestCursor;
		renderCtx.fillRect(offsetX + charX * cellW, offsetY + charY * cellH, cellW, cellH);
		hasDrawn = true;
	}
	return hasDrawn;
}

function renderCursorOutline(renderCtx, offsetX, offsetY) {
	if(!cursorCoords) return;
	var color = YourWorld.Color;
	var tileX = cursorCoords[0];
	var tileY = cursorCoords[1];
	var charX = cursorCoords[2];
	var charY = cursorCoords[3];
	renderCtx.strokeStyle = "rgb(" + (color >> 16 & 255) + "," + (color >> 8 & 255) + "," + (color & 255) + ")";
	renderCtx.lineWidth = 2;
	renderCtx.beginPath();
	renderCtx.rect(offsetX + charX * cellW + 1, offsetY + charY * cellH + 1, cellW - 2, cellH - 2);
	renderCtx.stroke();
}
