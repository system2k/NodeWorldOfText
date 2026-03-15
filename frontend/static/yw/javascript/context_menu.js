function getContextMenuTop(menu) {
    var top = menu;
    while (top.parent) {
        top = top.parent;
    }
    return top;
}
class ContextMenu {
    constructor() {
        var _this = this;
        this.frame = document.createElement("div");
        this.frame.className = "custom_ctx";
        this.frame.style.display = "none";
        this.frame.style.flexDirection = "column";
        document.body.appendChild(this.frame);

        document.addEventListener("click", function(e) {
            if (
                e.target.className == "custom_ctx" ||
                e.target.className == "custom_ctx_button" ||
                e.target.className == "custom_ctx_divisor"
            ) return;
            _this.close();
        });
        this.frame.addEventListener("contextmenu", function(e) {
            e.preventDefault();
        });
        document.addEventListener("keydown", function(e) {
            if (!checkKeyPress(e, keyConfig.reset)) return;
            _this.close();
        });

        this.frame.onmouseenter = function() {
            var frame = _this;
            while (frame) {
                clearTimeout(frame.timeout);
                frame = frame.parent;
            }
        }
        this.frame.onmouseleave = function() {
            var top = getContextMenuTop(_this);
            if (_this == top) return;
            var frame = top.dropdown;
            frame.timeout = setTimeout(function() {
                frame.close();
            }, _this.timeoutMs);
            if (_this == frame) return;
            _this.timeout = setTimeout(function() {
                _this.close();
            }, _this.timeoutMs);
        }

        this.width = null;
        this.height = null;
        this.isOpen = false;
        this.hoveringId = null;
        this.entries = [];
        this.divisors = [];

        this.openFn = null;
        this.moveFn = null;
        this.closeFn = null;
        this.submitFn = null;

        this.parent = null;
        this.dropdown = null;
        this.timeout = null;
        this.timeoutMs = 400;

        ContextMenu.list.push(this);
    }
    addOption(text, action, rightAction, close = true) {
        var _this = this;
        var elm = document.createElement("button");
        elm.className = "custom_ctx_button";
        elm.innerText = text;
        elm.style.minWidth = `${this.width}px`;
        elm.onclick = function(e) {
            if (!action) return;
            action(e);
            if (close) {
                var top = getContextMenuTop(_this);
                top.close();
            }
            if (_this.submitFn) _this.submitFn(e);
        }
        elm.oncontextmenu = function(e) {
            if (!rightAction) return;
            rightAction(e);
            if (close) {
                var top = getContextMenuTop(_this);
                top.close();
            }
            if (_this.submitFn) _this.submitFn(e);
        }
        elm.onmouseover = function(e) {
            _this.hoveringId = id;
            if (_this.dropdown) _this.closeDropdown();
        }

        this.frame.appendChild(elm);
        var id = this.entries.push({
            elm,
            action,
            rightAction
        });
        return id - 1;
    }
    rename(id, text) {
        if (!this.entries[id]) return;
        this.entries[id].elm.innerText = text;
    }
    addDivisor() {
        var divisor = document.createElement("div");
        divisor.className = "custom_ctx_divisor";
        this.frame.appendChild(divisor);
        var id = this.divisors.push(divisor);
        return id - 1;
    }
    insertDivisor(id) {
        if (!this.entries[id]) return;
        var divisorId = this.addDivisor();
        var divisor = this.divisors[divisorId];
        this.frame.insertBefore(divisor, this.entries[id].elm);
        return divisorId;
    }
    hideDivisor(id) {
        if (!this.divisors[id]) return;
        this.divisors[id].style.display = "none";
    }
    move(x, y, spacingX = 0, spacingY = 0) {
        var bounds = this.frame.getBoundingClientRect();
        var curWidth = bounds.width;
        var curHeight = bounds.height;
        x = Math.min(Math.max(x, 0), innerWidth);
        y = Math.min(Math.max(y, 0), innerHeight);
        if (innerWidth - x < curWidth && innerWidth > curWidth) x -= curWidth + spacingX - 1;
        if (innerHeight - y < curHeight && innerHeight > curHeight) y -= curHeight + spacingY - 1;
        this.frame.style.left = `${x}px`;
        this.frame.style.top = `${y}px`;
        this.closeDropdown();
    }
    resize(width, height) {
        if (width) {
            this.frame.style.minWidth = `${width}px`;
            this.width = width;
        }
        if (height) {
            this.frame.style.minHeight = `${height}px`;
            this.height = height;
        }
        this.entries.forEach(entry => {
            if (width) entry.elm.style.minWidth = `${width}px`;
        });
    }
    direction(string) {
        this.frame.style.flexDirection = string;
    }
    open(x, y, spacingX = 0, spacingY = 0) {
        if (this.isOpen) {
            this.move(x, y, spacingX, spacingY);
            if (this.moveFn) this.moveFn(x, y, spacingX, spacingY);
            return;
        }
        var shownButtons = this.entries.filter(x => x.elm.style.display != "none").length;
        if (!shownButtons) {
            var shownDivisors = this.divisors.filter(x => x.style.display != "none").length;
            if (!shownDivisors) return;
        }
        ContextMenu.latest = this;
        this.frame.style.display = "flex";
        this.isOpen = true;
        if (this.openFn) this.openFn(x, y, spacingX, spacingY);
        this.move(x, y, spacingX, spacingY);
    }
    close() {
        if (!this.isOpen) return;
        ContextMenu.latest = null;
        this.frame.style.display = "none";
        this.isOpen = false;
        if (this.closeFn) this.closeFn();
        this.closeDropdown();
    }
    openDropdown(id) {
        if (!this.entries[id]) return;
        var button = this.entries[id].elm;
        var bounds = this.frame.getBoundingClientRect();
        var curX = bounds.x;
        var curWidth = bounds.width;
        var buttonBounds = button.getBoundingClientRect();
        var buttonY = buttonBounds.y;
        var buttonHeight = Math.round(buttonBounds.height);
        this.dropdown.open(curX + curWidth, buttonY - 3, curWidth + 1, -buttonHeight - 5);
        // -3: gap from frame to button
        // +1: border
        // -5 (+1-6): border and 2 gaps
    }
    closeDropdown() {
        if (!this.dropdown) return;
        this.dropdown.close();
        clearTimeout(this.dropdown.timeout);
    }
    setHover(id, contextMenu) {
        if (!this.entries[id]) return;
        var _this = this;
        var elm = this.entries[id].elm;
        contextMenu.parent = this;

        elm.onmouseenter = function(e) {
            _this.dropdown = contextMenu;
            _this.hoveringId = id;
            if (this.disabled) return;
            clearTimeout(_this.timeout);
            if (_this.dropdown) clearTimeout(_this.dropdown.timeout);
            var refreshDropdown = !_this.dropdown || _this.dropdown != contextMenu || !_this.dropdown.isOpen;
            if (_this.dropdown && refreshDropdown) _this.closeDropdown();
            if (refreshDropdown) _this.openDropdown(id);
        }
        elm.onmouseleave = function() {
            _this.dropdown.timeout = setTimeout(function() {
                _this.closeDropdown();
            }, _this.timeoutMs);
        }
    }
    clearHover(id, contextMenu) {
        if (!this.entries[id]) return;
        var elm = this.entries[id].elm;
        elm.onmouseenter = () => {};
        elm.onmouseleave = () => {};
        if (this.hoveringId == id) this.closeDropdown();
        contextMenu.parent = null;
    }
    show(id) {
        if (!this.entries[id]) return;
        this.entries[id].elm.style.display = "";
    }
    hide(id) {
        if (!this.entries[id]) return;
        this.entries[id].elm.style.display = "none";
        if (this.hoveringId == id) this.closeDropdown();
    }
    showBoolean(id, boolean) {
        if (!this.entries[id]) return;
        this.entries[id].elm.style.display = boolean ? "" : "none";
        if (this.hoveringId != id || boolean) return;
        this.closeDropdown();
    }
    enable(id) {
        if (!this.entries[id]) return;
        this.entries[id].elm.disabled = false;
        if (this.hoveringId == id) this.openDropdown(id);
    }
    disable(id) {
        if (!this.entries[id]) return;
        this.entries[id].elm.disabled = true;
        if (this.hoveringId == id) this.closeDropdown();
    }
    enableBoolean(id, boolean) {
        if (!this.entries[id]) return;
        this.entries[id].elm.disabled = !boolean;
        if (this.hoveringId != id) return;
        if (boolean) {
            this.openDropdown(id);
        } else {
            this.closeDropdown();
        }
    }
    onOpen(callback) {
        this.openFn = callback;
    }
    onMove(callback) {
        this.moveFn = callback;
    }
    onClose(callback) {
        this.closeFn = callback;
    }
    onSubmit(callback) {
        this.submitFn = callback;
    }
}
ContextMenu.list = [];
ContextMenu.latest = null;