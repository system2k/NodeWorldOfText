var modalOverlay = document.getElementById("modal_overlay");
var modalOverlaySelected = false;

modalOverlay.onmousedown = function(e) {
	if(e.target == modalOverlay) {
		modalOverlaySelected = true;
	} else {
		modalOverlaySelected = false;
	}
}

modalOverlay.onmouseup = function(e) {
	if(modalOverlaySelected && e.target == modalOverlay) {
		if(Modal.current) {
			Modal.current.close();
		}
	}
	modalOverlaySelected = false;
}

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
	this.inputField = null;
	this.formTitle = null;
	this.formField = null;
	this.formInputs = [];

	this.footerCont = [];
	this.footerField = null;

	this.isOpen = false;
	this.hasSubmitted = false;

	this.submitFn = null;
	this.openFn = null;
	this.closeFn = null;
	this.tabChangeFn = null;

	this.cbField = null;
	this.cbList = [];
	this.cbCallback = null;

	this.tabList = [];
	this.tabIndex = {};
	this.currentTabCtx = null;

	var frame = document.createElement("div");
	frame.className = "modal_frame";
	frame.style.flexDirection = "column";
	frame.style.display = "none";
	frame.style.position = "absolute";
	frame.style.minWidth = "16px";
	frame.style.minHeight = "16px";

	var fClient = document.createElement("div");
	fClient.className = "modal_client";
	fClient.style.flex = "1";
	fClient.style.margin = "6px";
	fClient.style.padding = "12px";
	fClient.style.position = "relative";

	var tField = document.createElement("div");
	tField.className = "modal_tab_field";
	tField.style.display = "none";
	tField.style.margin = "6px";
	tField.style.marginBottom = "0px";
	tField.style.paddingLeft = "4px";
	tField.style.display = "none"; // TODO
	tField.style.alignItems = "flex-end";

	frame.appendChild(tField);
	frame.appendChild(fClient)
	modalOverlay.appendChild(frame);

	this.frame = frame;
	this.client = fClient;
	this.tabField = tField;

	Modal.list.push(this);
	return this;
}

Modal.closeAll = function() {
	for(var i = 0; i < Modal.list.length; i++) {
		var modal = Modal.list[i];
		modal.close();
	}
}
Modal.isOpen = false;
Modal.current = null;
Modal.list = [];

/*
	Creates a form section in the modal.
	Modals are currently limited to one form only.
*/
Modal.prototype.createForm = function() {
	if(this.formField) return;
	var self = this;
	var formField = document.createElement("div");
	var inputField = document.createElement("div");
	var title = document.createElement("div");
	var subField = document.createElement("div");

	inputField.style.display = "grid";
	inputField.style.gap = "2px";
	inputField.style.marginBottom = "2px";

	var subm = document.createElement("button");
	subm.innerText = "Go";
	subm.style.paddingLeft = "11px";
	subm.style.paddingRight = "11px";
	subm.onclick = function() {
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
	subField.appendChild(subm);
	subField.append(" or ");
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

/*
	Validates, processes, and submits the form.
	This triggers the onSubmit callback.
*/
Modal.prototype.submitForm = function() {
	if(this.hasSubmitted) return;

	// validation
	var formFailed = false;
	for(var i = 0; i < this.formInputs.length; i++) {
		var fInput = this.formInputs[i];
		var val = fInput.input.value;
		var failed = false;
		if(fInput.validation == "number") {
			var num = parseFloat(val);
			if(!isFinite(num) || isNaN(num)) {
				failed = true;
			}
		} else if(fInput.validation == "required") {
			failed = !val;
		}
		if(failed) {
			fInput.validationFailed = true;
			fInput.input.style.border = "1px solid red";
			formFailed = true;
		} else if(fInput.validationFailed) {
			fInput.validationFailed = false;
			fInput.input.style.border = "";
		}
	}
	if(formFailed) {
		return;
	}

	this.hasSubmitted = true;
	if(this.submitFn) {
		var argList = {};
		for(var i = 0; i < this.formInputs.length; i++) {
			var fInput = this.formInputs[i];
			argList[fInput.label] = fInput.input.value;
			argList[i] = fInput.input.value;
		}
		argList.length = this.formInputs.length;
		this.submitFn(argList);
	}
	if(this.isOpen) {
		this.close();
	}
}

/*
	Revert the form and close the modal.
*/
Modal.prototype.cancelForm = function() {
	// revert the form values
	this.close(true);
}

/*
	Line up all form labels.
	The form labels are set to the left and the inputs are set to the right.
*/
Modal.prototype.alignForm = function() {
	if(!this.formField) {
		throw "No form exists";
	}
	this.inputField.style.gridTemplateColumns = "0fr 1fr";
}

/*
	Set each form label on its own line.
*/
Modal.prototype.unalignForm = function() {
	if(!this.formField) {
		throw "No form exists";
	}
	this.inputField.style.gridTemplateColumns = "";
}

/*
	Add an input entry to the form.
	label: The label to be shown next to the input.
	type (optional): 'text' or 'color'.
	validation (optional): 'number'. Check if the entry contains a valid value.
*/
Modal.prototype.addEntry = function(label, type, validation) {
	if(!this.formField) {
		throw "No form exists";
	}
	var self = this;
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
	inp.onkeydown = function(e) {
		if(e.key == "Enter") {
			self.submitForm();
		}
	}
	this.inputField.appendChild(lab);
	this.inputField.appendChild(inp);
	if(isColor) {
		window.jscolor.installByClassName("jscolor");
	}
	this.formInputs.push({
		input: inp,
		value: inp.value,
		validation: validation,
		validationFailed: false,
		type: type,
		label: label
	});
	return {
		input: inp
	};
}

/*
	Sets the fixed size of the modal.
	Any overflown content will be hidden.
	Setting either dimension to zero will reset that dimension.
*/
Modal.prototype.setSize = function(width, height) {
	if(width) {
		this.frame.style.width = width + "px";
	} else {
		this.frame.style.width = "";
	}
	if(height) {
		this.frame.style.height = height + "px";
	} else {
		this.frame.style.height = "";
	}
}

/*
	Sets the minimum size of the modal.
	The modal cannot be smaller than this size.
	Setting either dimension to zero will reset that dimension.
*/
Modal.prototype.setMinimumSize = function(width, height) {
	if(width) {
		this.frame.style.minWidth = width + "px";
	} else {
		this.frame.style.minWidth = "";
	}
	if(height) {
		this.frame.style.minHeight = height + "px";
	} else {
		this.frame.style.minHeight = "";
	}
}

/*
	Sets the maximum size of the modal.
	The modal cannot be bigger than this size. Overflown content will be hidden.
	Setting either dimension to zero will reset that dimension.
*/
Modal.prototype.setMaximumSize = function(width, height) {
	if(width) {
		this.frame.style.maxWidth = width + "px";
	} else {
		this.frame.style.maxWidth = "";
	}
	if(height) {
		this.frame.style.maxHeight = height + "px";
	} else {
		this.frame.style.maxHeight = "";
	}

	// ensure client area doesn't overflow
	if(width && height) {
		this.client.style.overflow = "hidden";
	} else if(width) {
		this.client.style.overflowX = "hidden";
		this.client.style.overflowY = "";
	} else if(height) {
		this.client.style.overflowX = "";
		this.client.style.overflowY = "hidden";
	} else {
		this.client.style.overflow = "";
	}
}

/*
	Set a title or description at the top of the modal.
*/
Modal.prototype.setFormTitle = function(title, opts) {
	if(title == void 0) {
		title = "";
	}
	title += "";
	if(title[title.length - 1] == "\n" && title.length > 1) {
		title += "\n"; // add an extra newline due to html behavior
	}
	this.formTitle.innerText = title;
	if(opts) {
		if("bold" in opts) {
			if(opts.bold) {
				this.formTitle.style.fontWeight = "bold";
				this.formTitle.style.marginBottom = "4px";
			} else {
				this.formTitle.style.fontWeight = "";
				this.formTitle.style.marginBottom = "";
			}
		}
		if("center" in opts) {
			if(opts.center) {
				this.formTitle.style.textAlign = "center";
			} else {
				this.formTitle.style.textAlign = "";
			}
		}
	}
}

/*
	Add a footer to the bottom of the modal.
	The footer is split into three parts (left, center, right).
*/
Modal.prototype.setFooter = function() {
	if(this.footerField) return;
	var footer = document.createElement("div");
	footer.style.margin = "6px";
	footer.style.minHeight = "18px";
	footer.style.display = "flex";
	footer.style.justifyContent = "space-between";

	var cLeft = document.createElement("div");
	var cMid = document.createElement("div");
	var cRight = document.createElement("div");
	cLeft.style.display = "flex";
	cLeft.style.alignItems = "center";
	cMid.style.display = "flex";
	cMid.style.alignItems = "center";
	cRight.style.display = "flex";
	cRight.style.alignItems = "center";

	this.footerCont = [cLeft, cMid, cRight];
	footer.appendChild(cLeft);
	footer.appendChild(cMid);
	footer.appendChild(cRight);
	this.client.style.marginBottom = "0px";
	this.frame.appendChild(footer);
	this.footerField = footer;
}

/*
	Removes the footer from the modal.
*/
Modal.prototype.removeFooter = function() {
	if(!this.footerField) return;
	this.frame.removeChild(this.footerField);
	this.footerCont = [];
}

/*
	Adds a checkbox to the left section of the footer.
	labelName: name of the checkbox.
	callback: to be called when the checkbox is checked (parameter: checked)
*/
Modal.prototype.setFooterCheckbox = function(labelName, callback, defaultState) {
	if(!this.footerField) {
		this.setFooter();
	}
	var lab = document.createElement("label");
	lab.className = "modal_corner_checkbox_label";
	var cb = document.createElement("input");
	cb.type = "checkbox";
	cb.checked = Boolean(defaultState);
	cb.oninput = function() {
		if(callback) {
			callback(cb.checked);
		}
	}
	lab.appendChild(cb);
	lab.append(" " + labelName);
	this.footerCont[0].appendChild(lab);
}

/*
	Adds content to a section of the footer.
*/
Modal.prototype.setFooterContentLeft = function(data) {
	if(!this.footerField) throw "No footer exists";
	this.footerCont[0].appendChild(data);
}
Modal.prototype.setFooterContentCenter = function(data) {
	if(!this.footerField) throw "No footer exists";
	this.footerCont[1].appendChild(data);
}
Modal.prototype.setFooterContentRight = function(data) {
	if(!this.footerField) throw "No footer exists";
	this.footerCont[2].appendChild(data);
}

/*
	Clears a section of the footer.
*/
Modal.prototype.removeFooterContentLeft = function() {
	if(!this.footerField) return;
	this.footerCont[0].innerHTML = "";
}
Modal.prototype.removeFooterContentCenter = function() {
	if(!this.footerField) return;
	this.footerCont[1].innerHTML = "";
}
Modal.prototype.removeFooterContentRight = function() {
	if(!this.footerField) return;
	this.footerCont[2].innerHTML = "";
}

/*
	Set event callbacks.
	onSubmit: to be called whenever the form is submitted.
	onOpen: to be called whenever the modal is opened.
	onClose: to be called whenever the modal is closed.
	onTabChange: to be called whenever another tab is selected.
*/
Modal.prototype.onSubmit = function(callback) {
	this.submitFn = callback;
}
Modal.prototype.onOpen = function(callback) {
	this.openFn = callback;
}
Modal.prototype.onClose = function(callback) {
	this.closeFn = callback;
}
Modal.prototype.checkboxFieldOnInput = function(callback) {
	this.cbCallback = callback;
}
Modal.prototype.onTabChange = function(callback) {
	this.tabChangeFn = callback;
}

/*
	Display the modal.
	All parameters will be passed to the onOpen event.
*/
Modal.prototype.open = function(...params) {
	if(Modal.isOpen) {
		Modal.closeAll();
	}
	Modal.isOpen = true;
	Modal.current = this;
	modalOverlay.style.display = "";
	this.hasSubmitted = false;
	this.isOpen = true;
	this.frame.style.display = "flex"; // make visible
	if(this.formInputs.length) {
		var firstForm = this.formInputs[0].input;
		firstForm.focus();
	}
	for(var i = 0; i < this.formInputs.length; i++) {
		var fInput = this.formInputs[i];
		fInput.value = fInput.input.value;
	}
	if(this.openFn) {
		this.openFn(...params);
	}
}

/*
	Hide the modal.
	canceled: This modal has closed as a result of form cancelation. This will revert the values of the form inputs.
*/
Modal.prototype.close = function(canceled) {
	if(!this.isOpen) return;
	this.isOpen = false;
	this.frame.style.display = "none";
	Modal.isOpen = false;
	Modal.current = null;
	modalOverlay.style.display = "none";
	// revert all values if canceled, otherwise record them
	for(var i = 0; i < this.formInputs.length; i++) {
		var fInput = this.formInputs[i];
		if(canceled) {
			if(fInput.type == "color") {
				fInput.input.jscolor.fromString(fInput.value);
			} else {
				fInput.input.value = fInput.value;
			}
		} else {
			fInput.value = fInput.input.value;
		}
	}
	if(this.closeFn) {
		this.closeFn(canceled);
	}
}

/*
	Add a checkbox section to the modal.
	The checkbox section contains a nestable list of checkbox inputs.
	Only one checkbox field is currently supported.
*/
Modal.prototype.createCheckboxField = function() {
	if(this.cbField) return;
	var field = document.createElement("div");
	this.cbField = field;
	this.client.appendChild(field);
}

/*
	Adds a checkbox to the checkbox field.
	label: The name of the checkbox.
	parent (optional): The parent checkbox. Nested checkboxes will be indented.
*/
Modal.prototype.addCheckbox = function(label, parent) {
	if(!this.cbField) {
		throw "No checkbox field exists";
	}
	var self = this;
	var cbTitle = label;
	var cbParent = null;
	if(parent) {
		cbParent = parent;
	}

	var label = document.createElement("label");
	var cb = document.createElement("input");
	cb.type = "checkbox";
	label.style.display = "block";
	label.style.userSelect = "none";
	label.appendChild(cb);
	label.append(" " + cbTitle);

	var threshold = 0;
	var cbObj = {
		elm: label,
		cbElm: cb,
		children: []
	};
	if(cbParent) {
		threshold = cbParent.level + 1;
		label.style.marginLeft = (20 * threshold) + "px";
		if(cbParent.children.length) {
			var lastChild = cbParent.children[cbParent.children.length - 1];
			var nextElm = lastChild.nextSibling;
			if(nextElm) {
				lastChild.elm.insertBefore(label, nextElm);
			} else {
				this.cbField.appendChild(label);
			}
		} else {
			var nextElm = cbParent.elm.nextSibling;
			if(nextElm) {
				cbParent.elm.insertBefore(label, nextElm);
			} else {
				this.cbField.appendChild(label);
			}
		}
		cbObj.level = threshold;
		cbParent.children.push(cbObj);
	} else {
		this.cbField.appendChild(label);
		cbObj.level = threshold;
		this.cbList.push(cbObj);
	}

	cb.onclick = function() {
		if(self.cbCallback) {
			self.cbCallback(cbObj, cb.checked);
		}
		updateModalCheckboxField(cbObj.children, cbObj);
	}

	updateModalCheckboxField(this.cbList);

	return cbObj;
}

/*
	Insert a new tab to the modal along with a new client area.
	If no tab exists, the current client area becomes part of the first tab.
*/
Modal.prototype.addTab = function(id, title) {
	if(this.tabIndex[id]) {
		throw "Tab already exists with the same id ('" + id + "')";
	}
	var self = this;
	var tabBtn = document.createElement("div");
	tabBtn.className = "modal-tab-btn";
	tabBtn.innerText = title;
	tabBtn.style.display = "inline-block";

	var tabContext = null;
	if(this.tabList.length == 0) { // initial tab
		tabBtn.style.backgroundColor = "#E5E5FF";
		tabBtn.style.height = "24px";

		tabContext = {
			id: id,
			tabButton: tabBtn,
			client: this.client,
			inputField: this.inputField,
			formTitle: this.formTitle,
			formField: this.formField,
			formInputs: this.formInputs,
			hasSubmitted: this.hasSubmitted,
			cbField: this.cbField,
			cbList: this.cbList,
			cbCallback: this.cbCallback
		};

		this.currentTabCtx = tabContext;
	} else { // extra tabs
		tabBtn.style.height = "18px";

		var fClient = document.createElement("div");
		fClient.className = "modal_client";
		fClient.style.flex = "1";
		fClient.style.margin = "6px";
		fClient.style.padding = "12px";
		fClient.style.position = "relative";
		fClient.style.marginTop = "0px";
		fClient.style.display = "none";

		if(this.footerField) {
			fClient.style.marginBottom = "0px";
			this.frame.removeChild(this.footerField);
		}
		this.frame.appendChild(fClient);
		if(this.footerField) {
			this.frame.appendChild(this.footerField);
		}

		tabContext = {
			id: id,
			tabButton: tabBtn,
			client: fClient,
			inputField: null,
			formTitle: null,
			formField: null,
			formInputs: [],
			hasSubmitted: false,
			cbField: null,
			cbList: [],
			cbCallback: null
		};
	}
	tabBtn.style.paddingLeft = "4px";
	tabBtn.style.paddingRight = "4px";
	tabBtn.style.paddingTop = "2px";
	tabBtn.style.paddingBottom = "2px";
	tabBtn.style.fontSize = "1em";
	this.tabField.style.display = "flex";

	tabBtn.onclick = function() {
		self.focusTab(id);
	}

	this.client.style.marginTop = "0px";

	this.tabField.appendChild(tabBtn);

	this.tabList.push(tabContext);
	this.tabIndex[id] = tabContext;
}

/*
	Make the tab the current visible tab.
*/
Modal.prototype.focusTab = function(id) {
	if(this.currentTabCtx == this.tabIndex[id]) {
		return;
	}

	if(this.tabChangeFn) {
		this.tabChangeFn({
			id: id
		});
	}

	var prev = this.currentTabCtx;
	var curr = this.tabIndex[id];
	this.currentTabCtx = this.tabIndex[id];

	prev.client.style.display = "none";
	prev.tabButton.style.height = "18px";
	prev.tabButton.style.backgroundColor = "";

	curr.client.style.display = "";
	curr.tabButton.style.height = "24px";
	curr.tabButton.style.backgroundColor = "#E5E5FF";

	// transfer context
	this.client = curr.client;
	this.inputField = curr.inputField;
	this.formTitle = curr.formTitle;
	this.formField = curr.formField;
	this.formInputs = curr.formInputs;
	this.hasSubmitted = curr.hasSubmitted;
	this.cbField = curr.cbField;
	this.cbList = curr.cbList;
	this.cbCallback = curr.cbCallback;
}

/*
	If there are any defined tabs, return the ID of the currently active tab.
*/
Modal.prototype.getCurrentTabId = function() {
	if(!this.currentTabCtx) return null;
	return this.currentTabCtx.id;
}

/*
	Hide tab from the tab bar. This will not bring you to the next available tab.
*/
Modal.prototype.hideTab = function(id) {
	if(!this.tabIndex[id]) return;
	this.tabIndex[id].tabButton.style.display = "none";
}

/*
	Show tab on the tab bar.
*/
Modal.prototype.showTab = function(id) {
	if(!this.tabIndex[id]) return;
	this.tabIndex[id].tabButton.style.display = "";
}

/*
	Return raw tab data.
*/
Modal.prototype.getTabData = function(id) {
	return this.tabIndex[id] || null;
}

/*
	Insert content to the modal.
*/
Modal.prototype.append = function(elm) {
	this.client.appendChild(elm);
}

/*
	Adds a close caption to the bottom right of the modal.
*/
Modal.prototype.createClose = function() {
	var span = document.createElement("span");
	span.className = "modal_close";
	span.innerText = "Close";
	var self = this;
	span.onclick = function() {
		self.close();
	}
	this.client.appendChild(span);
}
