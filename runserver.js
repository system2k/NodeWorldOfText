const http = require("http");
const url = require("url");
const sql = require("sqlite3").verbose();
const fs = require("fs");
const swig = require("swig");
const querystring = require("querystring");
const crypto = require("crypto");

var server = http.createServer(function(req, res) {
    /*res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");*/
    
    var URL = req.url.substr(1);

    res.end("TEST: " + URL);
})
server.listen(80, function() {
    var addr = server.address();
    console.log("SERVER: " + addr.address + ":" + addr.port)
});