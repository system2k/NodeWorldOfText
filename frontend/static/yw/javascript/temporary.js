/*
    Functions on hold
*/

function resizableChat() {
    var state = 0;
    var isDown = false;
    chat_window.addEventListener("mousemove", function(e) {
        if(isDown) return;
        var posX = e.pageX - chat_window.offsetLeft;
        var posY = e.pageY - chat_window.offsetTop;
        var top = (posY) <= 4;
        var left = (posX) <= 3;
        var right = (chat_window.offsetWidth - posX) <= 4;
        var bottom = (chat_window.offsetHeight - posY) <= 5;
        var cursor = "";
        if(left || right) cursor = "ew-resize";
        if(top || bottom) cursor = "ns-resize";
        if((top && left) || (right && bottom)) cursor = "nwse-resize";
        if((bottom && left) || (top && right)) cursor = "nesw-resize";
        chat_window.style.cursor = cursor;
        state = bottom << 3 | right << 2 | left << 1 | top;
    });
    chat_window.addEventListener("mousedown", function() {
        if(state) {
            isDown = true;
        }
    });
    document.addEventListener("mouseup", function() {
        isDown = false;
    });
    document.addEventListener("mousemove", function(e) {
        if(!isDown) return;
        if(state == 0b0001) { // top

        }
        if(state == 0b0010) { // left
            
        }
        if(state == 0b0011) { // top left

        }
        if(state == 0b0100) { // right

        }
        if(state == 0b0101) { // top right

        }
        if(state == 0b1000) { // bottom

        }
        if(state == 0b1010) { // bottom left

        }
        if(state == 0b1100) { // bottom right

        }
    });
}
resizableChat();