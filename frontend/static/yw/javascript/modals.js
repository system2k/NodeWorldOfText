var modalOverlay = document.getElementById("modal_overlay");
modalOverlay.onclick = function(e) {
	if(e.target != modalOverlay) return;
	if(Modal.current) {
		Modal.current.close();
	}
}
var modalList = [];
function closeAllModals() {
	for(var i = 0; i < modalList.length; i++) {
		var modal = modalList[i];
		modal.close();
	}
} // TODO: restructure

function updateModalCheckboxField(list, parent) {
	if(parent) {
		if(!parent.cbElm.checked || parent.cbElm.disabled) {
			for(var i = 0; i < list.length; i++) {
				list[i].cbElm.disabled = true;
			}
		} else {
			for(var i = 0; i < list.length; i++) {
				list[i].cbElm.disabled = false;
			}
		}
	}
	for(var i = 0; i < list.length; i++) {
		updateModalCheckboxField(list[i].children, list[i]);
	}
}

function Modal() {
	// placeholder names
	this.formTitle = null;
	this.formField = null;
	this.inputField = null;
	this.size = [0, 0];
	this.footerCont = [];
	this.isOpen = false;
	this.hasSubmitted = false;

	this.submitFn = null;
	this.openFn = null;
	this.closeFn = null;

	this.cbField = null;
	this.cbList = [];
	this.cbCallback = null;

// border: #c3c3ff
// frame: #e5e5ff
// TODO: allow Enter
// TODO: easier inputting on mobile (put form up on top instead of center)
// TODO: click on modal overlay to close
// TODO: input focus
// TODO: dont nest checkboxes

	var frame = document.createElement("div");
	frame.style.flexDirection = "column";
	frame.style.display = "none";
	var fClient = document.createElement("div");
	fClient.style.backgroundColor = "#e5e5ff";
	fClient.style.flex = "1";
	frame.style.backgroundColor = "#c3c3ff";
	fClient.style.margin = "6px";
	fClient.style.padding = "12px";

	frame.style.position = "absolute";
	fClient.style.position = "relative";

	frame.appendChild(fClient)
	modalOverlay.appendChild(frame);
	frame.style.minWidth = "250px";
	frame.style.minHeight = "120px";

	this.frame = frame;
	this.client = fClient;

	modalList.push(this);


	return this;
}

Modal.isOpen = false;
Modal.current = null;

Modal.prototype.createForm = function() {
	var formField = document.createElement("div");
	var inputField = document.createElement("div");
	var title = document.createElement("div");
	var subField = document.createElement("div");
	var self = this;
	title.style.minHeight = "18px";

	inputField.style.display = "grid";
	inputField.style.gap = "2px";
	inputField.style.marginBottom = "2px";

	var subBtn = document.createElement("button");
	subBtn.innerText = "Go";
	subBtn.style.paddingLeft = "11px";
	subBtn.style.paddingRight = "11px";
	subBtn.onclick = function() {
		self.submitForm();
	}
	var canc = document.createElement("span");
	canc.innerText = "cancel";
	canc.style.color = "blue";
	canc.style.textDecoration = "underline";
	canc.style.cursor = "pointer";
	canc.onclick = function() {
		self.cancelForm();
	}
	subField.appendChild(subBtn);
	subField.appendChild(document.createTextNode(" or "));
	subField.appendChild(canc);

	formField.appendChild(title);
	formField.appendChild(inputField);
	formField.appendChild(subField);
	this.formTitle = title;
	this.formField = formField;
	this.inputField = inputField;
	this.subField = subField;
	this.client.appendChild(formField);
	this.alignForm();
}
Modal.prototype.submitForm = function() {
	if(this.hasSubmitted) return;
	this.hasSubmitted = true;
	if(this.submitFn) {
		this.submitFn();
	}
	if(this.isOpen) {
		this.close();
	}
}
Modal.prototype.cancelForm = function() {
	// TODO: revert input fields
	this.close(true);
}
Modal.prototype.alignForm = function() {
	this.inputField.style.gridTemplateColumns = "0fr 1fr";
}
Modal.prototype.unalignForm = function() {
	this.inputField.style.gridTemplateColumns = "";
}
// TODO: validation
Modal.prototype.addEntry = function(label, type, validation) {
	var lab = document.createElement("label");
	lab.innerText = label + ":";
	lab.style.marginRight = "3px";
	lab.style.whiteSpace = "nowrap";
	var inp = document.createElement("input");
	inp.style.width = "150px";
	var isColor = false;
	if(!type) {
		type = "text";
	}
	if(type == "color") {
		inp.className = "jscolor";
		isColor = true;
	}
	this.inputField.appendChild(lab);
	this.inputField.appendChild(inp);
	if(isColor) {
		window.jscolor.installByClassName("jscolor");
	}
	return {
		input: inp
	};
}
Modal.prototype.setMinimumSize = function(width, height) {
	this.size = [width, height];
	this.frame.style.minWidth = width + "px";
	this.frame.style.minHeight = height + "px";
}
Modal.prototype.setMaximumSize = function(width, height) {
	this.frame.style.maxWidth = width + "px";
	this.frame.style.maxHeight = height + "px";
}
Modal.prototype.setFormTitle = function(title) {
	this.formTitle.innerText = title;
	if(title) {
		this.formTitle.style.marginBottom = "18px";
	} else {
		this.formTitle.style.marginBottom = "";
	}
}
Modal.prototype.setFooter = function() {
	var footer = document.createElement("div");
	footer.style.margin = "6px";
	footer.style.minHeight = "18px";
	footer.style.display = "flex";
	footer.style.justifyContent = "space-between";
	var cLeft = document.createElement("div");
	var cMid = document.createElement("div");
	var cRight = document.createElement("div");
	this.footerCont = [cLeft, cMid, cRight];
	footer.appendChild(cLeft);
	footer.appendChild(cMid);
	footer.appendChild(cRight);
	this.client.style.marginBottom = "0px";
	this.frame.appendChild(footer);
}
Modal.prototype.setFooterCheckbox = function(callback) {
	if(!this.footerCont) return; // TODO (make footer)
	var lab = document.createElement("label");
	lab.id = "cursor_outline_toggle_label";
	var cb = document.createElement("input");
	cb.id = "cursor_outline_toggle";
	cb.type = "checkbox";
	cb.oninput = function() {
		if(callback) {
			callback(cb.checked);
		}
	}
	lab.appendChild(cb);
	lab.appendChild(document.createTextNode(" Outline"));
	this.footerCont[0].appendChild(lab);
}
Modal.prototype.setFooterContentLeft = function(data) {
	if(!this.footerCont) return;
	this.footerCont[0].appendChild(data);
}
Modal.prototype.setFooterContentCenter = function(data) {
	if(!this.footerCont) return;
	this.footerCont[1].appendChild(data);
}
Modal.prototype.setFooterContentRight = function(data) {
	if(!this.footerCont) return;
	this.footerCont[2].appendChild(data);
}
Modal.prototype.onSubmit = function(callback) {
	this.submitFn = callback;
}
Modal.prototype.onOpen = function(callback) {
	this.openFn = callback;
}
Modal.prototype.onClose = function(callback) {
	this.closeFn = callback;
}
Modal.prototype.open = function(...params) {
	if(Modal.isOpen) {
		closeAllModals();
	}
	Modal.isOpen = true;
	Modal.current = this;
	modalOverlay.style.display = "";
	this.hasSubmitted = false;
	this.isOpen = true;
	this.frame.style.display = "flex";
	if(this.openFn) {
		this.openFn(...params);
	}
}
Modal.prototype.close = function(canceled) {
	if(!this.isOpen) return;
	this.isOpen = false;
	this.frame.style.display = "none";
	Modal.isOpen = false;
	Modal.current = null;
	modalOverlay.style.display = "none";
	if(this.closeFn) {
		this.closeFn(canceled);
	}
}
Modal.prototype.setCheckboxField = function() {
	if(this.cbField) throw "err";
	var field = document.createElement("div");
	this.cbField = field;
	this.client.appendChild(field);
}
Modal.prototype.addCheckbox = function(arg1, arg2) {
	var cbTitle = "";
	var cbParent = null;
	if(typeof arg1 == "string" && typeof arg2 == "undefined") {
		cbTitle = arg1;
	} else if(typeof arg1 == "object" && typeof arg2 == "string") {
		cbParent = arg1;
		cbTitle = arg2;
	} else {
		throw "arg";
	}

	var label = document.createElement("label");
	var cb = document.createElement("input");
	cb.type = "checkbox";
	label.style.display = "block";
	label.style.userSelect = "none";
	label.appendChild(cb);
	label.appendChild(document.createTextNode(" " + cbTitle));

	var threshold = 0;
	var cbObj = {
		elm: label,
		cbElm: cb,
		children: []
	};
	if(cbParent) {
		threshold = cbParent.level + 1;
		label.style.marginLeft = "20px";
		cbParent.elm.appendChild(label);
		cbObj.level = threshold;
		cbParent.children.push(cbObj);
	} else {
		this.cbField.appendChild(label);
		cbObj.level = threshold;
		this.cbList.push(cbObj);
	}

	var self = this;
	cb.onclick = function() {
		if(self.cbCallback) {
			self.cbCallback(cbObj, cb.checked);
		}
		updateModalCheckboxField(cbObj.children, cbObj);
	}

	updateModalCheckboxField(this.cbList);

	return cbObj;
}
Modal.prototype.checkboxFieldOnInput = function(callback) {
	this.cbCallback = callback;
}
Modal.prototype.append = function(elm) {
	this.client.appendChild(elm);
}
Modal.prototype.setClose = function() {
	var span = document.createElement("span");
	span.className = "modal_close";
	span.innerText = "Close";
	var self = this;
	span.onclick = function() {
		self.close();
	}
	this.client.appendChild(span);
}
