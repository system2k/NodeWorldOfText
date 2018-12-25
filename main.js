console.log("Starting process...");

var args = process.argv.slice(2);
var fork = require("child_process").fork;
var serverPath = "./runserver.js";

function runServer() {
    var owot = fork(serverPath, args);
    var gracefulStop = false;
    var immediateRestart = false;

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
    })

    owot.on("message", function(msg) {
        if(msg == "EXIT") {
            gracefulStop = true;
        }
        if(msg == "RESTART") {
            immediateRestart = true;
        }
    });
}

runServer();