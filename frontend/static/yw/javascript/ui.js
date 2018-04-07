var ui = {
    menubar: null,
    taskbar: null
};

ui.taskbarHeight = 44;
ui.menubarHeight = 20;

ui.createElement = function(type, style) {
    var elm = document.createElement(type);
    for(var i in style) {
        elm.style[i] = style[i];
    }
    return elm;
}

ui.style = function(dom, style) {
    for(var i in style) {
        dom.style[i] = style[i];
    }
}

ui.buildTaskbar = function() {
    var bar = ui.createElement("div", {
        position: "absolute",
        width: "100%",
        height: ui.taskbarHeight + "px",
        backgroundColor: "#BFBFBF",
        bottom: "0px"
    })
    document.body.appendChild(bar);
    ui.taskbar = bar;
}

ui.buildMenubar = function() {
    var bar = ui.createElement("div", {
        position: "absolute",
        width: "100%",
        height: ui.menubarHeight + "px",
        backgroundColor: "#BFBFBF",
        top: "0px"
    })
    document.body.appendChild(bar);
    ui.menubar = bar;
}

ui.menuItems = [];

ui.addTaskbarItem = function(dom) {
    var totalItems = ui.menuItems.length;
    var spacing = 8;
    var itemWidth = 32;
    var itemHeight = 32;
    var borderWidth = 2;
    var borderHalf = Math.floor(borderWidth / 2);
    var topMargin = Math.floor((ui.taskbarHeight - itemHeight) / 2);
    var leftMargin = 32 * totalItems + spacing * (totalItems + 1) - borderHalf;
    var item = ui.createElement("div", {
        position: "absolute",
        width: itemWidth + "px",
        height: itemHeight + "px",
        backgroundColor: "#D9D9D9",
        top: (topMargin - borderHalf) + "px",
        left: leftMargin + "px",
        borderWidth: borderWidth + "px",
        borderStyle: "solid"
    })
    item.appendChild(dom);
    ui.taskbar.appendChild(item);
    ui.menuItems.push(item)
}

buildFontChangeItem = function() {
    var itemDom = ui.createElement("div", {
        width: "32px",
        height: "32px"
    })
    var text = ui.createElement("span", {
        fontSize: "25px",
        position: "absolute",
        top: "-2x",
        left: "7px"
    })
    var textColor = ui.createElement("div", {
        backgroundColor: "red",
        position: "absolute",
        top: "24px",
        left: "4px",
        width: "24px",
        height: "6px"
    })
    text.innerText = "A"
    itemDom.appendChild(text)
    itemDom.appendChild(textColor)
    return itemDom
}
buildChatItem = function() {
    var item = imageLoader.res.chatIcon;
    ui.style(item, {
        width: "32px",
        height: "32px"
    })
    return item;
}

ui.execute = function() {
    ui.buildTaskbar();
    ui.buildMenubar();

    ui.addTaskbarItem(buildChatItem());
    ui.addTaskbarItem(buildFontChangeItem());
}