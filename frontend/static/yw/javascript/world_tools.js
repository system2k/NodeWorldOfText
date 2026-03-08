register_chat_command("search", function(args) {
	var phrase = args.join(" ");
	if(!phrase) return;
	clientChatResponse("Looking for phrase: \"" + phrase + "\"");
	function doSearch() {
		searchLookup({
			text: phrase
		}, function(val) {
			val = (val * 100).toFixed(2);
			clientChatResponse("Searching... (" + val + "%)");
		}).then(function(coords) {
			var data = "Results:<br>";
			for(var i = 0; i < coords.length; i++) {
				var pos = coords[i];
				var scr = "javascript:searchTeleportTo(" + pos[0] + ", " + pos[1] + ", " + pos[2] + ", " + pos[3] + ", " + phrase.length + ")";
				var sty = "text-decoration: underline; color: blue;";
				data += "<a href=\"" + scr + "\" style=\"" + sty + "\">(" + pos[0] + ", " + pos[1] + ") [" + pos[2] + ", " + pos[3] + "]</a><br>";
			}
			addChat(null, 0, "user", "[ Client ]", data, "Client", true, false, false, null, getDate());
		});
	}
	if(!window.OWOTSearchUtil) {
		w.loadScript("/static/yw/javascript/search_util.js", doSearch);
	} else {
		doSearch();
	}
}, ["phrase"], "search for a phrase", "Hello world");

class InteractiveTable {
	headers = [];
	rowsById = {};

	tbody = null;
	selectedRows = new Set();
	onselectionchange = null;

	constructor() {}

	setHeaders(headers) {
		this.headers = headers;
	}

	build(parentElement) {
		let dataTableContainer = document.createElement("div");
		dataTableContainer.style.flexGrow = "1";
		dataTableContainer.style.overflowY = "scroll";
		dataTableContainer.style.border = "solid 1px black";
		dataTableContainer.style.backgroundColor = "#FFFFFF";
		
		let dataTable = document.createElement("table");
		dataTable.style.width = "100%";
		dataTable.className = "worldtools-wtw-datatable";

		let dataThead = document.createElement("thead");
		let dataTbody = document.createElement("tbody");
		let dataHeadRow = document.createElement("tr");
		this.tbody = dataTbody;

		let checkboxHead = document.createElement("th");
		let checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.onclick = () => {
			if(checkbox.checked) {
				this.selectAll();
			} else {
				this.deselectAll();
			}
		};
		checkboxHead.appendChild(checkbox);
		dataHeadRow.appendChild(checkboxHead);
		for(let h in this.headers) {
			let header = this.headers[h];
			let label = header.label || header.name;

			let head = document.createElement("th");
			head.innerText = label;
			dataHeadRow.appendChild(head);
		}
		dataThead.appendChild(dataHeadRow);

		dataTable.appendChild(dataThead);
		dataTable.appendChild(dataTbody);

		dataTableContainer.appendChild(dataTable);

		parentElement.appendChild(dataTableContainer);
	}

	_normalizeAndSetValue(cellElm, value) {
		// remove cell's children
		for(let c of cellElm.children) {
			cellElm.removeChild(c);
		}
		cellElm.innerText = "";
		if(!(value instanceof HTMLElement)) {
			if(value == null) {
				value = "";
			} else {
				value = String(value);
			}
			cellElm.innerText = value;
		} else {
			cellElm.appendChild(value);
		}
	}

	selectRow(id) {
		let row = this.rowsById[id];
		if(row) {
			this.selectedRows.add(id);
			if(row.checkboxElement) {
				row.checkboxElement.checked = true;
			}
		}
		this.onselectionchange?.(this.selectedRows);
	}

	selectAll() {
		this.selectedRows.clear();
		for(let id in this.rowsById) {
			let row = this.rowsById[id];
			this.selectedRows.add(id);
			if(row.checkboxElement) {
				row.checkboxElement.checked = true;
			}
		}
		this.onselectionchange?.(this.selectedRows);
	}

	deselectAll() {
		this.selectedRows.clear();
		for(let id in this.rowsById) {
			let row = this.rowsById[id];
			if(row.checkboxElement) {
				row.checkboxElement.checked = false;
			}
		}
		this.onselectionchange?.(this.selectedRows);
	}

	addRow(id, rowValues) {
		let dataRow = document.createElement("tr");

		let rowData = {
			rowElement: dataRow,
			checkboxElement: null,
			columns: {}
		};

		let checkboxRow = document.createElement("td");
		checkboxRow.style.textAlign = "center";
		let checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.onchange = () => {
			let isChecked = checkbox.checked;
			if(isChecked) {
				this.selectedRows.add(id);
			} else {
				this.selectedRows.delete(id);
			}
			this.onselectionchange?.(this.selectedRows);
		};
		rowData.checkboxElement = checkbox;
		checkboxRow.appendChild(checkbox);
		dataRow.appendChild(checkboxRow);
		for(let h in this.headers) {
			let header = this.headers[h];
			let name = header.name;

			let value = rowValues[name];
			let cell = document.createElement("td");
			this._normalizeAndSetValue(cell, value);

			rowData.columns[name] = {
				cellElement: cell,
				value: value
			};

			dataRow.appendChild(cell);
		}
		this.tbody.appendChild(dataRow);

		this.rowsById[id] = rowData;
		return rowData;
	}

	clearRows() {
		for(let row of this.rowsById) {
			row.rowElement.remove();
		}
		this.rowsById = {};
		this.selectedRows.clear();
		this.onselectionchange?.(this.selectedRows);
	}

	updateRowValue(id, name, value) {
		let row = this.rowsById[id];
		if(!row) return;

		let column = row.columns[name];
		if(!column) return;

		this._normalizeAndSetValue(column.cellElement, value);
	}

	removeRow(id) {
		let row = this.rowsById[id];
		if(!row) return;
		let elm = row.rowElement;
		elm.remove();
		delete this.rowsById[id];
	}
}

/*
	Imports: makeElementResizable, makeElementDraggable, RegionSelection, network, uncolorChar, colorChar, ajaxRequest
	Utilizes objects: colorClasses, coloredChars, state
*/
class WTWTracker {
	world = null;
	frame = null;
	isVisible = false;
	dataTable = null;
	totalLog = {};
	worldRecord = {};
	rollbackRecord = {};
	linkRecord = {};
	ipColorRef = {};
	seqLookup = {};
	ipSeq = 1;
	coordRadius = null;
	doShowChars = true;
	doShowColors = true;
	doRegardLinks = true;
	doEchoSelf = false;

	constructor(_world) {
		this.world = _world;
		this.init();
	}
	init() {
		this.build();
		this.hide();
		this.world.menu.addCornerButton("RL", () => {
			this.show();
		});

		this.world.registerHook("renderchar", () => {
			if(this.doShowChars) {
				return false;
			} else {
				return true;
			}
		});

		this.world.on("mouseDown", ({tileX, tileY, charX, charY}) => {
			if(!this.dataTable) return;
			if(!this.isVisible) return;
			let idx = charY * tileC + charX;
			let tilePos = tileY + "," + tileX;
			let rec = this.worldRecord[tilePos]?.[idx];
			if(rec != null) {
				let ipAddr = this.seqLookup[rec];
				// ip addresses are also IDs in the table
				this.dataTable.selectRow(ipAddr);
			}
		});
	}

	show() {
		this.isVisible = true;
		if(this.frame) {
			this.frame.style.display = "flex";
		}
	}

	hide() {
		this.isVisible = false;
		if(this.frame) {
			this.frame.style.display = "none";
		}
	}

	setCoordRadius(value) {
		if(value == null || !value) {
			this.coordRadius = null;
			return true;
		}
		let rad = parseInt(value);
		if(Number.isNaN(rad)) {
			return false;
		}
		this.coordRadius = rad * 4;
		return true;
	}

	generateRandomColor() {
		return "#" + Math.floor(Math.random() * 16777216).toString(16).padStart(6, 0);
	}

	rollbackIPs(ipList) {
		let seqs = ipList.map(i => this.ipColorRef[i].seq);
		let [[tileX1, tileY1], [tileX2, tileY2]] = getVisibleTileRange();
		for(let tileY = tileY1; tileY <= tileY2; tileY++) {
			for(let tileX = tileX1; tileX <= tileX2; tileX++) {
				let tilePos = tileY + "," + tileX;
				let tile = this.rollbackRecord[tilePos];
				for(let ci in tile) {
					let cell = tile[ci];
					let stop = -1;
					let stopc = null;
					for(let i = cell.length - 1; i >= 0; i--) {
						let seq = cell[i][0];
						if(!seqs.includes(seq)) {
							break;
						}
						stop = i;
						stopc = cell[i];
					}
					if(stop > -1) {
						cell.splice(stop);
						let idx = ci - 0;
						writeCharTo(stopc[1], stopc[2], tileX, tileY, idx % tileC, Math.floor(idx / tileC));
						uncolorChar(tileX, tileY, idx % tileC, Math.floor(idx / tileC));
					}
				}
			}
		}
	}

	removeLinks(ipList) {
		let seqs = ipList.map(i => this.ipColorRef[i].seq);
		for(let tilePos in this.linkRecord) {
			let [tileY, tileX] = tilePos.split(",").map(Number);
			let tile = this.linkRecord[tilePos];
			for(let ci in tile) {
				let cell = tile[ci];
				if(seqs.includes(cell)) {
					let idx = ci - 0;
					writeCharTo("\0", -1, tileX, tileY, idx % tileC, Math.floor(idx / tileC));
					uncolorChar(tileX, tileY, idx % tileC, Math.floor(idx / tileC));
					delete tile[ci];
				}
			}
		}
	}

	handleUpdate(data) {
		let subjects = data.subjects;
		let tiles = data.tiles;
		let [centerY, centerX] = this.world.getCenterCoords();
		for(let type in tiles) {
			let typeUpdates = tiles[type];
			for(let tilePos in typeUpdates) {
				let [tileY, tileX] = tilePos.split(",").map(Number);
				let inRangeForColor = true;
				if(this.coordRadius != null) {
					let diffX = Math.abs(tileX - centerX);
					let diffY = Math.abs(tileY - centerY);
					if(diffX > this.coordRadius || diffY > this.coordRadius) {
						inRangeForColor = false;
					}
				}
				let tileUpdates = typeUpdates[tilePos];
				for(let i in tileUpdates) {
					let update = tileUpdates[i];

					let subjectId = update[0];
					let subject = subjects[subjectId];
					let clientChannel = subject.clientChannel;
					let clientIp = subject.clientIp;

					if(!this.doEchoSelf && this.world.socketChannel == clientChannel) {
						continue;
					}

					let hasUpdated;
					let charX;
					let charY;
					let char;
					let color;
					let bgColor;
					let prev_char;
					let prev_color;
					let prev_bgColor;

					if(type == "write") {
						hasUpdated = update[1];
						charX = update[2];
						charY = update[3];
						char = update[4];
						color = update[5];
						bgColor = update[6];
						prev_char = update[7];
						prev_color = update[8];
						prev_bgColor = update[9];
					} else if(type == "link") {
						hasUpdated = true;
						charX = update[1];
						charY = update[2];
					}


					let charIdx = charY * tileC + charX;

					let colorChannel, hColor;
					let colorRef = this.ipColorRef[clientIp];
					
					if(!colorRef) {
						hColor = this.generateRandomColor();
						colorRef = {
							hColor,
							seq: this.ipSeq++,
							rowColorBox: null
						};
						colorChannel = "." + colorRef.seq.toString();
						this.ipColorRef[clientIp] = colorRef;
						this.seqLookup[colorRef.seq] = clientIp;
						colorClasses[colorChannel] = hColor;
					} else {
						colorChannel = "." + colorRef.seq.toString();
						hColor = colorRef.hColor;
					}

					if(inRangeForColor && this.doShowColors && !(!this.doRegardLinks && type == "link")) {
						uncolorChar(tileX, tileY, charX, charY);
						colorChar(tileX, tileY, charX, charY, colorChannel);
						this.world.setTileRedraw(tileX, tileY);
					}

					if(type == "write" && hasUpdated && (prev_char || prev_color || prev_bgColor)) {
						let obj = this.rollbackRecord[tilePos] ??= {};
						let arr = obj[charIdx] ??= [];
						if(arr.at(-1)?.[0] != colorRef.seq) {
							arr.push([colorRef.seq, prev_char, prev_color, prev_bgColor]);
						}
					}
					if(type == "link") {
						let obj = this.linkRecord[tilePos] ??= {};
						obj[charIdx] = colorRef.seq;
					}

					let log = this.totalLog[clientIp];
					if(!log) {
						log = {
							editCount: 0,
							linkCount: 0,
							tiles: {},
							reg4x4: {},
							reg25x25: {},
							tileRecord: {}
						};
						this.totalLog[clientIp] = log;

						let ipAddrTextContainer = document.createElement("div");
						ipAddrTextContainer.style.display = "flex";
						let ipAddrText = document.createElement("span");
						ipAddrText.innerText = clientIp;
						ipAddrText.style.flex = "1";
						let ipAddrCopy = document.createElement("button");
						ipAddrCopy.innerText = "C";
						ipAddrCopy.onclick = () => {
							this.world.clipboard.copy(clientIp);
						};
						ipAddrTextContainer.appendChild(ipAddrText);
						ipAddrTextContainer.appendChild(ipAddrCopy);

						let rowData = this.dataTable.addRow(clientIp, {
							ipAddr: ipAddrTextContainer,
							edits: 0,
							links: 0,
							tiles: 0,
							distinct4x4: 0,
							distinct25x25: 0
						});

						colorRef.rowColorBox = rowData.columns.ipAddr?.cellElement;
						if(colorRef.rowColorBox) {
							colorRef.rowColorBox.style.color = "white";
							colorRef.rowColorBox.style.textShadow = "1px 1px 2px black";
							colorRef.rowColorBox.style.backgroundColor = hColor;
						}
					}

					
					if(inRangeForColor) {
						(this.worldRecord[tilePos] ??= {})[charIdx] = colorRef.seq;
					}

					if(type == "write") {
						log.editCount++;
					} else if(type == "link") {
						log.linkCount++;
					}
					log.tiles[tilePos] = 1;
					log.reg4x4[Math.floor(tileY / 4) + "," + Math.floor(tileX / 4)] = 1;
					log.reg25x25[Math.floor(tileY / 25) + "," + Math.floor(tileX / 25)] = 1;

					this.dataTable.updateRowValue(clientIp, "edits", log.editCount);
					this.dataTable.updateRowValue(clientIp, "links", log.linkCount);
					this.dataTable.updateRowValue(clientIp, "tiles", Object.keys(log.tiles).length);
					this.dataTable.updateRowValue(clientIp, "distinct4x4", Object.keys(log.reg4x4).length);
					this.dataTable.updateRowValue(clientIp, "distinct25x25", Object.keys(log.reg25x25).length);
				}
			}
		}
	}

	randomizeColors() {
		for(let ip in this.ipColorRef) {
			let ref = this.ipColorRef[ip];
			let col = this.generateRandomColor();
			ref.hColor = col;
			colorClasses["." + ref.seq] = col;
			if(ref.rowColorBox) {
				ref.rowColorBox.style.backgroundColor = col;
			}
		}
		this.world.redraw();
	}

	clearColors() {
		coloredChars = {};
		this.worldRecord = {};
		this.world.redraw();
	}

	recreateColors() {
		for(let pos in this.worldRecord) {
			let obj = {};
			let rec = this.worldRecord[pos];
			for(let str in rec) {
				let idx = parseInt(str);
				let charX = idx % tileC;
				let charY = Math.floor(idx / tileC);
				(obj[charY] ??= {})[charX] = "." + rec[str];
			}
			coloredChars[pos] = obj;
		}
		this.world.redraw();
	}

	toggleChars(enabled) {
		this.doShowChars = enabled;
		this.world.redraw();
	}

	toggleColors(enabled) {
		this.doShowColors = enabled;
		if(!enabled) {
			coloredChars = {};
			this.world.redraw();
		} else {
			this.recreateColors();
		}
	}

	toggleLinks(enabled) {
		this.doRegardLinks = enabled;
	}

	toggleSelf(enabled) {
		this.doEchoSelf = enabled;
	}

	createToggleButton(state1, state2, defaultState, onChange) {
		let btn = document.createElement("button");

		let state = defaultState ? 1 : 0;

		function updateVisual() {
			let text = state ? state2 : state1;
			btn.innerText = text;
		}

		btn.onclick = () => {
			state = state ? 0 : 1;
			updateVisual();
			if(onChange) {
				onChange(state);
			}
		};

		updateVisual();

		return btn;
	}

	createToggleSwitch(options, defaultIndex, callback) {
		let container = document.createElement("div");
		container.style.display = "inline-flex";
		container.style.gap = "4px";

		container.style.backgroundColor = "#f3f3ff";
		container.style.padding = "4px";
		container.style.borderRadius = "2px";


		let buttons = [];
		let selectedIndex = defaultIndex || 0;

		function updateVisual() {
			for(let i = 0; i < buttons.length; i++) {
				let btn = buttons[i];
				if(i === selectedIndex) {
					btn.style.backgroundColor = "yellow";
				} else {
					btn.style.backgroundColor = "white";
				}
			}
		}

		for(let i = 0; i < options.length; i++) {
			let text = options[i];

			let btn = document.createElement("button");
			btn.innerText = text;
			btn.style.border = "solid 1px #404040";
			btn.style.cursor = "pointer";
			btn.style.borderRadius = "2px";

			btn.onclick = () => {
				if(selectedIndex === i) return;
				selectedIndex = i;
				updateVisual();
				if(callback) {
					callback(i, options[i]);
				}
			};

			buttons.push(btn);
			container.appendChild(btn);
		}

		updateVisual();

		let toggleInst = {
			elm: container,
			getIndex: () => selectedIndex,
			setIndex: (i) => {
				if(i < 0 || i >= buttons.length) return;
				selectedIndex = i;
				updateVisual();
				if(callback) {
					callback(i, options[i]);
				}
			},
			setEnabled: (enabled) => {
				for (let i = 0; i < buttons.length; i++) {
					let btn = buttons[i];
					btn.disabled = !enabled;
				}
			}
		};

		return toggleInst;
	}

	assembleRestrRules(ipAddresses, limType, locationStat, regionRestriction, charRateLimit, restrictColor) {
		let lines = [];
		
		let location = ["world=" + state.worldModel.name, null][locationStat];
		let region = null;
		if(regionRestriction[0] && regionRestriction[1] && regionRestriction[2] && regionRestriction[3]) {
			region = "region=" + regionRestriction.join(",");
		}
		let type = ["type=charrate", "type=linkrate"][limType];

		for(let ip of ipAddresses) {
			lines.push(["ip=" + ip, type, "rate=" + charRateLimit, location, region].filter(r => r != null).join(";"));
			if(limType == 0 && restrictColor) {
				lines.push(["ip=" + ip, "type=color", location, region].filter(r => r != null).join(";"))
			}
		}

		return lines;
	}

	submitRateLimit(ipAddresses, limType, locationStat, regionRestriction, charRateLimit, restrictColor, callback) {
		let rules = this.assembleRestrRules(ipAddresses, limType, locationStat, regionRestriction, charRateLimit, restrictColor);
		ajaxRequest({
			type: "POST",
			url: "/administrator/api/restrictions",
			data: {
				kind: "prepend",
				rules: JSON.stringify(rules.map(r => r + ";tag=rl"))
			},
			done: function(data) {
				if(callback) callback(null, data);
			},
			error: function(err) {
				if(callback) callback(err);
			}
		});
	}

	retrieveRateLimits(callback) {
		ajaxRequest({
			type: "GET",
			url: "/administrator/api/restrictions",
			data: {
				tag: "rl"
			},
			done: function(data) {
				if(callback) callback(null, JSON.parse(data));
			},
			error: function(err) {
				if(callback) callback(err);
			}
		});
	}

	setButtonStatus(buttonElm) {
		buttonElm.style.border = "solid 2px blue";
		return (isErr) => {
			if(!isErr) {
				buttonElm.style.border = "solid 2px #008000";
			}
			if(isErr) {
				let state = 0;
				let render = () => {
					buttonElm.style.border = "solid 2px #FF0000";
					setTimeout(() => {
						buttonElm.style.border = "";
						state++;
						if(state >= 5) return;
						setTimeout(render, 180);
					}, 200);
				};
				render();
			} else {
				let alpha = 255;
				let render = () => {
					buttonElm.style.borderColor = "#008000" + (alpha).toString(16).padStart(2,0);
					alpha -= 10;
					if(alpha <= 0) {
						buttonElm.style.border = "";
						return;
					}
					requestAnimationFrame(render);
				};
				requestAnimationFrame(render);
			}
		};
	}

	build() {
		let frame = document.createElement("div");
		frame.style.position = "absolute";
		frame.style.width = "600px";
		frame.style.height = "365px";
		frame.style.border = "solid 1px #404040";
		frame.style.top = "50px";
		frame.style.left = "50px";
		frame.style.backgroundColor = "#e0e0e0";
		frame.style.borderRadius = "2px";
		frame.style.padding = "3px";
		frame.style.display = "flex";
		frame.style.flexDirection = "column";
		frame.style.gap = "2px";

		let titleBar = document.createElement("div");
		titleBar.style.display = "flex";
		frame.appendChild(titleBar);

		let coordRad = document.createElement("div");
		coordRad.style.display = "inline-flex";
		coordRad.style.gap = "4px";
		let coordRadLabel = document.createElement("span");
		coordRadLabel.innerText = "Coord rad:";
		let coordRadInput = document.createElement("input");
		coordRadInput.style.width = "40px";
		let coordRadSet = document.createElement("button");
		coordRadSet.innerText = "Set";
		coordRadSet.onclick = () => {
			let res = this.setCoordRadius(coordRadInput.value);
			if(res) {
				coordRadInput.style.border = "";
			} else {
				coordRadInput.style.border = "solid 1px red";
			}
		};
		coordRad.appendChild(coordRadLabel);
		coordRad.appendChild(coordRadInput);
		coordRad.appendChild(coordRadSet);
		titleBar.appendChild(coordRad);

		let titlebarPadding = document.createElement("span");
		titlebarPadding.style.flex = "1";
		titleBar.appendChild(titlebarPadding);

		let goto = document.createElement("a");
		goto.style.textDecoration = "underline";
		goto.style.color = "blue";
		goto.style.paddingRight = "5px";
		goto.href = "/administrator/restrictions/";
		goto.target = "_blank";
		goto.innerText = "Goto list";
		titleBar.appendChild(goto);

		let closeButton = document.createElement("div");
		closeButton.style.float = "right";
		closeButton.innerText = "X";
		closeButton.className = "close_button";
		closeButton.onclick = () => {
			this.hide();
		};
		titleBar.appendChild(closeButton);

		let updateSubmitStat = () => {
			let rows = this.dataTable.selectedRows;
			let btns = document.getElementsByClassName("wtwr-isubmit");
			if(rows.size == 0) {
				for(let elm of btns) elm.disabled = true;
			} else {
				for(let elm of btns) elm.disabled = false;
			}
		};

		this.dataTable = new InteractiveTable();
		this.dataTable.setHeaders([
			{
				name: "ipAddr",
				label: "IP Address"
			},
			{
				name: "edits",
				label: "Edits"
			},
			{
				name: "links",
				label: "Links"
			},
			{
				name: "tiles",
				label: "Tiles"
			},
			{
				name: "distinct4x4",
				label: "D-4²"
			},
			{
				name: "distinct25x25",
				label: "D-25²"
			}
		]);
		this.dataTable.onselectionchange = () => {
			updateSubmitStat();
		};

		this.dataTable.build(frame);

		let controlButtonArea = document.createElement("div");
		controlButtonArea.style.display = "flex";
		controlButtonArea.style.justifyContent = "center";
		controlButtonArea.style.gap = "2px";

		let btn_tl_randomize = document.createElement("button");
		btn_tl_randomize.innerText = "Randomize";
		btn_tl_randomize.onclick = () => {
			this.randomizeColors();
		}
		let btn_tl_clearcolors = document.createElement("button");
		btn_tl_clearcolors.innerText = "Clear colors";
		btn_tl_clearcolors.onclick = () => {
			this.clearColors();
		}
		let btn_tl_toggle_chars = this.createToggleButton("<+> chars", "<-> chars", 0, (state) => {
			this.toggleChars(!Boolean(state));
		});
		let btn_tl_toggle_highlight = this.createToggleButton("<+> colors", "<-> colors", 0, (state) => {
			this.toggleColors(!Boolean(state));
		});
		let btn_tl_toggle_filtering = this.createToggleButton("<+> filtering", "<-> filtering", 0, (state) => {
			if(state == 0) {
				network.config("localFilter", true);
			} else {
				network.config("localFilter", false);
			}
		});
		let btn_tl_toggle_links = this.createToggleButton("<+> links", "<-> links", 0, (state) => {
			this.toggleLinks(!Boolean(state));
		});
		let btn_tl_toggle_self = this.createToggleButton("<+> self", "<-> self", 1, (state) => {
			this.toggleSelf(!Boolean(state));
		});
		controlButtonArea.appendChild(btn_tl_randomize);
		controlButtonArea.appendChild(btn_tl_clearcolors);
		controlButtonArea.appendChild(btn_tl_toggle_chars);
		controlButtonArea.appendChild(btn_tl_toggle_highlight);
		controlButtonArea.appendChild(btn_tl_toggle_filtering);
		controlButtonArea.appendChild(btn_tl_toggle_links);
		controlButtonArea.appendChild(btn_tl_toggle_self);


		let stat_limType = 0; // 0: char, 1: link, 2: colors, 3: site
		let stat_location = 0; // 0: this world, 1: site-wide


		let rateLimitControls = document.createElement("fieldset");
		rateLimitControls.style.display = "flex";
		rateLimitControls.style.flexDirection = "column";
		rateLimitControls.style.gap = "2px";
		let rateLimitTitle = document.createElement("legend");
		rateLimitTitle.innerText = "Rate limit";
		rateLimitControls.appendChild(rateLimitTitle);

		let rateLimit_buttonArea = document.createElement("div");
		rateLimit_buttonArea.style.display = "flex";
		rateLimit_buttonArea.style.justifyContent = "center";
		rateLimit_buttonArea.style.gap = "2px";

		let tgl_ratelimit = this.createToggleSwitch(["Characters", "Links", "Colors", "Site"], 0, (state) => {
			stat_limType = state;
			let ichar_enabled = state == 0 || state == 1;
			let ireg_enabled = state == 0 || state == 1 || state == 2;
			let icolor_enabled = state == 0;
			let ilocation_enabled = state == 0 || state == 1 || state == 2;
			let ichar_elms = document.getElementsByClassName("wtwr-ichar");
			let ireg_elms = document.getElementsByClassName("wtwr-ireg");
			let icolor_elms = document.getElementsByClassName("wtwr-icolor");

			for(let elm of ichar_elms) elm.disabled = !ichar_enabled;
			for(let elm of ireg_elms) elm.disabled = !ireg_enabled;
			for(let elm of icolor_elms) elm.disabled = !icolor_enabled;

			if_il_toggle.setEnabled(ilocation_enabled);
		});
		let btn_rl_reset = document.createElement("button");
		btn_rl_reset.innerText = "Reset all";
		btn_rl_reset.onclick = () => {
			tgl_ratelimit.setIndex(0);
			if_il_toggle.setIndex(0);
			if_ir_ix1.value = "";
			if_ir_iy1.value = "";
			if_ir_ix2.value = "";
			if_ir_iy2.value = "";
			if_ic_input.value = "";
			if_id_checkbox.checked = false;
		};
		let btn_rl_copystring = document.createElement("button");
		btn_rl_copystring.innerText = "Copy string";
		btn_rl_copystring.onclick = () => {
			let ipSet = Array.from(this.dataTable.selectedRows);
			let str = this.assembleRestrRules(ipSet, stat_limType, stat_location, [
				if_ir_ix1.value, if_ir_iy1.value, if_ir_ix2.value, if_ir_iy2.value
			], if_ic_input.value, if_id_checkbox.checked);

			this.world.clipboard.copy(str.join("\n"));
		};
		rateLimit_buttonArea.appendChild(tgl_ratelimit.elm);
		rateLimit_buttonArea.appendChild(btn_rl_reset);
		rateLimit_buttonArea.appendChild(btn_rl_copystring);

		rateLimitControls.appendChild(rateLimit_buttonArea);

		//


		let inputField = document.createElement("div");
		inputField.style.display = "grid";
		inputField.style.gap = "2px";
		inputField.style.gridTemplateColumns = "min-content 1fr";

		let if_label_region = document.createElement("div");
		if_label_region.style.whiteSpace = "nowrap";
		if_label_region.innerText = "Region";
		let if_input_region = document.createElement("div");
		if_input_region.style.display = "flex";
		if_input_region.style.gap = "2px";
		
		let if_ir_lx1 = document.createElement("span");
		if_ir_lx1.innerText = "X1:";
		let if_ir_ix1 = document.createElement("input");
		if_ir_ix1.className = "wtwr-ireg";
		if_ir_ix1.style.width = "35px";
		let if_ir_ly1 = document.createElement("span");
		if_ir_ly1.innerText = "Y1:";
		let if_ir_iy1 = document.createElement("input");
		if_ir_iy1.className = "wtwr-ireg";
		if_ir_iy1.style.width = "35px";
		let if_ir_lx2 = document.createElement("span");
		if_ir_lx2.innerText = "X2:";
		let if_ir_ix2 = document.createElement("input");
		if_ir_ix2.className = "wtwr-ireg";
		if_ir_ix2.style.width = "35px";
		let if_ir_ly2 = document.createElement("span");
		if_ir_ly2.innerText = "Y2:";
		let if_ir_iy2 = document.createElement("input");
		if_ir_iy2.className = "wtwr-ireg";
		if_ir_iy2.style.width = "35px";
		let if_ir_btn_settoview = document.createElement("button");
		if_ir_btn_settoview.className = "wtwr-ireg";
		if_ir_btn_settoview.innerText = "Set to view";
		if_ir_btn_settoview.onclick = () => {
			let [[tileX1, tileY1], [tileX2, tileY2]] = getVisibleTileRange();
			if_ir_ix1.value = tileX1;
			if_ir_iy1.value = tileY1;
			if_ir_ix2.value = tileX2;
			if_ir_iy2.value = tileY2;
		}
		let if_ir_btn_select = document.createElement("button");
		if_ir_btn_select.className = "wtwr-ireg";
		if_ir_btn_select.innerText = "Select...";
		if_ir_btn_select.onclick = () => {
			let preciseSelection = new RegionSelection();
			preciseSelection.tiled = true;
			preciseSelection.onselection(([tileX1, tileY1], [tileX2, tileY2]) => {
				if_ir_ix1.value = tileX1;
				if_ir_iy1.value = tileY1;
				if_ir_ix2.value = tileX2;
				if_ir_iy2.value = tileY2;
				preciseSelection.destroy();
			});
			preciseSelection.startSelection();
		}

		if_input_region.appendChild(if_ir_lx1);
		if_input_region.appendChild(if_ir_ix1);
		if_input_region.appendChild(if_ir_ly1);
		if_input_region.appendChild(if_ir_iy1);
		if_input_region.appendChild(if_ir_lx2);
		if_input_region.appendChild(if_ir_ix2);
		if_input_region.appendChild(if_ir_ly2);
		if_input_region.appendChild(if_ir_iy2);
		if_input_region.appendChild(if_ir_btn_settoview);
		if_input_region.appendChild(if_ir_btn_select);

		//

		let if_label_charrate = document.createElement("div");
		if_label_charrate.style.whiteSpace = "nowrap";
		if_label_charrate.innerText = "Rate/1000";
		let if_input_charrate = document.createElement("div");
		if_input_charrate.style.display = "flex";
		if_input_charrate.style.gap = "2px";

		let if_ic_input = document.createElement("input");
		if_ic_input.className = "wtwr-ichar";
		if_input_charrate.appendChild(if_ic_input);
		[0, 10, 15, 30, 100, 20480].forEach(n => {
			let if_ic_ps = document.createElement("button");
			if_ic_ps.className = "wtwr-ichar";
			if_ic_ps.style.padding = "0px 5px 0px 5px";
			if_ic_ps.innerText = n;
			if_ic_ps.onclick = () => if_ic_input.value = n;
			if_input_charrate.appendChild(if_ic_ps);
		});

		//

		let if_label_disablecolor = document.createElement("div");
		if_label_disablecolor.style.whiteSpace = "nowrap";
		if_label_disablecolor.innerText = "Disable color";
		let if_input_disablecolor = document.createElement("div");
		let if_id_checkbox = document.createElement("input");
		if_id_checkbox.className = "wtwr-icolor";
		if_id_checkbox.type = "checkbox";
		if_input_disablecolor.appendChild(if_id_checkbox);

		//

		let if_label_location = document.createElement("div");
		if_label_location.style.whiteSpace = "nowrap";
		if_label_location.innerText = "Location";
		let if_input_location = document.createElement("div");
		let if_il_toggle = this.createToggleSwitch(["This world", "Site-wide"], 0, (state) => {
			stat_location = state;
		});
		if_input_location.appendChild(if_il_toggle.elm);
		
		inputField.appendChild(if_label_region);
		inputField.appendChild(if_input_region);
		inputField.appendChild(if_label_charrate);
		inputField.appendChild(if_input_charrate);
		inputField.appendChild(if_label_disablecolor);
		inputField.appendChild(if_input_disablecolor);
		inputField.appendChild(if_label_location);
		inputField.appendChild(if_input_location);

		//

		let rateLimitSubmitArea = document.createElement("div");
		rateLimitSubmitArea.style.display = "flex";
		rateLimitSubmitArea.style.justifyContent = "space-between";

		let rateLimitSubmitBtn = document.createElement("button");
		rateLimitSubmitBtn.className = "wtwr-isubmit";
		rateLimitSubmitBtn.innerText = "Submit Rate Limit";
		rateLimitSubmitBtn.onclick = () => {
			if(stat_limType == 0 && if_ic_input.value.trim() == "") {
				alert("Value must be set for rate limit");
				return;
			}

			let ipSet = Array.from(this.dataTable.selectedRows);
			let statCb = this.setButtonStatus(rateLimitSubmitBtn);
			this.submitRateLimit(ipSet, stat_limType, stat_location, [
				if_ir_ix1.value, if_ir_iy1.value, if_ir_ix2.value, if_ir_iy2.value
			], if_ic_input.value, if_id_checkbox.checked, (err, response) => {
				statCb(err);
			});
		};
		let rateLimitSubmitAndRollbackBtn = document.createElement("button");
		rateLimitSubmitAndRollbackBtn.className = "wtwr-isubmit";
		rateLimitSubmitAndRollbackBtn.innerText = "Submit Rate Limit & Rollback";
		rateLimitSubmitAndRollbackBtn.onclick = () => {
			if(stat_limType == 0 && if_ic_input.value.trim() == "") {
				alert("Value must be set for rate limit");
				return;
			}

			let ipSet = Array.from(this.dataTable.selectedRows);
			let statCb = this.setButtonStatus(rateLimitSubmitBtn);
			this.submitRateLimit(ipSet, stat_limType, stat_location, [
				if_ir_ix1.value, if_ir_iy1.value, if_ir_ix2.value, if_ir_iy2.value
			], if_ic_input.value, if_id_checkbox.checked, (err, response) => {
				statCb(err);

				if(!err) {
					this.rollbackIPs(ipSet);
				}
			});
		};

		let rollbackBtm = document.createElement("button");
		rollbackBtm.className = "wtwr-isubmit";
		rollbackBtm.innerText = "Rollback";
		rollbackBtm.onclick = () => {
			let ipSet = Array.from(this.dataTable.selectedRows);
			this.rollbackIPs(ipSet);
		};

		let clearLinksBtn = document.createElement("button");
		clearLinksBtn.className = "wtwr-isubmit";
		clearLinksBtn.innerText = "Clear Links";
		clearLinksBtn.onclick = () => {
			let ipSet = Array.from(this.dataTable.selectedRows);
			this.removeLinks(ipSet);
		};

		rateLimitSubmitArea.appendChild(rollbackBtm);
		rateLimitSubmitArea.appendChild(clearLinksBtn);
		rateLimitSubmitArea.appendChild(rateLimitSubmitAndRollbackBtn);
		rateLimitSubmitArea.appendChild(rateLimitSubmitBtn);

		rateLimitControls.appendChild(inputField);
		rateLimitControls.appendChild(rateLimitSubmitArea);

		frame.appendChild(controlButtonArea);
		frame.appendChild(rateLimitControls);

		let resizeStatus = makeElementResizable(frame);
		makeElementDraggable(titleBar, frame, [ closeButton ], function() {
			if(resizeStatus.elementIsResizing) {
				return -1;
			}
		});
		
		document.body.appendChild(frame);
		this.frame = frame;

		updateSubmitStat();
	}


}
