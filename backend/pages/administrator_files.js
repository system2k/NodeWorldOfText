var mime = require("../mime.js");

module.exports.GET = async function(req, serve, vars) {
    var HTML = vars.HTML;
    var user = vars.user;
    var dispage = vars.dispage;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars);
    }

    serve(HTML("administrator_files.html"));
}

module.exports.POST = async function(req, serve, vars) {
    var post_data = vars.post_data;
    var user = vars.user;
    var staticRaw_append = vars.staticRaw_append;
    var staticIdx_append = vars.staticIdx_append;

    if(!user.superuser) return;

    if(!post_data.length) return;

    var len = post_data[0];
    var name = "";
    for(var i = 0; i < len; i++) {
        var byte = post_data[1 + i];
        if(!byte) continue;
        name += String.fromCharCode(byte);
    }
    if(!name) name = "Untitled.bin";

    var data = post_data.slice(1 + name.length);

    var unixtime = Date.now().toString();
    var mimetype = mime(name.replace(/.*[\.\/\\]/, "").toLowerCase());

    var headerData = Buffer.alloc(2 + 1 + name.length + 1 + unixtime.length + 1 + mimetype.length);
    var headPtr = 2;

    headerData[headPtr++] = name.length;
    for(var i = 0; i < name.length; i++) headerData[headPtr++] = name.charCodeAt(i);

    headerData[headPtr++] = unixtime.length;
    for(var i = 0; i < unixtime.length; i++) headerData[headPtr++] = unixtime.charCodeAt(i);

    headerData[headPtr++] = mimetype.length;
    for(var i = 0; i < mimetype.length; i++) headerData[headPtr++] = mimetype.charCodeAt(i);

    var headerLen = headerData.length;
    headerData[0] = headerLen & 255;
    headerData[1] = headerLen >> 8 & 255;

    var fileData = Buffer.concat([headerData, data]);
    var fdLen = fileData.length;
    var ptr = await staticRaw_append(fileData);

    var index = await staticIdx_append(Buffer.from([
        ptr & 255,
        ptr >> 8 & 255,
        ptr >> 16 & 255,
        ptr >> 24 & 255,
        fdLen & 255,
        fdLen >> 8 & 255,
        fdLen >> 16 & 255,
        fdLen >> 24 & 255,
        1]));
    // [uint32, uint32, uint8] -> [offset, size, publicly accessible]

    serve(index.toString());
}