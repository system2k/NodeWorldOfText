console.log("Starting process...");

var args = process.argv.slice(2);
var fork = require("child_process").fork;
var serverPath = "./runserver.js";
var http = require("http");

var isTestServer = false;
var args = process.argv;
args.forEach(function(a) {
    if(a == "--test-server") {
        isTestServer = true;
        return;
    }
});

var DATA_PATH = "../data/";
var SETTINGS_PATH = DATA_PATH + "settings.json";
var settings = require(SETTINGS_PATH);
var maintenance_port = settings.port;
if(isTestServer) {
    maintenance_port = settings.test_port;
}

function runServer() {
    var owot = fork(serverPath, args);
    var gracefulStop = false;
    var immediateRestart = false;
    var maintenance = false;

    owot.on("close", function(code) {
        console.log("Process exited. [" + code + "; 0x" + code.toString(16).toUpperCase().padStart(8, 0) + "]");
        if(!gracefulStop) {
            console.log("Restarting server...");
            if(immediateRestart) {
                runServer();
            } else {
                setTimeout(function() {
                    runServer();
                }, 2000);
            }
        }
        if(maintenance) {
            maintenanceMode();
        }
    })

    owot.on("message", function(msg) {
        if(msg == "EXIT") {
            gracefulStop = true;
        }
        if(msg == "RESTART") {
            immediateRestart = true;
        }
        if(msg == "MAINT") {
            gracefulStop = true;
            maintenance = true;

            process.stdin.resume();
            process.stdin.on("data", function(e) {
                if(e.length && e[0] == "0x03") {
                    process.exit();
                }
            })
        }
    });
}

runServer();

function maintenanceMode() {
    var time = new Date();
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var timeStr = "";
    timeStr += months[time.getUTCMonth()] + " ";
    timeStr += time.getUTCDate() + ", ";
    timeStr += time.getUTCFullYear();
    var server = http.createServer(function(req, res) {
        try {
            var text = "<html>" +
                "<head><title>Maintenance</title></head>" +
                "<span>Our World Of Text is currently down for maintenance.</span><br>" +
                "<span>Maintenance has been started on " + timeStr + "</span>"
            "</html>";
            res.write(text);
            res.end();
        } catch(e) {
            console.log(e);
        }
    });
    server.listen(maintenance_port, function() {
        var addr = server.address();
        var ip = addr.address;
        var port = addr.port;
        console.log("Maintenance: [" + ip + "]:" + port);
    });
}