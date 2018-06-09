var imageLoader = {};

imageLoader.res = { /*"myimage": <img>*/ };

imageLoader.path = [ // Modifiable
    ["favicon", "/static/favicon.png"]
];

imageLoader.start = function(callback) {
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