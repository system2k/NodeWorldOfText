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
        return new Promise(function(r, rej) {
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
    var init = false;
    if(!await db.get("SELECT value FROM server_info WHERE name='initialized'")) {
        // server is not initialized
        console.log("Initializing server...");
        await db.run("INSERT INTO server_info VALUES('initialized', 'true')");

        var tables = fs.readFileSync(sql_table_init).toString();
        var indexes = fs.readFileSync(sql_indexes_init).toString();

        await db.exec(tables)
        await db.exec(indexes)

        init = true;
        account_prompt();
    }
    if(!init) {
        start_server();
    }
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

var pw_encryption = "sha512WithRSAEncryption";
const encryptHash = function(pass, salt) {
	if(!salt) {
		var salt = crypto.randomBytes(10).toString("hex")
	}
	var hsh = crypto.createHmac(pw_encryption, salt).update(pass).digest("hex")
	var hash = pw_encryption + "$" + salt + "$" + hsh;
	return hash;
};

const checkHash = function(hash, pass) {
	if(typeof hash !== "string") return false;
	hash = hash.split("$");
	if(hash.length !== 3) return false;
	if(typeof pass !== "string") return false;
	return encryptHash(pass, hash[1]) === hash.join("$");
};

// just to make things easier
function toUpper(x) {
    return x.toString().toUpperCase();
}

function account_prompt() {
    passFunc = function(err, result) {
		var err = false;
		if(result['password'] !== result['confirmpw']) {
			console.log("Error: Your passwords didn't match.")
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(result.password.length > 128) {
			console.log("The password is too long. It must be 128 characters or less.");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		}

		if(result.username.length > 30) {
			console.log("The username must be 30 characters or less.")
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(result.username.length < 1) {
			console.log("The username is too short");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(!result.username.match(/^(\w*)$/g)) {
			console.log("The username must contain the following characters: a-z A-Z 0-9 _");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		}
		
		if(!err){
			var Date_ = Date.now()
            var passHash = encryptHash(result['password'])

            db.run("INSERT INTO auth_user VALUES(null, ?, '', '', '', ?, 1, 1, 1, ?, ?)",
                [result["username"], passHash, Date_, Date_])

            console.log("Superuser created successfully.\n");
            start_server();
		}
	}
	yesNoAccount = function(err, result) {
		var re = result['yes_no_account'];
		if(toUpper(re) === "YES") {
			prompt.get(prompt_account_properties, passFunc);
		}
		if(toUpper(re) === "NO") {
			start_server()
		}
		if(toUpper(re) !== "YES" && toUpper(re) !== "NO") {
			console.log("Please enter either \"yes\" or \"no\" (not case sensitive):");
			prompt.get(prompt_account_yesno, yesNoAccount);
		}
    }
    prompt.start();
    prompt.get(prompt_account_yesno, yesNoAccount);
}

//Time in milliseconds
var Second = 1000;
var Minute = 60000;
var Hour = 3600000;
var Day = 86400000;
var Week = 604800000;
var Month = 2628002880;
var Year = 31536034560;
var Decade = 315360345600;

var server = http.createServer(function(req, res) {
    // use this if you do not want the request data to be cached
    /*res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");*/
    
    var URL = req.url.substr(1);

    res.end("TEST: " + URL);
})
function start_server() {
    (async function clear_expired_sessions() {
        await db.run("DELETE FROM auth_session WHERE expire_date <= ?", Date.now());
        setTimeout(clear_expired_sessions, Minute);
    })()

    server.listen(settings.port, function() {
        var addr = server.address();
        console.log("Server is running.\nAddress: " + addr.address + "\nPort: " + addr.port);
    });
}

// https thing: https://gist.github.com/davestevens/c9e437afbb41c1d5c3ab