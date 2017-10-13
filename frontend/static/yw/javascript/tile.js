var COORDLINK_YX_ATTR = "data-coordlink-tileYX";

function makeDefaultHTML(config) {
	var c;
	var content;
	var contentPos;
	var html;
	html = [];
	content = config.defaultContent();
	html.push("<table width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\"><tbody>");
	contentPos = 0;
	for (var charY = 0; charY < config.numRows(); charY++) {
		html.push("<tr>");
		for (var charX = 0; charX < config.numCols(); charX++) {
			c = Helpers.escapeChar(content.charAt(contentPos));
			html.push("<td>" + c + "</td>");
			contentPos++;
		}
		html.push("</tr>");
	}
	html.push("</tbody></table>");
	return html.join("");
}

if (!Array.prototype.fill) {
	Object.defineProperty(Array.prototype, 'fill', {
		value: function(value) {

			// Steps 1-2.
			if (this == null) {
				throw new TypeError('this is null or not defined');
			}

			var O = Object(this);

			// Steps 3-5.
			var len = O.length >>> 0;

			// Steps 6-7.
			var start = arguments[1];
			var relativeStart = start >> 0;

			// Step 8.
			var k = relativeStart < 0 ?
				Math.max(len + relativeStart, 0) :
				Math.min(relativeStart, len);

			// Steps 9-10.
			var end = arguments[2];
			var relativeEnd = end === undefined ?
				len : end >> 0;

			// Step 11.
			var final = relativeEnd < 0 ?
				Math.max(len + relativeEnd, 0) :
				Math.min(relativeEnd, len);

			// Step 12.
			while (k < final) {
				O[k] = value;
				k++;
			}

			// Step 13.
			return O;
		}
	});
}

function color_array_match(ar1, ar2) {
	for(var i = 0; i < 128; i++) {
		if(ar1[i] !== ar2[i]) {
			return false;
		}
	}
	return true;
}

function getDefaultHTML(config) {
	if (!window._defaultTileHTML) {
		window._defaultTileHTML = makeDefaultHTML(config);
	}
	return window._defaultTileHTML;
}
var inkLimiter = [Math.floor(new Date().getTime() / 1000), 0];
var Tile = (function() {
	function Tile(coords, config, node) {
		var _this = this;
		this.config = config;
		this.node = node;
		this._setContent = function(newContent, props) {
			var highlight;
			if (newContent === null) {
				newContent = _this.config.defaultContent();
			}
			highlight = true;
			if (!_this._initted) {
				_this._initted = true;
				highlight = false;
				_this.node.style.backgroundColor = "";
			}
			var newColors = Array(config.numCols() * config.numRows()).fill(0)
			if(props) {
				newColors = props;
			}
			if (newContent !== _this._content || !color_array_match(newColors, _this._colors)) {
				_this._updateHTML(newContent, highlight, newColors);
				_this._content = newContent;
			}
			_this._colors = newColors.slice(0);
		};
		this._setCellProps = function(propsPerCell) {
			_this._cellProps = propsPerCell;
			if (propsPerCell === null) {
				return;
			}
			for (var charY in propsPerCell) {
				var rowProps = propsPerCell[charY];
				for (var charX in rowProps) {
					var cellProps = rowProps[charX];
					var $cell = $(_this.getCell({
						charY: parseInt(charY, 10),
						charX: parseInt(charX, 10)
					}));
					for (var name_1 in cellProps) {
						var value = cellProps[name_1];
						if (name_1 === "link") {
							if (value.type === "coord") {
								$cell.attr(COORDLINK_YX_ATTR, coordsToString({
									tileY: value.link_tileY,
									tileX: value.link_tileX
								}));
								$cell.attr("title", "Link to coordinates " + value.link_tileX + "," + value.link_tileY);
								$cell.addClass("coordLink");
							} else if (value.type === "url") {
								$cell.attr("data-url", value.url);
								$cell.attr("title", "Link to URL " + value.url);
								$cell.addClass("urlLink");
							} else {
								throw new Error("Unknown link type");
							}
						} else {
							throw new Error("Unknown cell property");
						}
					};
				}
			};
		};
		this.initted = function() {
			return _this._initted;
		};
		this.tellEdit = function(edit) {
			if (!_this._initted) {
				throw new Error("Can't edit uninitialized tile");
			}
			var index = edit.charY * _this.config.numCols() + edit.charX;
			if (_this._pendingEdits[index] === undefined) {
				_this._pendingEdits[index] = [];
			}
			_this._pendingEdits[index].push([edit.s, edit.timestamp, edit.color]);
		};
		this.setProperties = function(p) {
			_this._setContent((p && p.content ? p.content : null), p && p.properties && p.properties.color || null);
			_this._setCellProps(p && p.properties && p.properties.cell_props || null);
			if ((p != null) && (p.properties != null) && (p.properties.writability != null)) {
				_this.writability = p.properties.writability;
			} else {
				_this.writability = null;
			}
			_this.$node.removeClass("protected-admin protected-members protected-public");
			if (_this.writability === PERM.ADMIN) {
				_this.$node.addClass("protected-admin");
			} else if (_this.writability === PERM.MEMBERS) {
				_this.$node.addClass("protected-members");
			} else if (_this.writability === PERM.PUBLIC) {
				_this.$node.addClass("protected-public");
			}
		};
		this.editDone = function(edit) {
			var index = edit.charY * _this.config.numCols() + edit.charX;
			var ar = _this._pendingEdits[index];
			ar.splice($.inArray(ar, [edit.s, edit.timestamp, edit.color]), 1);
			if (!ar.length) {
				log("Tile.editDone", [index, ar.length, edit.color]);
			}
		};
		this.getCell = function(coords) {
			var rows;
			if (!_this._initted) {
				throw new Error("no cell yet");
			}
			rows = _this.node.childNodes[0].childNodes[0];
			return rows.childNodes[coords.charY].childNodes[coords.charX];
		};
		this.remove = function() {
			_this.$node.remove();
		};
		this._updateHTML = function(newContent, highlight, newColors) {
			var contentPos = 0;
			var sec = Math.floor(new Date().getTime() / 1000);
			if (inkLimiter[0] !== sec) {
				inkLimiter[0] = sec;
				inkLimiter[1] = 0;
			}
			for (var charY = 0; charY < _this.config.numRows(); charY++) {
				for (var charX = 0; charX < _this.config.numCols(); charX++) {
					var c = Helpers.charAt(newContent, contentPos);
					var color = newColors[contentPos];
					var len = c.length;
					if (_this._pendingEdits[contentPos] && _this._pendingEdits[contentPos].length) {
						c = _this._pendingEdits[contentPos][_this._pendingEdits[contentPos].length - 1][0];
						color = _this._pendingEdits[contentPos][_this._pendingEdits[contentPos].length - 1][2];
					}
					var cell = _this.getCell({
						charY: charY,
						charX: charX
					});
					if (c !== _this._content[contentPos]) {
						c = Helpers.escapeChar(c);
						Tile.Cell.setContent($(cell), c);
						if (highlight && !cell.style.backgroundColor) {
							if (inkLimiter[1] < 10) {
								$(cell).effect("highlight", {}, 500);
								inkLimiter[1]++;
							}
						}
					}
					if(color > 0) {
						cell.style.color = "#" + ("000000" + (color).toString(16)).substr(-6);
					} else {
						cell.style.color = "";
					}
					contentPos += len;
				}
			}
		};
		this.isKeysEqual = function(keys1, keys2) {
			return keys1.length !== keys2.length || keys1.join("") !== keys2.join("");
		};
		this.tileY = coords.tileY;
		this.tileX = coords.tileX;
		this.$node = $(this.node);
		this._content = this.config.defaultContent();
		this._colors = Array(config.numCols() * config.numRows()).fill(0);
		this._initted = false;
		this._pendingEdits = {};
		this._cellProps = null;
		this.writability = void 0;
		this.node.style.backgroundColor = "#eee";
		this.node.innerHTML = getDefaultHTML(this.config);
	}
	Tile.Cell = {
		_classes: ["urlLink", "coordLink"],
		isCell: function($el) {
			return $el.is('a[class="urlLink"],span[class="coordLink"]');
		},
		setContent: function($cell, char) {
			for (var i = 0; i < Tile.Cell._classes.length; i++) {
				$cell.removeClass(Tile.Cell._classes[i]);
			}
			$cell.html(Helpers.escapeChar(char));
		},
		setup: function(world) {
			$(document).on("click", ".urlLink", function(e) {
				var $el = $(e.target);
				var url = $el.attr("data-url");
				window.open(url);
			});
			$(document).on("click", ".coordLink", function(e) {
				var el = e.target;
				var targetYX = $(el).attr(COORDLINK_YX_ATTR);
				var targetCoords = stringToCoords(targetYX);
				world.doGoToCoord(targetCoords.tileY, targetCoords.tileX);
			});
		}
	};
	return Tile;
}());