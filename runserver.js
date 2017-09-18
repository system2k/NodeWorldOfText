const http          = require("http");
const url           = require("url");
const sql           = require("sqlite3").verbose();
const fs            = require("fs");
const swig          = require("swig");
const querystring   = require("querystring");
const crypto        = require("crypto");
const mime          = require("./backend/mime.js");
const prompt        = require("./backend/prompt.js");
const dump_dir      = require("./backend/dump_dir");

const settings = require("./settings.json");
const database = new sql.Database(settings.DATABASE_PATH);

var static_path = "./frontend/static/";
var static_path_web = "static/"

var template_data = {}; // data used by the server
var templates_path = "./frontend/templates/";
dump_dir(template_data, templates_path, "", true);
for(var i in template_data) {
    if(template_data[i].endsWith(".html")) {
        template_data[i] = swig.compileFile(template_data[i]);
    }
}

var static_data = {}; // html data to be returned (text data for values)
dump_dir(static_data, static_path, static_path_web);

var sql_table_init = "./backend/default.sql";
var sql_indexes_init = "./backend/indexes.sql";

const pages = {
    configure           : require("./backend/pages/configure.js"),
    coordlink           : require("./backend/pages/coordlink.js"),
    home                : require("./backend/pages/home.js"),
    login               : require("./backend/pages/login.js"),
    logout              : require("./backend/pages/logout.js"),
    member_autocomplete : require("./backend/pages/member_autocomplete.js"),
    private             : require("./backend/pages/private.js"),
    profile             : require("./backend/pages/profile.js"),
    protect             : require("./backend/pages/protect.js"),
    register            : require("./backend/pages/register.js"),
    timemachine         : require("./backend/pages/timemachine.js"),
    unprotect           : require("./backend/pages/unprotect.js"),
    urllink             : require("./backend/pages/urllink.js"),
    yourworld           : require("./backend/pages/yourworld.js")
}

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
var Hour   = 3600000;
var Day    = 86400000;
var Week   = 604800000;
var Month  = 2628002880;
var Year   = 31536034560;
var Decade = 315360345600;

var url_regexp = [ // regexp , function/redirect to
    ["^(\\w*)$", pages.yourworld],
    ["^(beta/(.*))$", pages.yourworld],
    ["^(frontpage/(.*))$", pages.yourworld],
    ["^favicon\.ico$", "/static/favicon.png"],
    ["^home/$", pages.home],
    ["^accounts/login", pages.login],
    ["^accounts/logout", pages.logout],
    ["^accounts/register", pages.register],
    ["^ajax/protect/$", pages.protect],
    ["^ajax/unprotect/$", pages.unprotect],
    ["^ajax/coordlink/$", pages.coordlink],
    ["^ajax/urllink/$", pages.urllink],
    ["^accounts/profile/", pages.profile],
    ["^accounts/private/", pages.private],
    ["^accounts/configure/$", "/accounts/profile/"],
    ["^accounts/configure/(.*)/$", pages.configure],
    ["^accounts/configure/(beta/\\w+)/$", pages.configure],
    ["^accounts/member_autocomplete/$", pages.member_autocomplete],
    ["^accounts/timemachine/(.*)/$", pages.timemachine]
]

var static_file_returner = {}
static_file_returner.GET = function(req, serve) {
    var parse = url.parse(req.url).pathname.substr(1)
    var mime_type = mime(parse.replace(/.*[\.\/\\]/, '').toLowerCase());
    serve(static_data[parse], 200, { mime: mime_type })
}

for (var i in static_data) {
    url_regexp.push(["^" + i + "$", static_file_returner])
}

function parseCookie(cookie) {
    try {
        if(typeof cookie !== "string") {
            return {};
        }
        cookie = cookie.split(";");
        var list = {}
        for(var i in cookie) {
            var c = cookie[i].split("=");
            if(c.length > 2) {
                var ar = c;
                var var2 = ar.pop();
                ar = ar.join("=")
                ar = ar.replace(/ /g, "");
                var2 = var2.replace(/ /g, "");
                list[ar] = var2
            } else if(c.length === 2) {
                list[decodeURIComponent(c[0].replace(/ /g, ""))] = decodeURIComponent(c[1].replace(/ /g, ""))
            } else if(c.length === 1) {
                if(c[0] !== "") list[c[0]] = null
            }
        }
        return list;
    } catch(e) {
        return {};
    }
}

function objIncludes(defaultObj, include) {
    var new_obj = {};
    for(var i in defaultObj) {
        new_obj[i] = defaultObj[i]
    }
    for(var i in include) {
        new_obj[i] = include[i];
    }
    return new_obj;
}

function wait_response_data(req, dispatch) {
    var queryData = {}
    var error = false;
    return new Promise(function(resolve) {
        req.on("data", function(data) {
            queryData += data;
            if (queryData.length > 10000000) {
                queryData = "";
                dispatch("Payload too large", 413)
                error = true
                req.connection.destroy();
                resolve(null);
            }
        });
        req.on("end", function() {
            if(!error) {
                try {
                    resolve(querystring.parse(queryData, null, null, {maxKeys: 1000}))
                } catch(e) {
                    resolve(null);
                }
            }
        });
    })
}

var server = http.createServer(async function(req, res) {
    // use this if you do not want the request data to be cached
    /*res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");*/
    
    var URL = url.parse(req.url).pathname;
    if(URL.charAt(0) == "/") {
        URL = URL.substr(1);
    }

    var request_resolved = false;

    function dispatch(data, status_code, params) {
        request_resolved = true;
        // params: { cookie, mime, redirect } (all optional)
        var info = {}
        if(!params) {
            params = {};
        }
        if(params.cookie) {
            info["Set-Cookie"] = params.cookie;
        }
        if(Math.floor(status_code / 100) * 100 == 300 || params.redirect !== void 0) { // 3xx status code
            if(params.redirect) {
                if(!status_code) {
                    status_code = 302;
                }
                info.Location = params.redirect
            }
        }
        if(params.mime) {
            info["Content-Type"] = params.mime;
        }
        if(!status_code) {
            status_code = 200;
        }
        res.writeHead(status_code, info);
        if(!data) {
            data = "";
        }
        res.end(data)
    }

    var found_url = false;
    for(var i in url_regexp) {
        var row = url_regexp[i];
        if(URL.match(row[0])) {
            found_url = true;
            if(typeof row[1] == "object") {
                var method = req.method.toUpperCase();
                var post_data = {};
                var query_data = querystring.parse(url.parse(req.url).query)
                if(method == "POST") {
                    var error = false;
                    var queryData = "";
                    var dat = await wait_response_data(req, dispatch);
                    if(!dat) {
                        return;
                    }
                    post_data = dat;
                }
                var vars = objIncludes(global_data, {
                    cookies: parseCookie(req.headers.cookie),
                    post_data,
                    query_data
                })
                if(row[1][method]) {
                    await row[1][method](req, dispatch, vars);
                } else {
                    dispatch("Method " + method + " not allowed.", 405)
                }
            } else if(typeof row[1] == "string") { // it's a path and must be redirected to
                dispatch(null, null, { redirect: row[1] })
            } else {
                found_url = false; // nevermind, it's not found because the type is invalid
            }
            break;
        }
    }

    if(!request_resolved) {
        res.statusCode = 500;
        return res.end("Internal server error.")
    }

    if(!found_url) {
        res.statusCode = 404;
        return res.end("Not found. TODO: add a 404 page.")
    }
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

var global_data = {
    template_data
}

// https thing: https://gist.github.com/davestevens/c9e437afbb41c1d5c3ab