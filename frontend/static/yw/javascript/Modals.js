function setModalPosition() {
	// center the modal panels
	for(var i = 0; i < ModalRefs.length; i++) {
		var ref = ModalRefs[i];
		if(!ref.open) continue;
		var wndWidth = window.innerWidth;
		var wndHeight = window.innerHeight;
		var elm = ref.panel;
		var divWidth = elm.offsetWidth;
		var divHeight = elm.offsetHeight;
		elm.style.top = ((wndHeight - divHeight) / 2) + "px";
		elm.style.left = ((wndWidth - divWidth) / 2) + "px";
	}
}

window.addEventListener("resize", setModalPosition);
window.addEventListener("orientationchange", setModalPosition);

var ModalRefs = [];

var URLInputModal = (function() {
	function URLInputModal() {
		var _this = this;
		this.isOpen = false;
		this.panel = document.getElementById("url_input_panel");
		this.overlay = document.getElementById("simplemodal-overlay");
		this.input = document.getElementById("url_input_form_input");
		this.cancel = document.getElementById("url_input_cancel");
		this.form = document.getElementById("url_input_form");
		this.el = document.getElementById("url_input_modal");
		ModalRefs.push(this);
		this.close = function() {
			_this.panel.style.display = "none";
			_this.overlay.style.display = "none";
			simplemodal_onclose();
		};
		this.cancel.onclick = this.close;
		this.onSubmit = function() {
			var url = _this.input.value;
			_this.close();
			setTimeout((function() {
				return _this.callback(url);
			}), 0);
			return false;
		};
		this.form.onsubmit = this.onSubmit;
	}
	URLInputModal.prototype.open = function(callback) {
		this.isOpen = true;
		this.callback = callback;
		this.panel.style.display = "";
		this.overlay.style.display = "";
		this.input.focus();
		simplemodal_onopen();
		this.panel.style.width = "";
		this.panel.style.height = "";
		var el_width = this.el.offsetWidth;
		var el_height = this.el.offsetHeight;
		if(el_height < 80) el_height = 80;
		if(el_width < 160) el_width = 160;
		this.panel.style.width = el_width + "px";
		this.panel.style.height = el_height + "px";
		setModalPosition();
	};
	return URLInputModal;
}());

var CoordinateInputModal = (function() {
	function CoordinateInputModal() {
		var _this = this;
		this.isOpen = false;
		this.panel = document.getElementById("coord_input_panel");
		this.overlay = document.getElementById("simplemodal-overlay");
		this.input = document.getElementById("coord_input_X");
		this.cancel = document.getElementById("coord_input_cancel");
		this.form = document.getElementById("coord_input_form");
		this.el = document.getElementById("coordinate_input_modal");
		ModalRefs.push(this);
		this.title = document.getElementById("coord_input_title");
		this.close = function() {
			_this.panel.style.display = "none";
			_this.overlay.style.display = "none";
			simplemodal_onclose();
		};
		this.cancel.onclick = this.close;
		this.onSubmit = function() {
			var f = _this.form;
			var y = parseInt(f.coord_input_Y.value, 10);
			var x = parseInt(f.coord_input_X.value, 10);
			var fail = false;
			if (isNaN(y)) {
				fail = true;
				f.coord_input_Y.style.border = "1px solid red";
			} else {
				f.coord_input_Y.style.border = "";
				f.coord_input_Y.value = y;
			}
			if (isNaN(x)) {
				fail = true;
				f.coord_input_X.style.border = "1px solid red";
			} else {
				f.coord_input_X.style.border = "";
				f.coord_input_X.value = x;
			}
			if (!fail) {
				_this.close();
				setTimeout((function() {
					return _this.callback(y, x);
				}), 0);
			}
			return false;
		};
		this.form.onsubmit = this.onSubmit;
	}
	CoordinateInputModal.prototype.open = function(title, callback) {
		this.title.innerText = title;
		this.isOpen = true;
		this.callback = callback;
		this.panel.style.display = "";
		this.overlay.style.display = "";
		this.input.focus();
		simplemodal_onopen();
		this.panel.style.width = "";
		this.panel.style.height = "";
		var el_width = this.el.offsetWidth;
		var el_height = this.el.offsetHeight;
		if(el_height < 80) el_height = 80;
		if(el_width < 160) el_width = 160;
		this.panel.style.width = el_width + "px";
		this.panel.style.height = el_height + "px";
		setModalPosition();
	};
	return CoordinateInputModal;
}());

var ColorInputModal = (function() {
	function ColorInputModal() {
		var _this = this;
		this.isOpen = false;
		this.panel = document.getElementById("color_input_panel");
		this.overlay = document.getElementById("simplemodal-overlay");
		this.input = document.getElementById("color_input_form_input");
		this.cancel = document.getElementById("color_input_cancel");
		this.form = document.getElementById("color_input_form");
		this.el = document.getElementById("color_input_modal");
		ModalRefs.push(this);
		this.close = function() {
			_this.panel.style.display = "none";
			_this.overlay.style.display = "none";
			simplemodal_onclose();
		};
		this.cancel.onclick = this.close;
		this.onSubmit = function() {
			var code = _this.input.value;
			_this.close();
			setTimeout((function() {
				return _this.callback(code);
			}), 0);
			return false;
		};
		this.form.onsubmit = this.onSubmit;
	}
	ColorInputModal.prototype.open = function(callback) {
		this.isOpen = true;
		this.callback = callback;
		this.panel.style.display = "";
		this.overlay.style.display = "";
		this.input.focus();
		simplemodal_onopen();
		this.panel.style.width = "";
		this.panel.style.height = "";
		var el_width = this.el.offsetWidth;
		var el_height = this.el.offsetHeight;
		if(el_height < 80) el_height = 80;
		if(el_width < 160) el_width = 160;
		this.panel.style.width = el_width + "px";
		this.panel.style.height = el_height + "px";
		setModalPosition();
	};
	return ColorInputModal;
}());

var SelectionModal = (function() {
	function SelectionModal() {
		var _this = this;
		this.isOpen = false;
		this.panel = document.getElementById("area_panel");
		this.overlay = document.getElementById("simplemodal-overlay");
		this.cancel = document.getElementById("area_cancel");
		this.el = document.getElementById("area_modal");
		this.res = document.getElementById("area_results");
		this.cpy = document.getElementById("area_copy");
		this.c_color = document.getElementById("area_cbox_color");
		this.c_tleft = document.getElementById("area_cbox_tleft");
		this.c_tright = document.getElementById("area_cbox_tright");
		this.c_tempty = document.getElementById("area_cbox_tempty");
		this.c_rgap = document.getElementById("area_cbox_rgap");
		this.c_rlnbrk = document.getElementById("area_cbox_rlnbrk");
		this.c_rsurrog = document.getElementById("area_cbox_rsurrog");
		this.c_rcomb = document.getElementById("area_cbox_rcomb");
		this.textData = null;
		this.colorData = null;

		this.updateTextOutput = function() {
			if(!_this.isOpen) return;
			var o_color = _this.c_color.checked;
			var o_tleft = _this.c_tleft.checked;
			var o_tright = _this.c_tright.checked;
			var o_tempty = _this.c_tempty.checked;
			var o_rgap = _this.c_rgap.checked;
			var o_rlnbrk = _this.c_rlnbrk.checked;
			var o_rsurrog = _this.c_rsurrog.checked;
			var o_rcomb = _this.c_rcomb.checked;
			var text = _this.textData.split("\n");
			var currentCol = -1;
			for(var y = 0; y < text.length; y++) {
				text[y] = advancedSplit(text[y], o_rsurrog, o_rcomb);
				var colRow;
				if(o_color) colRow = _this.colorData.slice(y * text[y].length, y * text[y].length + text[y].length);
				if(o_tleft || o_tright || o_rgap) spaceTrim(text[y], o_tleft, o_tright, o_rgap, colRow);
				var line = text[y];
				if(o_color) {
					for(var x = 0; x < line.length; x++) {
						var col = colRow[x];
						if(col == currentCol) continue;
						currentCol = col;
						var chr = "\x1b";
						// optimized for using less bytes
						if(col == 0) {
							chr += "x";
						} else {
							var colc = col.toString(16);
							if(colc.length == 1) chr += "A";
							if(colc.length == 2) chr += "B";
							if(colc.length == 3) chr += "C";
							if(colc.length == 4) chr += "D";
							if(colc.length == 5) chr += "E";
							if(colc.length == 6) chr += "F";
							chr += colc;
						}
						chr += line[x];
						line[x] = chr;
					}
				}
				text[y] = text[y].join("");
			}
			if(o_tempty) {
				for(var y = 0; y < text.length; y++) {
					if(!text[y]) {
						text.splice(y, 1);
						y--;
					}
				}
			}
			if(!o_rlnbrk) {
				text = text.join("\n");
			} else {
				text = text.join("");
			}
			_this.res.value = text;
		}
		
		ModalRefs.push(this);
		this.close = function() {
			_this.panel.style.display = "none";
			_this.overlay.style.display = "none";
			_this.textData = null;
			_this.colorData = null;
			simplemodal_onclose();
		};
		this.cancel.onclick = this.close;
		this.cpy.onclick = function() {
			w.clipboard.copy(_this.res.value);
		}
		this.c_color.onclick = _this.updateTextOutput;
		this.c_tleft.onclick = _this.updateTextOutput;
		this.c_tright.onclick = _this.updateTextOutput;
		this.c_tempty.onclick = _this.updateTextOutput;
		this.c_rgap.onclick = _this.updateTextOutput;
		this.c_rlnbrk.onclick = _this.updateTextOutput;
		this.c_rsurrog.onclick = _this.updateTextOutput;
		this.c_rcomb.onclick = _this.updateTextOutput;
	}
	SelectionModal.prototype.open = function(str, colors) {
		this.textData = str;
		this.colorData = colors;
		this.isOpen = true;
		this.panel.style.display = "";
		this.overlay.style.display = "";
		simplemodal_onopen();
		this.panel.style.width = "";
		this.panel.style.height = "";
		var el_width = this.el.offsetWidth;
		var el_height = this.el.offsetHeight;
		if(el_height < 300) el_height = 300;
		if(el_width < 460) el_width = 460;
		this.panel.style.width = el_width + "px";
		this.panel.style.height = el_height + "px";
		setModalPosition();
		this.updateTextOutput();
	}
	return SelectionModal;
}());