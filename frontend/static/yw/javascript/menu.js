function Menu(titleEl, menuEl, menuCornerAreaEl) {
	var _this = this;

	this.titleEl = titleEl;
	this.menuEl = menuEl;
	this.menuCornerAreaEl = menuCornerAreaEl;
	this.pinEl = null;
	
	this._SPEED = 250;
	this.entries = [];
	this.pinned = false;
	this.visible = false;
	this.lastEntryId = 1;
	this.entriesById = {};

	this.menuAnimationState = "up";
	this.menuAnimationActive = false;
	
	this.addOption = function(text, action) {
		var s = document.createElement("div");
		s.innerText = text;
		s.onclick = function() {
			action();
			_this.hideNow();
		}
		return _this.addEntry(s);
	}
	this.addCheckboxOption = function(text, checkedAction, uncheckedAction, checked) {
		var s = document.createElement("div");
		if(text.charAt(0) == " ") {
			text = text.substr(1);
		}
		s.innerText = " " + text;
		var i = document.createElement("input");
		i.type = "checkbox";
		i.checked = !!checked;
		s.insertBefore(i, s.firstChild);
		s.checked = !!checked;
		s.onclick = function(e) {
			if(e.target !== i) {
				i.checked = !i.checked;
			}
			if(i.checked) {
				checkedAction();
			} else {
				uncheckedAction();
			}
		}
		return _this.addEntry(s);
	}

	this.addCornerButton = function(text, action) {
		if(!_this.menuCornerAreaEl) throw "No corner button area element defined";
		let btn = document.createElement("span");
		btn.className = "ui-vis tab corner-tab";
		let btnText = document.createElement("span");
		btnText.className = "menuText";
		btn.appendChild(btnText);
		if(typeof text == "string") {
			btnText.innerText = text;
		} else {
			btnText.appendChild(text);
		}
		btnText.onclick = action;
		_this.menuCornerAreaEl.appendChild(btn);
	}

	this.hideNow = function() {
		if(_this.pinned) return;
		_this.visible = false;
		_this.slide("up", _this.menuEl, _this._SPEED);
		_this.titleEl.classList.remove("hover");
	}
	this.cancelHide = false;
	this.hide = function() {
		if(_this.pinned) return;
		_this.cancelHide = false;
		setTimeout((function() {
			if (!_this.cancelHide) {
				_this.hideNow();
			}
		}), 500);
	}
	this.show = function() {
		_this.visible = true;
		_this.cancelHide = true;
		_this.slide("down", _this.menuEl, _this._SPEED);
		_this.titleEl.classList.add("hover");
	}
	this.getEntryContainer = function() {
		var mainUl = _this.menuEl.getElementsByTagName("ul");
		var entryLi = null;
		if(mainUl.length) {
			entryLi = document.createElement("li");
			mainUl[0].appendChild(entryLi);
		}
		return entryLi;
	}
	this.addEntry = function(liContents) {
		var entryLi = _this.getEntryContainer();
		if(!entryLi) {
			throw "Cannot locate space for new entry";
		}
		if(typeof liContents == "string") {
			var lcDiv = document.createElement("div");
			lcDiv.innerHTML = liContents;
			var ch = lcDiv.children;
			var len = ch.length;
			for(var r = 0; r < len; r++) {
				var elm = ch[0];
				entryLi.appendChild(elm);
			}
		} else {
			entryLi.appendChild(liContents);
		}
		var entryData = {
			element: entryLi,
			content: liContents
		};
		_this.entries.push(entryData);
		entryLi.onmouseenter = function() {
			this.classList.add("hover");
		}
		entryLi.onmouseleave = function() {
			this.classList.remove("hover");
		}
		var eid = _this.lastEntryId++;
		_this.entriesById[eid] = entryData;
		return eid;
	}
	this.hideEntry = function(id) {
		var entry = _this.entriesById[id];
		if(!entry) return;
		var elm = entry.element;
		elm.style.display = "none";
	}
	this.showEntry = function(id) {
		var entry = _this.entriesById[id];
		if(!entry) return;
		var elm = entry.element;
		elm.style.display = "";
	}
	this.setEntryVisibility = function(id, visible) {
		if(visible) {
			_this.showEntry(id);
		} else {
			_this.hideEntry(id);
		}
	}
	this.moveEntryLast = function(id) {
		var entry = _this.entriesById[id];
		if(!entry) return;
		var elm = entry.element;
		var mainUl = _this.menuEl.getElementsByTagName("ul")[0];
		if(!mainUl) {
			throw "Entry container not found";
		}
		elm.remove();
		mainUl.appendChild(elm);
	}
	this.pin = function() {
		_this.pinned = true;
		_this.show();
		if(!_this.pinEl) {
			var pin = _this.titleEl.getElementsByClassName("menuPin");
			if(pin.length) {
				_this.pinEl = pin[0];
			}
		}
		if(_this.pinEl) {
			_this.pinEl.style.display = "";
		}
	}
	this.unpin = function(noHide) {
		_this.pinned = false;
		if(!noHide) {
			_this.hide();
		}
		if(_this.pinEl) {
			_this.pinEl.style.display = "none";
		}
	}

	this.slide = function(direction, element, speed) {
		if(_this.menuAnimationActive) return;
		var interval = 13;
		var menuMargin = 2;
		if(_this.menuAnimationState == "up" && direction == "up") return;
		if(_this.menuAnimationState == "down" && direction == "down") return;

		_this.menuAnimationActive = true;
		_this.menuAnimationState = direction;

		element.style.overflow = "hidden";
		element.style.marginTop = "0px";
		element.style.marginBottom = "0px";

		element.style.display = "block";
		var destHeight = element.offsetHeight - menuMargin * 2;
		if(direction == "down") element.style.height = "0px";
		var start = getDate();
		var end = start + speed;
		var lapse = end - start;
		var menu_int = setInterval(function() {
			element.style.display = "block";
			var duration = getDate() - start;
			if(duration >= lapse) {
				_this.menuAnimationActive = false;
				clearInterval(menu_int);
				if(direction == "down") {
					element.style.display = "";
				} else if(direction == "up") {
					element.style.display = "none";
				}
				element.style.overflow = "";
				element.style.marginTop = "";
				element.style.marginBottom = "";
				element.style.height = "";
				element.style.paddingTop = "";
				element.style.paddingBottom = "";
				return;
			}
			var multiply = easeOutQuad(duration, 0, 1, speed);

			var currentHeight = multiply * destHeight;
			var currentPadding = multiply * menuMargin;

			if(direction == "up") {
				currentHeight = destHeight - currentHeight;
				currentPadding = menuMargin - currentPadding;
			}
			element.style.height = currentHeight + "px";
			element.style.paddingTop = currentPadding + "px";
			element.style.paddingBottom = currentPadding + "px";
		}, interval);
	}

	this.titleEl.style.display = "";

	this.menuEl.style.top = (this.titleEl.getBoundingClientRect().top + document.body.scrollTop) + this.titleEl.offsetHeight + "px";

	// "Menu" button
	this.titleEl.onmouseenter = this.show;
	this.titleEl.onmouseleave = this.hide;

	// menu list
	this.menuEl.onmouseenter = this.show;
	this.menuEl.onmouseleave = this.hide;

	this.titleEl.onclick = function() {
		if(!_this.visible) {
			_this.show();
			return;
		}
		if(_this.pinned) {
			_this.unpin(true);
		} else {
			_this.pin();
		}
	}
}

