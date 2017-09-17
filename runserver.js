const http          = require("http");
const url           = require("url");
const sql           = require("sqlite3").verbose();
const fs            = require("fs");
const swig          = require("swig");
const querystring   = require("querystring");
const crypto        = require("crypto");
const mime          = require("./backend/mime.js");
const prompt        = require("./backend/prompt.js");

const settings = require("./settings.json");
const database = new sql.Database(settings.DATABASE_PATH);

var static_path = "./program/html/static/";
var template_path = "./program/html/templates/";

var sql_table_init = "./backend/default.sql";
var sql_indexes_init = "./backend/indexes.sql";

const db = {
    // gets data from the database (only 1 row at a time)
    get: async function(command, params) {
        if(!params) params = []
        return new Promise(function(r) {
            database.get(command, params, function(err, res) {
                if(err) {
                    return rej(false)
                }
                r(res)
            })
        })
    },
    // runs a command (insert, update, etc...) and might return "lastID" if needed
    run: async function(command, params) {
        if(!params) params = []
        var err = false
        return new Promise(function(r, rej) {
            database.run(command, params, function(err, res) {
                if(err) {
                    return rej(err)
                }
                var info = {
                    lastID: this.lastID
                }
                r(info)
            })
        })
    },
    // gets multiple rows in one command
    all: async function(command, params) {
        if(!params) params = []
        return new Promise(function(r, rej) {
            database.all(command, params, function(err, res) {
                if(err) {
                    return rej(err)
                }
                r(res)
            })
        })
    },
    // get multiple rows but execute a function for every row
    each: async function(command, params, callbacks) {
        if(typeof params == "function") {
            callbacks = params
            params = []
        }
        var def = callbacks
        var callback_error = false
        callbacks = function() {
            try {
                def(...arguments)
            } catch(e) {
                callback_error = true
            }
        }
        return new Promise(function(r, rej) {
            database.each(command, params, callbacks, function(err, res) {
                if(err || callback_error) {
                    return rej(err)
                }
                r(res)
            })
        })
    },
    // like run, but executes the command as a SQL file
    // (no comments allowed, and must be semicolon seperated)
    exec: async function(command) {
        return new Promise(function(r, rej) {
            database.exec(command, function(err) {
                if(err) {
                    return rej(err)
                }
                r(true)
            })
        })
    }
};

(async function() {
    console.log("Starting server...");
    if(!await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='server_info'")) {
        // table to inform that the server is initialized
        await db.run("CREATE TABLE 'server_info' (name TEXT, value TEXT)");
    }
    if(!await db.get("SELECT value FROM server_info WHERE name='initialized'")) {
        // server is not initialized
        console.log("Initializing server...");
        await db.run("INSERT INTO server_info VALUES('initialized', 'true')");

        var tables = fs.readFileSync(sql_table_init).toString();
        var indexes = fs.readFileSync(sql_indexes_init).toString();

        await db.exec(tables)
        await db.exec(indexes)
    }
    start_server();
})()

prompt.message      = ""; // do not display "prompt" before each question
prompt.delimiter    = ""; // do not display ":" after "prompt"
prompt.colors       = false; // disable dark gray color in a black console

var prompt_account_properties = {
	properties: {
		username: {
			message: 'Username: '
		},
		password: {
			description: 'Password: ',
			replace: '*',
			hidden: true
		},
		confirmpw: {
			description: 'Password (again): ',
			replace: '*',
			hidden: true
		}
	}
};

var prompt_account_yesno = {
	properties: {
		yes_no_account: {
			message: "You just installed the server, which means you don\'t have any superusers defined.\nWould you like to create one now? (yes/no):"
		}
	}
};

const log_error = function(err) {
	if(settings.error_log) {
		try {
			var errs = err;
			if(typeof errs !== "string") {
				errs = errs.stack
			}
			errs = JSON.stringify(errs);
			err = "[" + errs + ", " + Date.now() + "]\r\n";
			fs.appendFile(settings.LOG_PATH, err);
		} catch(e) {
			console.log(e)
		}
	}
}



var server = http.createServer(function(req, res) {
    /*res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");*/
    
    var URL = req.url.substr(1);

    res.end("TEST: " + URL);
})
function start_server() {
    server.listen(settings.port, function() {
        var addr = server.address();
        console.log("Server is running.\nAddress: " + addr.address + "\nPort: " + addr.port);
    });
}

// https thing: https://gist.github.com/davestevens/c9e437afbb41c1d5c3ab