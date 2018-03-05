var atcInfo = document.createElement("label");
atcInfo.style.display = "none";
atcInfo.innerText = "Press CTRL and move your mouse around to clear tiles. " + 
    "This will clear all tiles where the mouse cursor is located.";
atcInfo.style.backgroundColor = "black";
atcInfo.style.color = "white";
atcInfo.style.position = "absolute";
atcInfo.style.left = "0px";
atcInfo.style.top = "0px";
$("body").append(atcInfo);

var admclrActivated = document.createElement("label");
admclrActivated.innerText = " [ ACTIVE ]";
admclrActivated.style.backgroundColor = "black";
admclrActivated.style.color = "red";
admclrActivated.style.fontWeight = "bold";
admclrActivated.style.display = "none";
atcInfo.appendChild(admclrActivated);

menu.addCheckboxOption(" Clear Tiles", function() {
    // activated
    atcInfo.style.display = "";
    admclr.activated = true;
}, function() {
    // deactivated
    atcInfo.style.display = "none";
    admclr.activated = false;
    tiles[currentPosition[1] + "," + currentPosition[0]].backgroundColor = "";
    renderTile(currentPosition[0], currentPosition[1], true);
});

var admclr = {
    activated: false,
    lastPos: null,
    ctrlDown: false,
    color: "#00FF00",
    renderTile: function(preserveLastPos) {
        if(tiles[currentPosition[1] + "," + currentPosition[0]]) {
            // change color to red
            tiles[currentPosition[1] + "," + currentPosition[0]].backgroundColor = admclr.color;
            if(!preserveLastPos)
                admclr.lastPos = [currentPosition[0], currentPosition[1]];
            // re-render the tile
            renderTile(currentPosition[0], currentPosition[1], true);
        }
    },
    handleClear: function(x, y) {
        var data = {
            kind: "clear_tile",
            tileX: x,
            tileY: y
        };
        socket.send(JSON.stringify(data));
    }
};

// ctrl is pressed
$("body").on("keydown.admclr", function(e) {
    if(!admclr.activated) return;
    if(admclr.ctrlDown) return;
    if(e.ctrlKey) {
        admclr.ctrlDown = true;
        admclrActivated.style.display = "";
        admclr.color = "#FF0000";
        admclr.renderTile(true);
        admclr.handleClear(currentPosition[0], currentPosition[1]);
	}
});

// mouse is moved
$("body").on("mousemove.admclr", function(e) {
    if(!admclr.activated) return;
    if(admclr.lastPos) {
        /*
            currentPosition is the built in way to get the current tile and char position from
            where your mouse cursor is.
            currentPosition = [tileX, tileY, charX, charY]
        */
        // do no re-render if the cursor moved but is still inside the same tile
        if(admclr.lastPos[0] == currentPosition[0] && admclr.lastPos[1] == currentPosition[1]) {
            return;
        }
        tiles[admclr.lastPos[1] + "," + admclr.lastPos[0]].backgroundColor = "";
        // re-render the tile
        renderTile(admclr.lastPos[0], admclr.lastPos[1], true);
    }
    // if tile exists
    admclr.renderTile();
    if(admclr.ctrlDown) {
        admclr.handleClear(currentPosition[0], currentPosition[1]);
    }
})

// a key is released
$("body").on("keyup.admclr", function(e) {
    if(!admclr.activated) return;
    admclr.ctrlDown = false;
    admclrActivated.style.display = "none";
    admclr.color = "#00FF00";
    admclr.renderTile();
	// remove color of tile
	if(admclr.lastPos) {
		tiles[admclr.lastPos[1] + "," + admclr.lastPos[0]].backgroundColor = "";
		// re-render the tile
		renderTile(admclr.lastPos[0], admclr.lastPos[1], true);
    }
    tiles[currentPosition[1] + "," + currentPosition[0]].backgroundColor = "";
    renderTile(currentPosition[0], currentPosition[1], true);
	admclr.lastPos = null;
})