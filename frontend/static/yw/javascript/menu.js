var Menu = (function() {
    function Menu(titleEl, menuEl) {
        var self = this;
        this.titleEl = titleEl;
        this.menuEl = menuEl;
        this._SPEED = 250;
        this.entries = [];
        this.addOption = function(text, action) {
            var s;
            s = document.createElement("div");
            s.innerText = text;
            s.onclick = function() {
                action();
                self.hideNow();
            }
            self.addEntry(s);
        }
        this.addCheckboxOption = function(text, checkedAction, uncheckedAction, checked) {
            var i, s;
            s = document.createElement("div");
            s.innerText = text;
            i = document.createElement("input");
            i.type = "checkbox";
            i.checked = !!checked;
            s.insertBefore(i, s.firstChild);
            s.checked = !!checked;
            s.onclick = function(e) {
                if (e.target !== i) {
                    i.checked = !i.checked;
                }
                if (i.checked) {
                    checkedAction();
                } else {
                    uncheckedAction();
                }
            }
            self.addEntry(s);
        }
        this.hideNow = function() {
            slideMenu("up", self.menuEl, self._SPEED);
            self.titleEl.classList.remove("hover");
        }
        this.cancelHide = false;
        this.hide = function() {
            self.cancelHide = false;
            setTimeout((function() {
                if (!self.cancelHide) {
                    self.hideNow();
                }
            }), 500);
        }
        this.show = function() {
            self.cancelHide = true;
            slideMenu("down", self.menuEl, self._SPEED)
            self.titleEl.classList.add("hover");
        }
        this.addEntry = function(liContents) {
            var newItem;
            var menuEl = self.menuEl.children;
            for(var i = 0; i < menuEl.length; i++) {
                var elm = menuEl[i];
                if(elm.tagName == "UL") {
                    elm.appendChild(document.createElement("li"));
                }
            }
            for(var i = 0; i < menuEl.length; i++) {
                var elm = menuEl[i];
                var children = elm.children;
                for(var x = children.length - 1; x >= 0; x--) {
                    var ch = children[x];
                    if(ch.tagName == "LI") {
                        newItem = ch;
                        break;
                    }
                }
            }
            if(typeof liContents == "string") {
                var lcDiv = document.createElement("div");
                lcDiv.innerHTML = liContents;
                var ch = lcDiv.children;
                var len = ch.length;
                for(var r = 0; r < len; r++) {
                    var elm = ch[0];
                    newItem.appendChild(elm);
                }
            } else {
                newItem.appendChild(liContents);
            }
            this.entries.push({
                element: newItem,
                content: liContents
            });
            newItem.onmouseenter = function() {
                this.classList.add("hover");
            }
            newItem.onmouseleave = function() {
                this.classList.remove("hover");
            }
        }
        this.titleEl.style.display = "";

        this.menuEl.style.top = (this.titleEl.getBoundingClientRect().top + document.body.scrollTop) + this.titleEl.offsetHeight + "px";

        this.titleEl.onmouseenter = this.show;
        this.titleEl.onmouseleave = this.hide;

        this.menuEl.onmouseenter = this.show;
        this.menuEl.onmouseleave = this.hide;
        
        this.titleEl.onclick = this.show;
        this.menuEl.onclick = this.show;
    }
    return Menu;
}());

function easeOutQuad(h, f, j, i) {
    return -j * (h /= i) * (h - 2) + f;
}

var menuAnimationState = "up";
var menuAnimationActive = false;
function slideMenu(direction, element, speed) {
    if(menuAnimationActive) return;
    var interval = 13;
    var menuMargin = 2;
    if(menuAnimationState == "up" && direction == "up") return;
    if(menuAnimationState == "down" && direction == "down") return;

    menuAnimationActive = true;
    menuAnimationState = direction;

    element.style.overflow = "hidden";
    element.style.marginTop = "0px";
    element.style.marginBottom = "0px";

    element.style.display = "block";
    var destHeight = element.offsetHeight - menuMargin * 2;
    if(direction == "down") element.style.height = "0px";
    var start = getDate();
    var end = start + speed;
    var lapse = end - start;
    var int = setInterval(function() {
        element.style.display = "block";
        var duration = getDate() - start;
        if(duration >= lapse) {
            menuAnimationActive = false;
            clearInterval(int);
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