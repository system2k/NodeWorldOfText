var url = require("url");
var utils = require("../utils/utils.js");
var removeLastSlash = utils.removeLastSlash;
var mime = require("../mime.js");

function parseRange(range) {
    if(!range) return false;
    range = range.split(";")[0];
    range = range.split("=");
    if(range[0] != "bytes") return false;
    if(!range[1]) return false;
    range = range[1];
    range = range.split("-");
    if(range.length != 2) return false;
    range[0] = parseInt(range[0], 10);
    if(isNaN(range[0])) range[0] = 0;
    if(range[1] != "") {
        range[1] = parseInt(range[1], 10);
        if(isNaN(range[1])) range[1] = 0;
    }
    return range;
}

module.exports.GET = async function(req, serve, vars) {
    var query_data = vars.query_data;
    var static_data = vars.static_data;
    var static_retrieve = vars.static_retrieve;
    var filename_sanitize = vars.filename_sanitize;
    var http_time = vars.http_time;

    var file = query_data.file;
    if(file) {
        var retCode = 200;
        var retHeaders = {};
        var range = parseRange(req.headers.range);
        file = parseFloat(file, 10);
        if(isNaN(file) || !Number.isInteger(file)) return serve(null, 404);
        var fileData = await static_retrieve(file, range);
        if(fileData === 0) {
            return serve(null, 403);
        }
        if(!fileData) {
            return serve(null, 404);
        }
        var data = fileData.data;
        var fileLen = fileData.len; // total length + headers

        var headLen = data[0] + data[1] * 256;
        var postData = data.slice(headLen, data.length);

        if(range) {
            retCode = 206;
            retHeaders["Content-Range"] = "bytes " + range[0] + "-" + range[1] + "/" + (fileLen - headLen);
        }
        
        var lenIdx = 2;

        var filename = data.slice(3, 2 + data[lenIdx] + 1).toString();
        lenIdx += 1 + data[lenIdx];
        var unixtime = data.slice(1 + lenIdx, lenIdx + data[lenIdx] + 1).toString();
        lenIdx += 1 + data[lenIdx];
        var mimetype = data.slice(1 + lenIdx, lenIdx + data[lenIdx] + 1).toString();

        if(mimetype.indexOf("javascript") > -1 || mimetype.indexOf("text") > -1) {
            mimetype += "; charset=utf-8";
        }

        retHeaders["Last-Modified"] = http_time(parseInt(unixtime));
        retHeaders["Content-Disposition"] = "filename=\"" + encodeURIComponent(filename_sanitize(filename)) + "\"";
        retHeaders["Accept-Ranges"] = "bytes";

        serve(postData, retCode, {
            mime: mimetype,
            headers: retHeaders
        });
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