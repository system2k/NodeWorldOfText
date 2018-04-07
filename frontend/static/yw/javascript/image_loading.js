var imageLoader = {};

imageLoader.res = { /*"myimage": <img>*/ };

imageLoader.path = [ // Modifiable
    ["favicon", "/static/favicon.png"],
    ["chatIcon", "/static/chatIcon.png"]
];

function __loadImgResources(callback) {
    var index = 0;
    var total = imageLoader.path.length;
    var imgInfo = imageLoader.path
    function loop() {
        var imgName = imgInfo[index][0];
        var imgPath = imgInfo[index][1];
        var imgElm = new Image();
        imgElm.src = imgPath;
        imgElm.onload = function() {
            imageLoader.res[imgName] = imgElm;
            index++;
            if(index >= total) {
                callback();
            } else {
                loop();
            }
        }
    }
    loop();
}

imageLoader.start = function(callback) {
    __loadImgResources(callback)
}