var __hasProp = {}.hasOwnProperty;
window.nextObjId = 1;

var YourWorld = {
	Color: 0
}

function commaJoinCoords(coords) {
	return [coords.tileY, coords.tileX, coords.charY, coords.charX].join(",");
}

function commaJoinRectangle(r) {
	return [r.minY, r.maxY, r.minX, r.maxX].join(",");
}

function editToServerEdit(e) {
	var ar = [e.tileY, e.tileX, e.charY, e.charX, e.timestamp, e.s, e.editId];
	if(e.color) {
		ar.push(e.color);
	}
	return ar;
}

function Send(data) {
    socket.send(JSON.stringify(data))
}

function getInitialState() {
	return {
		announce: null,
		cursors: {},
		goToCoord: {},
		initRendered: false,
		lastBounds: null,
		lastClick: null,
		lastRender: null,
		offsetX: null,
		offsetY: null,
		selected: null,
		selectedCoords: null,
		uiModal: false
	};
}

function getInitialUI() {
	return {
		announce: $("#announce"),
		coordinateInputModal: new CoordinateInputModal(),
		scrolling: null,
		urlInputModal: new URLInputModal(),
		colorInputModal: new ColorInputModal()
	};
}

if (window.MozWebSocket)
	window.WebSocket = window.MozWebSocket;

var World = (function() {
	function World(_container, state, wsaddr) {
		var _this = this;
		this._container = _container;
		this.setupWS = function(wsaddr) {
			var path;
			var supportsWebSockets;
			var tryFlushQueue;
			var tryFlushBatchQueue;
			var ws_path;
			var ws_scheme;
			supportsWebSockets = "WebSocket" in window;
			if (!supportsWebSockets) {
				use_ajax = true;
				$("#announce").html("Sorry, your browser is not supported").show();
				return;
			}
			wsaddr = wsaddr ? wsaddr : window.location.host;
			ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
			path = window.location.pathname.replace(/\/$/, "");
			ws_path = ws_scheme + "://" + wsaddr + path + "/ws/";
			_this.socket = new ReconnectingWebSocket(ws_path);
			socket = _this.socket;
			_this.socket.onmessage = function(message) {
				var data;
				var kind;
				var methodName;
				data = JSON.parse(message.data);
				log("got websocket message", data);
				kind = data.kind.replace(/[a-z]/, function(str) {
					return str.toUpperCase();
				});
				methodName = "ws" + kind;
				return _this[methodName](data);
			};
			_this.socket.onready = function(isBatchQueue) {
				if (isBatchQueue) {
					if (_this.wsBatchQueue && _this.wsBatchQueue.edits.length) {
						try {
							var batchLength = _this.wsBatchQueue.edits.length;
							_this.socket.send(JSON.stringify(_this.wsBatchQueue));
							_this.wsBatchQueue.edits.splice(0, batchLength);
						} catch (_error) {}
					}
					if (_this.wsCursorQueue && _this.wsCursorQueue.positions.length) {
						try {
							if (_this.wsCursorQueue.length > 1) {
								var previous = _this.wsCursorQueue.positions.shift();
								var current = _this.wsCursorQueue.positions.pop();
								_this.wsCursorQueue.positions = [previous, current];
							}
							var cursorLength = _this.wsCursorQueue.positions.length;
							_this.socket.send(JSON.stringify(_this.wsCursorQueue));
							_this.wsCursorQueue.positions.splice(0, cursorLength);
						} catch (_error) {}
					}
				} else {
					if (_this.wsQueue.length) {
						try {
							_this.socket.send(_this.wsQueue[0]);
							_this.wsQueue.splice(0, 1);
						} catch (_error) {}
					}
				}
			};
			tryFlushQueue = function() {
				if (_this.socket.readyState === 1) {
					var isBatchQueue = false;
					return _this.socket.onready(isBatchQueue);
				}
			};
			setInterval(tryFlushQueue, 10);
			tryFlushBatchQueue = function() {
				if (_this.socket.readyState === 1) {
					var isBatchQueue = true;
					return _this.socket.onready(isBatchQueue);
				}
			};
			setInterval(tryFlushBatchQueue, 1000);
			_this.socket.onopen = function() {
				return console.log("Connected to socket");
			};
			_this.socket.onclose = function() {
				$(".active-guest-cursor").removeClass("active-guest-cursor");
				console.log("Disconnected from socket");
			};
		};
		this._wsResendLost = function() {
			var data;
			var i;
			var k;
			var sent;
			if (!_this.wsQueue.length) {
				i = 0;
				sent = [];
				data = {
					edits: [],
					kind: "write"
				};
				for (k in _this._inflightEdits) {
					sent.push(k);
					data.edits.push(editToServerEdit(_this._inflightEdits[k]));
					i += 1;
					if (i >= 200) {
						break;
					}
				}
				if (data.edits.length) {
					return _this.wsSend(data);
				}
			}
		};
		this._buildMenu = function() {
			var menu;
			menu = new Menu($("#menu"), $("#nav"));
			menu.addCheckboxOption(" Show coordinates", function() {
				return $("#coords").show();
			}, function() {
				return $("#coords").hide();
			});
			menu.addOption("Change color", _this.color);
			if (Permissions.can_go_to_coord(_this.userModel, _this.worldModel)) {
				menu.addOption("Go to coordinates", _this.goToCoord);
			}
			if (Permissions.can_coordlink(_this.userModel, _this.worldModel)) {
				menu.addOption("Create link to coordinates", _this.coordLink);
			}
			if (Permissions.can_urllink(_this.userModel, _this.worldModel)) {
				menu.addOption("Create link to URL", _this.urlLink);
			}
			if (Permissions.can_admin(_this.userModel, _this.worldModel)) {
				menu.addOption("Make an area owner-only", function() {
					return _this.protectATile("owner-only");
				});
			}
			if (Permissions.can_protect_tiles(_this.userModel, _this.worldModel)) {
				menu.addOption("Make an area member-only", function() {
					return _this.protectATile("member-only");
				});
				menu.addOption("Make an area public", function() {
					return _this.protectATile("public");
				});
				return menu.addOption("Default area protection", _this.unprotectATile);
			}
		};
		this.getCell = function(coords) {
			return _this.getOrCreateTile(coords).getCell(coords);
		};
		this.createTile = function(coords) {
			var initTop = _this._config.tileHeight() * coords.tileY + _this._state.offsetY;
			var initLeft = _this._config.tileWidth() * coords.tileX + _this._state.offsetX;
			var tile = _this.tileStore.createTile(coords, _this._container[0], initTop, initLeft);
			if (_this._tileCleanupTimeout) {
				clearTimeout(_this._tileCleanupTimeout);
			}
			_this._tileCleanupTimeout = setTimeout(_this.cleanUpTiles, 1000);
			return tile;
		};
		this.getOrCreateTile = function(coords) {
			var tile = _this.tileStore.softGetTile(coords);
			if (!tile) {
				tile = _this.createTile(coords);
				_this.worldRenderer.worldFragment.appendChild(tile.$node[0]);
			}
			return tile;
		};
		this.getTileVisibility = function() {
			var minVisY = (_this._container.scrollTop() - _this._state.offsetY) / _this._config.tileHeight();
			var minVisX = (_this._container.scrollLeft() - _this._state.offsetX) / _this._config.tileWidth();
			var numDown = _this._container.height() / _this._config.tileHeight();
			var numAcross = _this._container.width() / _this._config.tileWidth();
			var maxVisY = minVisY + numDown;
			var maxVisX = minVisX + numAcross;
			var centerY = minVisY + numDown / 2;
			var centerX = minVisX + numAcross / 2;
			return {
				minVisY: minVisY,
				minVisX: minVisX,
				numDown: numDown,
				numAcross: numAcross,
				maxVisY: maxVisY,
				maxVisX: maxVisX,
				centerY: centerY,
				centerX: centerX
			};
		};
		this.getMandatoryBounds = function() {
			var tileVis = _this.getTileVisibility();
			return {
				minY: Math.floor(tileVis.minVisY) - 1,
				minX: Math.floor(tileVis.minVisX) - 1,
				maxY: Math.ceil(tileVis.maxVisY) + 2,
				maxX: Math.ceil(tileVis.maxVisX) + 2
			};
		};
		this.setCoords = function() {
			var tileVis = _this.getTileVisibility();
			var centerY = -Math.floor(tileVis.centerY / 4);
			var centerX = Math.floor(tileVis.centerX / 4);
			$("#coord_Y").text(centerY);
			$("#coord_X").text(centerX);
		};
		this.getCenterCoords = function() {
			var tileVis = _this.getTileVisibility();
			return [tileVis.centerY, tileVis.centerX];
		};
		this.renderMandatoryTiles = function() {
			var bounds = _this.getMandatoryBounds();
			for (var tileY = bounds.minY; tileY <= bounds.maxY; tileY++) {
				for (var tileX = bounds.minX; tileX <= bounds.maxX; tileX++) {
					_this.getOrCreateTile({
						tileY: tileY,
						tileX: tileX
					});
				}
			}
			_this.worldRenderer.renderTiles();
		};
		this.makeLeftRoom = function(numPx) {
			var room = _this._config.tileWidth() * 5;
			if (numPx > room) {
				throw new Error("no big jumps yet");
			}
			_this._state.offsetX += room;
			$(".tilecont").each(function() {
				return this.style.left = parseInt(this.style.left, 10) + room + "px";
			});
			_this._container.scrollLeft(_this._container.scrollLeft() + room);
			return room;
		};
		this.makeTopRoom = function(numPx) {
			var room = _this._config.tileHeight() * 5;
			if (numPx > room) {
				throw new Error("no big jumps yet");
			}
			_this._state.offsetY += room;
			$(".tilecont").each(function() {
				return this.style.top = parseInt(this.style.top, 10) + room + "px";
			});
			_this._container.scrollTop(_this._container.scrollTop() + room);
			return room;
		};
		this.makeRightRoom = function(numPx) {
			var bounds = _this.getMandatoryBounds();
			var newTileCoords = {
				tileY: bounds.maxY + 5,
				tileX: bounds.maxX + 5
			};
			return _this.getOrCreateTile(newTileCoords);
		};
		this.makeBottomRoom = this.makeRightRoom;
		this.updateData = function(data) {
			return $.each(data, function(yx, properties) {
				var tile;
				var x;
				var y;
				var _ref;
				_ref = yx.split(","), y = _ref[0], x = _ref[1];
				var coords = {
					tileX: x,
					tileY: y
				};
				tile = _this.tileStore.softGetTile(coords);
				if (tile) {
					return tile.setProperties(properties);
				}
			});
		};
		this.sendEdit = function(editId, edit) {
			var data = {
				edits: [editToServerEdit(edit)],
				kind: "write"
			};
			if (_this.ableToWrite) {
				_this._inflightEdits[editId] = edit;
				_this._inflightEditsIds.push(editId);
				if (_this.wsBatchQueue) {
					_this.wsBatchQueue.edits.push(editToServerEdit(edit));
				} else {
					_this.wsBatchQueue = data;
				}
			}
		};
		this.fetchUpdates = function(lastBounds) {
			var fetchRequest = {
				fetchRectangles: _this.getRectangles(lastBounds),
				kind: "fetch",
				v: "3"
			};
			return _this.wsSend(fetchRequest);
		};
		this.moveCursor = function(dir, optFrom) {
			var from = optFrom || _this._state.selected;
			if (!from) {
				return;
			}
			var coords = Helpers.getCellCoords(from);
			var tileY = coords.tileY;
			var tileX = coords.tileX;
			var charY = coords.charY;
			var charX = coords.charX;
			if (dir === "right") {
				if (charX === _this._config.numCols() - 1) {
					charX = 0;
					tileX++;
				} else {
					charX++;
				}
			} else if (dir === "left") {
				if (charX === 0) {
					charX = _this._config.numCols() - 1;
					tileX--;
				} else {
					charX--;
				}
			} else if (dir === "down") {
				if (charY === _this._config.numRows() - 1) {
					charY = 0;
					tileY++;
				} else {
					charY++;
				}
			} else if (dir === "up") {
				if (charY === 0) {
					charY = _this._config.numRows() - 1;
					tileY--;
				} else {
					charY--;
				}
			} else {
				throw new Error("Unknown direction to move.");
			}
			var newCoords = {
				charX: charX,
				charY: charY,
				tileX: tileX,
				tileY: tileY
			};
			var target;
			try {
				target = _this.getCell(newCoords);
				_this.ableToWrite = true;
			} catch (err) {
				target = _this.getCell(coords);
				_this.ableToWrite = false;
			}
			_this.setSelected(target);
			return target;
		};
		this.cleanUpTiles = function() {
			var self = _this;
			var bounds = _this.getMandatoryBounds();
			var tileByCoord = _this.tileStore.getTileByCoord();
			var tilesToBeDeleted = [];
			var worker = new Worker("/static/yw/javascript/findTilesToBeDeletedWorker.js");
			worker.postMessage(JSON.stringify({
				bounds: bounds,
				tileByCoord: tileByCoord
			}));
			worker.onmessage = function(e) {
				self.tileStore.deleteMultipleTiles(e.data);
			};
			_this._tileCleanupTimeout = null;
		};
		this._tileAction = function(url, tile, optArgs) {
			var tileYX = $(tile).attr(TILE_YX_ATTR);
			var data = stringToCoords(tileYX);
			data.world = _this.worldModel.path;
			if (optArgs) {
				$.extend(data, optArgs);
			}
			return $.ajax({
				data: data,
				type: "POST",
				url: url
			});
		};
		this.doProtect = function(tile, type) {
			var args;
			args = {
				type: type || "owner-only"
			};
			return _this._tileAction("/ajax/protect/", tile, args);
		};
		this.doUnprotect = function(tile) {
			return _this._tileAction("/ajax/unprotect/", tile);
		};
		this._actionUI = function(styles, elType, callback, optExtraArgs) {
			_this._ui.scrolling.stop();
			styles = [styles.map(function(css) {
				return Helpers.addCss(css);
			})];
			return $(_this._container).one("click", function(e) {
				var args;
				var target;
				target = $(e.target).closest(elType).get(0);
				if (target) {
					args = [target];
					args.push.apply(args, optExtraArgs || []);
					callback.apply(_this, args);
				}
				styles.forEach(function(stylesheet) {
					return $(stylesheet).remove();
				});
				return _this._ui.scrolling.start();
			});
		};
		this._cellActionUI = function(callback, args) {
			var styles;
			styles = ["td:hover {background-color: #aaf; cursor:pointer}"];
			if (!Permissions.can_admin(_this.userModel, _this.worldModel)) {
				styles.push(".protected td:hover {background-color: inherit; cursor:inherit}");
			}
			return _this._actionUI(styles, "td", callback, args);
		};
		this.protectATile = function(protectType) {
			var bgColor;
			bgColor = {
				"owner-only": "#ddd",
				"member-only": "#eee",
				"public": "#fff"
			}[protectType];
			return _this._tileActionUI(bgColor, _this.doProtect, protectType);
		};
		this.unprotectATile = function() {
			return _this._tileActionUI("#fff", _this.doUnprotect);
		};
		this.doCoordLink = function(y, x) {
			return _this._cellActionUI(_this.sendCoordLink, [y, x]);
		};
		this.doUrlLink = function(url) {
			return _this._cellActionUI(_this.sendUrlLink, [url]);
		};
		this.doGoToCoord = function(y, x) {
			var scroller;
			y *= -4;
			x *= 4;
			y += 2;
			x += 2;
			if (!_this._state.goToCoord.initted) {
				_this._state.goToCoord.cancel = function() {
					clearInterval(_this._state.goToCoord.interval);
					return $(document).trigger("YWOT_GoToCoord_stop");
				};
				$(document).bind("YWOT_GoToCoord_start", function() {
					return $(document).bind("mousedown", _this._state.goToCoord.cancel);
				});
				$(document).bind("YWOT_GoToCoord_stop", function() {
					$(document).unbind("mousedown", _this._state.goToCoord.cancel);
					return _this.checkBoundsAndFetch();
				});
				_this._state.goToCoord.initted = true;
			}
			scroller = function() {
				var centerX;
				var centerY;
				var distance;
				var xDiff;
				var xMove;
				var yDiff;
				var yMove;
				var _ref;
				_ref = _this.getCenterCoords(), centerY = _ref[0], centerX = _ref[1];
				yDiff = y - centerY;
				xDiff = x - centerX;
				yDiff *= _this._config.tileHeight();
				xDiff *= _this._config.tileWidth();
				distance = Helpers.vectorLen(yDiff, xDiff);
				yMove = Math.round(yDiff * 20 / distance);
				xMove = Math.round(xDiff * 20 / distance);
				if (Helpers.vectorLen(yDiff, xDiff) < 40) {
					_this._state.goToCoord.cancel();
					return;
				}
				yDiff = yDiff - yMove;
				_this.scrollUpBy(yMove);
				xDiff = xDiff - xMove;
				return _this.scrollLeftBy(xMove);
			};
			_this._state.goToCoord.interval = setInterval(scroller, 25);
			return $(document).trigger("YWOT_GoToCoord_start");
		};
		this.urlLink = function() {
			_this._ui.urlInputModal.open(_this.doUrlLink.bind(_this));
		};
		this.color = function() {
			_this._ui.colorInputModal.open(function(color) {
				var this_color = 0;
				if(color) {
					this_color = parseInt(color.substr(1), 16);
				}
				if(!this_color) {
					this_color = 0;
				}
				YourWorld.Color = this_color;
			});
		};
		this.goToCoord = function() {
			_this._ui.coordinateInputModal.open("Go to coordinates:", _this.doGoToCoord.bind(_this));
		};
		this.sendCoordLink = function(td, y, x) {
			return _this._sendCellLink(td, "/ajax/coordlink/", {
				link_tileY: y,
				link_tileX: x
			});
		};
		this.sendUrlLink = function(td, url) {
			return _this._sendCellLink(td, "/ajax/urllink/", {
				url: url
			});
		};
		this.coordLink = function() {
			_this._ui.coordinateInputModal.open("Enter the coordinates to create a link to. You can then click on a letter to create the link.", _this.doCoordLink.bind(_this));
		};
		this._scrollDirBy = function(scrollAttr, makeNegativeRoom, makePositiveRoom, scrollSizeAttr, sizeAttr, distance) {
			var newPosition;
			var offset;
			var positiveRoom;
			newPosition = _this._container[scrollAttr]() + distance;
			if (newPosition < 0) {
				offset = makeNegativeRoom(-newPosition);
				newPosition = newPosition + offset;
			} else {
				positiveRoom = _this._container.attr(scrollSizeAttr) - newPosition - _this._container[sizeAttr]();
				if (positiveRoom < 0) {
					makePositiveRoom(-positiveRoom);
				}
			}
			_this._container[scrollAttr](newPosition);
			return _this.setCoords();
		};
		this.scrollLeftBy = function(dx) {
			return _this._scrollDirBy("scrollLeft", _this.makeLeftRoom, _this.makeRightRoom, "scrollWidth", "width", dx);
		};
		this.scrollUpBy = function(dy) {
			return _this._scrollDirBy("scrollTop", _this.makeTopRoom, _this.makeBottomRoom, "scrollHeight", "height", dy);
		};
		this.setSelected = function(el) {
			if (_this._state.selected) {
				$(_this._state.selected).removeClass("active-cursor");
			}
			var previous = _this._state.selected;
			_this._state.selected = null;
			if (!el || el.nodeName !== "TD") {
				return;
			}
			var coords = Helpers.getCellCoords(el);
			var tile = _this.tileStore.getTile(coords);
			if (!tile.initted()) {
				return;
			}
			if (!Permissions.can_edit_tile(_this.userModel, _this.worldModel, tile)) {
				return;
			}
			var e = $(el);
			var rightRoom = _this._container.offset().left + _this._container.width() - e.offset().left - e.width();
			if (rightRoom < 0) {
				_this.scrollLeftBy(Math.ceil(-rightRoom / _this._config.charWidth()) * _this._config.charWidth());
			}
			var btmRoom = _this._container.offset().top + _this._container.height() - e.offset().top - e.height();
			if (btmRoom < 0) {
				_this.scrollUpBy(Math.ceil(-btmRoom / _this._config.charHeight()) * _this._config.charHeight());
			}
			var leftRoom = e.offset().left - _this._container.offset().left - e.width();
			if (leftRoom < 0) {
				_this.scrollLeftBy(Math.ceil(leftRoom / _this._config.charWidth()) * _this._config.charWidth());
			}
			var topRoom = e.offset().top - _this._container.offset().top - e.height();
			if (topRoom < 0) {
				_this.scrollUpBy(Math.ceil(topRoom / _this._config.charHeight()) * _this._config.charHeight());
			}
			e.addClass("active-cursor");
			_this._state.selected = el;
			_this._state.selectedCoords = commaJoinCoords(coords);
			_this.wsSendCursorPosition(previous, el);
			_this.checkBoundsAndFetch();
		};
		this.typeChar = function(s, optWhere) {
			if (Helpers.length(s) !== 1) {
				throw new Error("I thought I was only getting one letter");
			}
			if (!_this._state.selected) {
				return;
			}
			var where = optWhere || _this._state.selected;
			if (!where) {
				return;
			}
			var coords = Helpers.getCellCoords(where);
			var tile = _this.tileStore.getTile(coords);
			if (!Permissions.can_edit_tile(_this.userModel, _this.worldModel, tile)) {
				return;
			}
			Tile.Cell.setContent($(_this._state.selected), s);
			var color = YourWorld.Color;
			if(color > 0) {
				_this._state.selected.style.color = "#" + ("000000" + (color).toString(16)).substr(-6);
			} else {
				_this._state.selected.style.color = "";
			}
			var timestamp = new Date().getTime();
			var editId = window.nextObjId++;
			var editData = $.extend({
				s: s,
				timestamp: timestamp,
				editId: editId,
				color: YourWorld.Color
			}, coords);
			tile.tellEdit(editData);
			_this.sendEdit(editId, editData);
		};
		var clickContainer;
		var e;
		var input;
		var touchDevice;
		var typeFirstChar;
		var wheelScroll;
		$("#loading").hide();
		this.socket = null;
		this.wsQueue = [];
		this.ableToWrite = true;
		this.socketChannel = null;
		this.setupWS(wsaddr);
		this._state = getInitialState();
		this.worldModel = state.worldModel;
		this.userModel = state.userModel;
		this._inflightEdits = {};
		this._inflightEditsIds = [];
		this._ui = getInitialUI();
		if (this._state.announce) {
			this._ui.announce.html(this._state.announce);
			this._ui.announce.show();
		}
		this._container.css({
			background: "#ddd",
			fontFamily: "Courier New",
			overflow: "hidden",
			position: "relative"
		});
		this._container.addClass("world-container");
		this._container.addClass("writability-" + Permissions.get_perm_display(this.worldModel.writability));
		this._container.height($(window).height());
		this._container.width($(window).width());
		this._config = new Config(this._container);
		this.tileStore = new TileStore(this._config);
		Helpers.addCss("#yourworld table {height:" + this._config.tileHeight() + "px }");
		Helpers.addCss("#yourworld table {width:" + this._config.tileWidth() + "px }");
		Helpers.addCss(".tilecont {height:" + this._config.tileHeight() + "px }");
		Helpers.addCss(".tilecont {width:" + this._config.tileWidth() + "px }");
		this.worldRenderer = new TileRenderer(this._container[0]);
		this._state.offsetX = Math.floor(this._container.width() / 2);
		this._state.offsetY = Math.floor(this._container.height() / 2);
		this.checkBoundsAndFetch();
		this._tileCleanupTimeout = null;
		$(window).resize(function() {
			_this._container.height($(window).height());
			_this._container.width($(window).width());
			_this.checkBoundsAndFetch();
		});
		setInterval(function() {
			_this.checkBoundsAndFetch();
		}, 600);
		try {
			document.createEvent("TouchEvent");
			touchDevice = true;
		} catch (_error) {
			e = _error;
			touchDevice = false;
		}
		input = $("<textarea autocapitalize=\"off\" autocorrect=\"off\" autocomplete=\"off\"></textarea>").css({
			left: "-1000px",
			position: "absolute",
			top: "-1000px"
		}).appendTo($("body"))[0];
		if (touchDevice) {
			var originalHeight_1 = $(document).height();
			$(document).on("touchend", function(e) {
				if (!Tile.Cell.isCell($(e))) {
					if ($(input).is(':focus') && (originalHeight_1 == $(document).height())) {
						input.blur();
					}
				}
				input.focus();
			});
		}
		typeFirstChar = function() {
			var c;
			var charAt;
			if (input.value) {
				charAt = Helpers.charAt(input.value, 0);
				if (charAt === "\n") {
					c = _this._state.lastClick;
					if (c && c.nodeName !== "TD") {
						c = null;
					}
					if (c) {
						_this._state.lastClick = _this.moveCursor("down", c);
					}
				} else {
					_this.typeChar(charAt);
					_this.moveCursor("right");
				}
				input.value = input.value.slice(Helpers.length(charAt));
				return true;
			}
			return false;
		};
		setInterval((function() {
			typeFirstChar();
			if (!Permissions.can_paste(_this.userModel, _this.worldModel)) {
				input.value = "";
			}
		}), 10);
		setInterval(this._wsResendLost, 60000);
		$(document).keydown(function(e) {
			if (_this._state.uiModal) {
				return;
			}
			input.focus();
			if (e.keyCode === $.ui.keyCode.BACKSPACE) {
				_this.moveCursor("left");
				_this.typeChar(" ");
			} else if (e.keyCode === $.ui.keyCode.LEFT) {
				_this._state.lastClick = _this.moveCursor("left");
			} else if (e.keyCode === $.ui.keyCode.RIGHT) {
				_this._state.lastClick = _this.moveCursor("right");
			} else if (e.keyCode === $.ui.keyCode.DOWN) {
				_this._state.lastClick = _this.moveCursor("down");
			} else if (e.keyCode === $.ui.keyCode.UP) {
				_this._state.lastClick = _this.moveCursor("up");
			} else if (e.keyCode === $.ui.keyCode.ESCAPE) {
				$(_this._container).trigger("click");
			}
			input.value = "";
		});
		$(input).on("paste", function() {
			return _this._state.lastClick = _this._state.selected;
		});
		clickContainer = function(ev) {
			_this.setSelected(ev.target);
			_this._state.lastClick = ev.target;
			input.value = "";
		};
		this._container.click(clickContainer).on("touchend", clickContainer);
		document.onselectstart = function() {
			return _this._state.uiModal;
		};
		this._container.css("-khtml-user-select", "none");
		this._container.css("-moz-user-select", "-moz-none");
		this._ui.scrolling = makeScrollable(this._container, function(dx, dy) {
			_this.scrollLeftBy(dx);
			_this.scrollUpBy(dy);
		});
		Tile.Cell.setup(this);
		this.setCoords();
		this._buildMenu();
		$(document).bind("simplemodal_onopen", function() {
			return _this._state.uiModal = true;
		});
		$(document).bind("simplemodal_onclose", function() {
			return _this._state.uiModal = false;
		});
		wheelScroll = function(e) {
			var axis;
			var h;
			var i;
			if (_this._wheelTimeout) {
				return;
			}
			_this._wheelTimeout = setTimeout((function() {
				return _this._wheelTimeout = null;
			}), 100);
			h = e.originalEvent;
			i = 0;
			if (h.wheelDelta) {
				i = h.wheelDelta;
				if (window.opera) {
					i = -1 * i;
				}
			} else if (h.detail) {
				i = -h.detail;
			}
			if (i) {
				i = 100 * (i > 0 ? 1 : -1);
				axis = h.axis === h.VERTICAL_AXIS ? "y" : "x";
				if (h.wheelDeltaX || h.wheelDeltaY) {
					axis = h.wheelDeltaX ? "x" : "y";
				}
				if (axis === "x") {
					_this.scrollLeftBy(-i);
				} else {
					_this.scrollUpBy(-i);
				}
				return _this.checkBoundsAndFetch();
			}
		};
		$("#yourworld").bind("mousewheel", wheelScroll).bind("DOMMouseScroll", wheelScroll);
	}
	World.prototype.wsAnnouncement = function(data) {
		log("wsAnnouncement", data);
		new Announcement(data.announcement).show();
	};
	World.prototype.wsSend = function(data) {
		log("wsSend", data);
		data = JSON.stringify(data);
		return this.wsQueue.push(data);
	};
	World.prototype.wsTileUpdate = function(data) {
		log("wsTileUpdate", data);
		if (data.sender && data.sender === this.socketChannel && data.source === "write") {
			return;
		}
		return this.updateData(data.tiles);
	};
	World.prototype.wsChannel = function(data) {
		this.socketChannel = data.sender;
	};
	World.prototype.highlightGuestCursor = function(position, highlight) {
		var $cell;
		var e;
		var coords = {
			tileY: position.tileY,
			tileX: position.tileX,
			charY: position.charY,
			charX: position.charX
		};
		try {
			$cell = $(this.getCell(coords));
			$cell.toggleClass("active-guest-cursor", highlight);
		} catch (_error) {
			e = _error;
		}
	};
	World.prototype.wsWrite = function(data) {
		var editData;
		var editId;
		var idx;
		var reason;
		var tile;
		var _i;
		var _len;
		var _ref;
		var _ref1;
		var _results;
		_ref = data.accepted;
		for (_i = 0, _len = _ref.length; _i < _len; _i++) {
			editId = _ref[_i];
			editData = this._inflightEdits[editId];
			if (editData == null) {
				continue;
			}
			delete this._inflightEdits[editId];
			idx = this._inflightEditsIds.indexOf(editId);
			if (idx >= 0) {
				this._inflightEditsIds.splice(idx, 1);
			}
			tile = this.tileStore.softGetTile(editData);
			if (tile) {
				tile.editDone(editData);
			}
		}
		_ref1 = data.rejected;
		_results = [];
		for (editId in _ref1) {
			reason = _ref1[editId];
			log("world.wsWrite.rejected", [data]);
			delete this._inflightEdits[editId];
			idx = this._inflightEditsIds.indexOf(editId);
			if (idx >= 0) {
				_results.push(this._inflightEditsIds.splice(idx, 1));
			} else {
				_results.push(void 0);
			}
		}
		return _results;
	};
	World.prototype.wsFetch = function(data) {
		return this.updateData(data.tiles);
	};
	World.prototype.checkBoundsAndFetch = function() {
		var bounds = this.getMandatoryBounds();
		var lastBounds = this._state.lastBounds || "";
		var boundsString = commaJoinRectangle(bounds);
		var lastBoundValues;
		if (boundsString != lastBounds) {
			var keepLastBoundsArray = void 0;
			if (!!lastBounds) {
				keepLastBoundsArray = lastBounds.split(",");
				lastBoundValues = {
					minY: parseInt(keepLastBoundsArray[0]),
					maxY: parseInt(keepLastBoundsArray[1]),
					minX: parseInt(keepLastBoundsArray[2]),
					maxX: parseInt(keepLastBoundsArray[3])
				};
			}
			this.renderMandatoryTiles();
			this._state.lastBounds = boundsString;
			if (lastBoundValues) {
				return this.fetchUpdates(lastBoundValues);
			}
			return this.fetchUpdates(lastBounds);
		}
	};
	World.prototype.wsCursor = function(data) {
		if (data.sender === this.socketChannel) {
			return;
		}
		if (data.disconnected) {
			this.highlightGuestCursor(data.positions[0], false);
			return;
		}
		if ((data.sender in this._state.cursors)) {
			this.highlightGuestCursor(this._state.cursors[data.sender], false);
		}
		this._state.cursors[data.sender] = data.positions[data.positions.length - 1];
		for (var i = 0; i < data.positions.length; i++) {
			this.highlightGuestCursor(data.positions[i], true);
			if (!(i == data.positions.length - 1)) {
				this.highlightGuestCursor(data.positions[i], false);
			}
		}
	};
	World.prototype.wsColors = function() {
		var $link;
		var href;
		$link = $("link#world-style");
		href = $link.attr("data-href");
		if (!href) {
			href = $link.attr("href");
			$link.attr("data-href", href);
		}
		return $link.attr("href", href + "&t=" + (new Date().getTime()));
	};
	World.prototype.wsSendCursorPosition = function(previous, current) {
		var data;
		if (previous) {
			previous = Helpers.getCellCoords(previous);
		}
		if (current) {
			current = Helpers.getCellCoords(current);
		}
		data = {
			kind: "cursor",
			positions: [current]
		};
		if (this.wsCursorQueue) {
			this.wsCursorQueue.positions.push(current);
		} else {
			this.wsCursorQueue = data;
		}
	};
	World.prototype.getRectangles = function(lastBounds) {
		var bounds = this.getMandatoryBounds();
		var boundsKeys = Object.keys(bounds);
		var fetchRectangles = [];
		var fetchUp, fetchDown, fetchRight, fetchLeft;
		fetchUp = {};
		fetchDown = {};
		fetchRight = {};
		fetchLeft = {};
		for (var i = 0; i < boundsKeys.length; i++) {
			fetchUp[boundsKeys[i]] = bounds[boundsKeys[i]];
			fetchDown[boundsKeys[i]] = bounds[boundsKeys[i]];
			fetchRight[boundsKeys[i]] = bounds[boundsKeys[i]];
			fetchLeft[boundsKeys[i]] = bounds[boundsKeys[i]];
		}
		if (lastBounds) {
			if (lastBounds.minY > bounds.minY) {
				fetchUp.minY = bounds.minY;
				fetchUp.maxY = lastBounds.minY;
				fetchRectangles.push(fetchUp);
			}
			if (bounds.maxY > lastBounds.maxY) {
				fetchDown.minY = lastBounds.maxY;
				fetchDown.maxY = bounds.maxY;
				fetchRectangles.push(fetchDown);
			}
			if (lastBounds.maxX < bounds.maxX) {
				fetchRight.minX = lastBounds.maxX;
				fetchRight.maxX = bounds.maxX;
				fetchRectangles.push(fetchRight);
			}
			if (lastBounds.minX > bounds.minX) {
				fetchLeft.minX = bounds.minX;
				fetchLeft.maxX = lastBounds.minX;
				fetchRectangles.push(fetchLeft);
			}
		} else {
			fetchRectangles.push(bounds);
		}
		return fetchRectangles;
	};
	World.prototype._tileActionUI = function(bgColor, callback, optArg) {
		var styles;
		log("using bgcolor", bgColor);
		styles = [".tilecont:hover {background-color: " + bgColor + " !important; cursor:pointer}"];
		return this._actionUI(styles, ".tilecont", callback, [optArg]);
	};
	World.prototype._sendCellLink = function(td, url, extraData) {
		var coords = Helpers.getCellCoords(td);
		var data = $.extend({
			world: this.worldModel.path
		}, coords, extraData);
		return $.ajax({
			type: "POST",
			url: url,
			data: data
		});
	};
	return World;
}());