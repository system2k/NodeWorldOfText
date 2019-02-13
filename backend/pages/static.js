var url = require("url");
var utils = require("../utils/utils.js");
var removeLastSlash = utils.removeLastSlash;
var mime = require("../mime.js");

module.exports.GET = async function(req, serve, vars) {
    var query_data = vars.query_data;
    var static_data = vars.static_data;
    var static_retrieve = vars.static_retrieve;
    var filename_sanitize = vars.filename_sanitize;

    var file = query_data.file;
    if(file) {
        file = parseFloat(file, 10);
        if(isNaN(file) || !Number.isInteger(file)) return serve(null, 404);
        var data = await static_retrieve(file);
        if(!data) {
            return serve(null, 404);
        }
        var headLen = data[0] + data[1] * 256;
        var postData = data.slice(headLen, data.length);
        
        var lenIdx = 2;

        var filename = data.slice(3, 2 + data[lenIdx] + 1).toString();
        lenIdx += 1 + data[lenIdx];
        var unixtime = data.slice(1 + lenIdx, lenIdx + data[lenIdx] + 1).toString();
        lenIdx += 1 + data[lenIdx];
        var mimetype = data.slice(1 + lenIdx, lenIdx + data[lenIdx] + 1).toString();

        if(mimetype.indexOf("javascript") > -1 || mimetype.indexOf("text") > -1) {
            mimetype += "; charset=utf-8";
        }

        serve(postData, 200, { mime: mimetype });
        return;
    }

    var parse = url.parse(req.url).pathname.substr(1);
    parse = removeLastSlash(parse);
    var mime_type = mime(parse.replace(/.*[\.\/\\]/, "").toLowerCase());
    if(parse in static_data) {
        serve(static_data[parse], 200, { mime: mime_type });
    } else {
        return;
    }
}