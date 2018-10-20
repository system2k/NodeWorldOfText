/*
**  Our World of Text
**  Est. November 19, 2016
**  Reprogrammed September 17, 2017
**  Released and renamed October 10, 2017
**  This is the main file
*/

console.log("\x1b[36;1mStarting up...\x1b[0m")

const crypto        = require("crypto");
const dump_dir      = require("./backend/dump_dir");
const fs            = require("fs");
const http          = require("http");
const https         = require("https");
const isIP          = require("net").isIP;
const mime          = require("./backend/mime.js");
const nodemailer    = require("nodemailer");
const path          = require("path");
const prompt        = require("./lib/prompt/prompt");
const querystring   = require("querystring");
const sql           = require("sqlite3");
const swig          = require("swig");
const url           = require("url");
const WebSocket     = require("ws");
const zip           = require("adm-zip")

console.log("Loaded libs");

var DATA_PATH = "../data/";
var DATA_PATH_TEST = DATA_PATH + "test/";

// create the data folder that stores all of the server's data
if(!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, 0o777);
}
// directory used for storing data for the test server
if(!fs.existsSync(DATA_PATH_TEST)) {
    fs.mkdirSync(DATA_PATH_TEST, 0o777);
}

var SETTINGS_PATH = DATA_PATH + "settings.json";

if(!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, fs.readFileSync("./settings_example.json"));
    console.log("Created the settings file at [" + SETTINGS_PATH + "]. You must configure the settings file and then start the server back up again.");
    console.log("Full path of settings: " + path.resolve(SETTINGS_PATH));
    process.exit();
}

const settings = require(SETTINGS_PATH);

var serverPort = settings.port;
var serverDB = settings.DATABASE_PATH;
var chatDB = settings.CHAT_HISTORY_PATH;

Error.stackTraceLimit = Infinity;
if(!global.AsyncFunction) var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

var isTestServer = false;

var intv = {}; // intervals and timeouts

var args = process.argv;
args.forEach(function(a) {
	if(a == "--test-server") {
        console.log("\x1b[32;1mThis is a test server\x1b[0m")
		isTestServer = true;
		serverPort = settings.test_port;
		serverDB = settings.TEST_DATABASE_PATH;
        chatDB = settings.TEST_CHAT_HISTORY_PATH;
        settings.LOG_PATH = settings.TEST_LOG_PATH;
        settings.ZIP_LOG_PATH = settings.TEST_ZIP_LOG_PATH;
        settings.UNCAUGHT_PATH = settings.TEST_UNCAUGHT_PATH;
        settings.REQ_LOG_PATH = settings.TEST_REQ_LOG_PATH;
        settings.CHAT_LOG_PATH = settings.TEST_CHAT_LOG_PATH;
		return;
	}
});

const log_error = function(err) {
	if(settings.error_log) {
		try {
			err = JSON.stringify(err);
			err = "TIME: " + Date.now() + "\r\n" + err + "\r\n" + "-".repeat(20) + "\r\n\r\n\r\n";
			fs.appendFileSync(settings.LOG_PATH, err);
		} catch(e) {
			console.log("Error logging error:", e)
		}
	}
}

if(!fs.existsSync(settings.bypass_key)) {
    var rand = "";
    var key = "0123456789ABCDEF";
    for(var i = 0; i < 50; i++) {
        rand += key[Math.floor(Math.random() * 16)];
    }
    fs.writeFileSync(settings.bypass_key, rand);
}

const database = new sql.Database(serverDB);
const chat_history = new sql.Database(chatDB);

function trimHTML(html) {
    // ensure all lines are \r\n instead of just \n (consistent)
    html = html.replace(/\r\n/g, "\n");
    html = html.split("\n");
    var newHtml = [];
    for(var i = 0; i < html.length; i++) {
        html[i] = html[i].trim();
        if(html[i]) {
            newHtml.push(html[i]);
        }
    }
    return newHtml.join("\r\n");
}

var static_path = "./frontend/static/";
var static_path_web = "static/"

var template_data = {}; // data used by the server
var templates_path = "./frontend/templates/";

var static_data = {}; // return static server files

function load_static() {
    for(var i in template_data) {
        delete template_data[i];
    }
    for(var i in static_data) {
        delete static_data[i];
    }
    
    console.log("Loading static files...");
    dump_dir(static_data, static_path, static_path_web, null);

    console.log("Loading HTML templates...");
    dump_dir(template_data, templates_path, "", true);

    console.log("Compiling HTML templates...");
    for(var i in template_data) {
        template_data[i] = swig.compileFile(template_data[i]);
    }
}
load_static();

var sql_table_init = "./backend/default.sql";
var sql_indexes_init = "./backend/indexes.sql";

var zip_file;
if(!fs.existsSync(settings.ZIP_LOG_PATH)) {
    zip_file = new zip();
} else {
    zip_file = new zip(settings.ZIP_LOG_PATH);
}
console.log("Handling previous error logs (if any)");
if(fs.existsSync(settings.LOG_PATH)) {
    var file = fs.readFileSync(settings.LOG_PATH)
    if(file.length > 0) {
        var log_data = fs.readFileSync(settings.LOG_PATH);
        zip_file.addFile("NWOT_LOG_" + Date.now() + ".txt", log_data, "", 0644);
        fs.truncateSync(settings.LOG_PATH);
    }
}
zip_file.writeZip(settings.ZIP_LOG_PATH);

// load all modules from directory. EG: "test.js" -> "test"
function load_modules(default_dir) {
    var pages = fs.readdirSync(default_dir)
    var obj = {};
    for(var i = 0; i < pages.length; i++) {
        var name = pages[i].split(".js")[0];
        obj[name] = require(default_dir + pages[i]);
    }
    return obj;
}

console.log("Loading page files");
const pages      = load_modules("./backend/pages/");
const websockets = load_modules("./backend/websockets/");
const modules    = load_modules("./backend/modules/");
const systems    = load_modules("./backend/systems/");

function asyncDbSystem(database) {
    const db = {
        // gets data from the database (only 1 row at a time)
        get: async function(command, params) {
            if(params == void 0 || params == null) params = []
            return new Promise(function(r, rej) {
                database.get(command, params, function(err, res) {
                    if(err) {
                        return rej({
                            sqlite_error: process_error_arg(err),
                            input: { command, params }
                        })
                    }
                    r(res)
                })
            })
        },
        // runs a command (insert, update, etc...) and might return "lastID" if needed
        run: async function(command, params) {
            if(params == void 0 || params == null) params = []
            var err = false
            return new Promise(function(r, rej) {
                database.run(command, params, function(err, res) {
                    if(err) {
                        return rej({
                            sqlite_error: process_error_arg(err),
                            input: { command, params }
                        })
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
            if(params == void 0 || params == null) params = []
            return new Promise(function(r, rej) {
                database.all(command, params, function(err, res) {
                    if(err) {
                        return rej({
                            sqlite_error: process_error_arg(err),
                            input: { command, params }
                        })
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
            var cb_err_desc = "callback_error...";
            callbacks = function(e, data) {
                try {
                    def(data)
                } catch(e) {
                    callback_error = true
                    cb_err_desc = e;
                }
            }
            return new Promise(function(r, rej) {
                database.each(command, params, callbacks, function(err, res) {
                    if(err) return rej({
                        sqlite_error: process_error_arg(err),
                        input: { command, params }
                    })
                    if(callback_error) return rej(cb_err_desc)
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
                        return rej({
                            sqlite_error: process_error_arg(err),
                            input: { command }
                        })
                    }
                    r(true)
                })
            })
        }
    };
    return db;
}

const db = asyncDbSystem(database);
const db_ch = asyncDbSystem(chat_history);

var transporter;
var email_available = true;

function loadEmail() {
    try {
        if(isTestServer) throw "This is a test server";
        transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: settings.email.username,
                pass: settings.email.password
            }
        });
    } catch(e) {
        handle_error(e);
        email_available = false;
        console.log("\x1b[31;1mEmail disabled. Error message: " + JSON.stringify(process_error_arg(e)) + "\x1b[0m");
    }
    try {
        if(email_available) {
            transporter.verify()
        }
    } catch(e) {
        handle_error(e);
        email_available = false;
        console.log("\x1b[31;1mEmail is disabled because the verification failed (credentials possibly incorrect)" + JSON.stringify(process_error_arg(e)) + "\x1b[0m");
    }
    if(email_available) {
        console.log("Logged into email")
    }
}
loadEmail();

async function send_email(destination, subject, text) {
    if(!email_available) return false;
    var options = {
        from: settings.email.display_email,
        to: destination,
        subject: subject,
        html: text
    };
    return new Promise(function(resolve) {
        transporter.sendMail(options, function(error, info) {
            if (error) {
                resolve("error");
            } else {
                resolve(info);
            }
        });
    })
}

var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function create_date(time) {
	var str = "(UTC) ";
	
	var date = new Date(time);
	var month = date.getUTCMonth();
	str += months[month] + " ";
	
	var day = date.getUTCDate();
	str += day + ", "
	
	var year = date.getUTCFullYear();
	str += year + " "
	
	var hour = date.getUTCHours() + 1;
	var ampm = " AM"
	if(hour >= 12) {
		ampm = " PM"
	}
	if(hour > 12) {
		hour = hour - 12
	}
	if(hour === 0) {
		hour = 12;
	}
	str += hour
	
	var minute = date.getUTCMinutes();
	minute = ("0" + minute).slice(-2);
	str += ":" + minute
	
	var second = date.getUTCSeconds();
	second = ("0" + second).slice(-2);
	str += ":" + second + ampm
	
	return str;
}

// sanitize number input
function san_nbr(x) {
    x -= 0;
    if(x >= 9007199254740991) x = 9007199254740991;
    if(x <= -9007199254740991) x = -9007199254740991;
    x = parseInt(x);
    if(!x || isNaN(x) || !isFinite(x)) {
        x = 0;
    }
    x = Math.floor(x);
    if(x >= 9007199254740991) x = 9007199254740991;
    if(x <= -9007199254740991) x = -9007199254740991;
    return x;
}

var announcement_cache = "";
var bypass_key_cache = "";

async function initialize_server() {
    console.log("Starting server...");
    await init_chat_history();
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
}

(async function() {
    try {
        await initialize_server();
    } catch(e) {
        console.log("An error occured during the initialization process:");
        console.log(e)
    }
})()

prompt.message      = ""; // do not display "prompt" before each question
prompt.delimiter    = ""; // do not display ":" after "prompt"
prompt.colors       = false; // disable dark gray color in a black console

var prompt_account_properties = {
    properties: {
        username: {
            message: "Username: "
        },
        password: {
            description: "Password: ",
            replace: "*",
            hidden: true
        },
        confirmpw: {
            description: "Password (again): ",
            replace: "*",
            hidden: true
        }
    }
};

var prompt_account_yesno = {
    properties: {
        yes_no_account: {
            message: "You just installed the server,\nwhich means you don\'t have any superusers defined.\nWould you like to create one now? (yes/no):"
		}
	}
};

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

function NCaseCompare(str1, str2) {
	str1 += "";
	str2 += "";
	var res = str1.localeCompare(str2, "en", {
		sensitivity: "base"
	});
	return !res;
}

function add(username, level) {
    level = parseInt(level);
    if(!level) level = 0;
    level = Math.trunc(level);
    if(level < 0) level = 0;
    if(level >= 3) level = 3;
    var Date_ = Date.now();
    ask_password = true;
    account_to_create = username;
    (async function() {
        try {
            await db.run("INSERT INTO auth_user VALUES(null, ?, '', ?, 1, ?, ?, ?)",
                [username, "", level, Date_, Date_])
        } catch(e) {
            console.log(e);
        }
    })();
}

function account_prompt() {
    passFunc = function(err, result) {
		var err = false;
		if(result["password"] !== result["confirmpw"]) {
			console.log("Error: Your passwords didn't match.")
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(result.password.length > 128) {
			console.log("The password is too long. It must be 128 characters or less.");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		}
		
		if(!err) {
			var Date_ = Date.now()
            var passHash = encryptHash(result["password"])

            db.run("INSERT INTO auth_user VALUES(null, ?, '', ?, 1, 3, ?, ?)",
                [result["username"], passHash, Date_, Date_])

            console.log("Superuser created successfully.\n");
            start_server();
		}
	}
	yesNoAccount = function(err, result) {
		var re = result["yes_no_account"];
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

var prompt_command_input = {
    properties: {
        input: {
            message: ">>"
		}
	}
};

var prompt_password_new_account = {
    properties: {
        password: {
            message: "Enter password for this account: ",
            replace: "*",
            hidden: true
		}
	}
};

var ask_password = false;
var account_to_create = "";
var prompt_stopped = false;

function command_prompt() {
    function on_input(err, input) {
        if(err) return console.log(err);
        var code = input.input;
        if(code == "stop") {
            return stopServer();
        }
        try {
            console.dir(eval(code), { colors: true });
        } catch(e) {
            console.dir(e, { colors: true });
        }
        command_prompt();
    }
    function on_password_input(err, input) {
        if(err) return console.log(err);
        if(account_to_create == void 0) return;
        var pass = input.password;
        db.run("UPDATE auth_user SET password=? WHERE username=? COLLATE NOCASE",
            [encryptHash(pass), account_to_create])
        account_to_create = void 0;
        command_prompt();
    }
    if(prompt_stopped) return;
    prompt.start();
    if(!ask_password) {
        prompt.get(prompt_command_input, on_input);
    } else {
        ask_password = false;
        prompt.get(prompt_password_new_account, on_password_input)
    }
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

var ms = { Second, Minute, Hour, Day, Week, Month, Year, Decade };

var url_regexp = [ // regexp , function/redirect to , options
    ["^favicon\.ico[\\/]?$", "/static/favicon.png"],
    ["^robots.txt[\\/]?$", "/static/robots.txt"],
    ["^home[\\/]?$", pages.home],
    ["^accounts/login[\\/]?", pages.login],
    ["^accounts/logout[\\/]?", pages.logout],
    ["^accounts/register[\\/]?$", pages.register],
    ["^ajax/protect[\\/]?$", pages.protect],
    ["^ajax/unprotect[\\/]?$", pages.unprotect],
    ["^ajax/protect/char[\\/]?$", pages.protect_char],
    ["^ajax/unprotect/char[\\/]?$", pages.unprotect_char],
    ["^ajax/coordlink[\\/]?$", pages.coordlink],
    ["^ajax/urllink[\\/]?$", pages.urllink],
    ["^accounts/profile[\\/]?$", pages.profile],
    ["^accounts/private[\\/]?$", pages.private],
    ["^accounts/configure[\\/]?$", pages.configure], // for front page configuring
    ["^accounts/configure/(.*)/$", pages.configure],
    ["^accounts/configure/(beta/\\w+)/$", pages.configure],
    ["^accounts/member_autocomplete[\\/]?$", pages.member_autocomplete],
    ["^accounts/timemachine/(.*)/$", pages.timemachine],
    ["^accounts/register/complete[\\/]?$", pages.register_complete],
    ["^accounts/activate/(.*)/$", pages.activate],
    ["^administrator/$", pages.administrator],
    ["^administrator/edits/$", pages.administrator_edits], // for front page downloading
    ["^administrator/edits/(.*)/$", pages.administrator_edits],
    ["^script_manager/$", pages.script_manager],
    ["^script_manager/edit/(.*)/$", pages.script_edit],
    ["^script_manager/view/(.*)/$", pages.script_view],
    ["^administrator/user/(.*)/$", pages.administrator_user],
    ["^accounts/download/$", pages.accounts_download], // for front page downloading
    ["^accounts/download/(.*)/$", pages.accounts_download],
    ["^world_style[\\/]?$", pages.world_style],
    ["^other/random_color[\\/]?$", pages.random_color],
    ["^accounts/password_change[\\/]?$", pages.password_change],
    ["^accounts/password_change/done[\\/]?$", pages.password_change_done],
    ["^administrator/users/by_username/(.*)[\\/]?$", pages.administrator_users_by_username],
    ["^administrator/users/by_id/(.*)[\\/]?$", pages.administrator_users_by_id],
    ["^accounts/nsfw/(.*)[\\/]?$", pages.accounts_nsfw],
    ["^administrator/world_restore[\\/]?$", pages.administrator_world_restore],
    ["^([\\w\\/\\.\\-\\~]*)$", pages.yourworld, { remove_end_slash: true }]
]

function get_third(url, first, second) {
    var value = split_limit(url, first + "/" + second + "/", 1)[1]
    if(value.charAt(value.length - 1) === "/") {
        value = value.substring(0, value.length - 1);
    }
    return value;
}

function get_fourth(url, first, second, third) {
    var value = split_limit(url, first + "/" + second + "/" + third + "/", 1)[1]
    if(value.charAt(value.length - 1) === "/") {
        value = value.substring(0, value.length - 1);
    }
    return value;
}

/*
    dispatch page
    usage: this is to be used in the page modules when
    the module wants to dispatch a different page module.
    EG: return dispage("404", { extra parameters for page }, req, serve, vars, "POST")
    (req, serve, and vars should already be defined by the parameters)
    ("POST" is only needed if you need to post something. otherwise, don't include anything)
*/
async function dispage(page, params, req, serve, vars, method) {
    if(!method) {
        method = "GET";
    }
    method = method.toUpperCase();
    if(!params) {
        params = {};
    }
    if(!vars) {
        vars = {};
    }
    await pages[page][method](req, serve, vars, params);
}

function removeLastSlash(text) {
    if(text.charAt(text.length - 1) == "/") {
        text = text.slice(0, text.length - 1);
    }
    return text;
}

var static_file_returner = {}
static_file_returner.GET = function(req, serve) {
    var parse = url.parse(req.url).pathname.substr(1)
    parse = removeLastSlash(parse);
    var mime_type = mime(parse.replace(/.*[\.\/\\]/, "").toLowerCase());
    if(parse in static_data) {
        serve(static_data[parse], 200, { mime: mime_type })
    } else {
        serve("<html><h1>404</h1>Static item not found</html>", 404);
    }
}

// push static file urls to regexp array
var static_regexp = [];
for (var i in static_data) {
    static_regexp.push(["^" + i + "[\\/]?$", static_file_returner, { no_login: true }])
}
url_regexp = static_regexp.concat(url_regexp);

// trim whitespaces in all items in array
function ar_str_trim(ar) {
    for(var i = 0; i < ar.length; i++) {
        ar[i] = ar[i].trim();
    }
    return ar;
}

function ar_str_decodeURI(ar) {
    for(var i = 0; i < ar.length; i++) {
        ar[i] = decodeURIComponent(ar[i]);
    }
    return ar;
}

/*
    usage:
    split_limit("a|b|c|d|e|f|g", "|", 3) = ["a", "b", "c", "d|e|f|g"]
*/
function split_limit(str, char, limit) {
    if(!limit && limit != 0) limit = Infinity;
    var arr = str.split(char)
    var result = arr.splice(0, limit);
    result.push(arr.join(char));
    return result;
}

function parseCookie(input) {
    if(!input) input = "";
	var out = {};
	
	var mode = 0; // 0 = key, 1 = value
	var buffer_k = ""; // key
	var buffer_v = ""; // value
	
	for(var i = 0; i < input.length; i++) {
		var chr = input.charAt(i);
		
		var sSkip = false; // jump over char buffer
        
        // check for value assignments
		if(chr == "=" && mode == 0) {
			mode = 1;
			sSkip = true;
		}
		
		// char buffer
		if(chr != ";" && !sSkip) {
			if(mode == 0) {
				buffer_k += chr;
			}
			if(mode == 1) {
				buffer_v += chr;
			}
		}
        
        // check ending of each key/value
		if(chr == ";" || i == input.length - 1) {
			mode = 0;
			
			// trim whitespaces from beginning and end
			buffer_k = buffer_k.trim();
			buffer_v = buffer_v.trim();
			
			var valid = true;
            
            // ignore empty sets
			if(buffer_k == "" && buffer_v == "") {
				valid = false;
			}
			
			if(valid) {
                // strip quotes (if any)
				if(buffer_k.charAt(0) == "\"" && buffer_k.charAt(buffer_k.length - 1) == "\"") buffer_k = buffer_k.slice(1, -1);
				if(buffer_v.charAt(0) == "\"" && buffer_v.charAt(buffer_v.length - 1) == "\"") buffer_v = buffer_v.slice(1, -1);
                
                // invalid escape sequences can cause errors
				try {
					buffer_k = decodeURIComponent(buffer_k);
				} catch(e){};
				try {
					buffer_v = decodeURIComponent(buffer_v);
				} catch(e){};
                
                // no overrides from sets with the same key
				if(!(buffer_k in out)) out[buffer_k] = buffer_v;
			}
			
			buffer_k = "";
			buffer_v = "";
		}
	}
	
	return out;
}

// make sure filenames don't contain invalid sequences
var filename_sanitize = (function() {
	var illegalRe = /[\/\?<>\\:\*\|":]/g;
	var controlRe = /[\x00-\x1f\x80-\x9f]/g;
	var reservedRe = /^\.+$/;
	var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
	var windowsTrailingRe = /[\. ]+$/;

	function sanitize(input, replacement) {
		var sanitized = input
			.replace(illegalRe, replacement)
			.replace(controlRe, replacement)
			.replace(reservedRe, replacement)
			.replace(windowsReservedRe, replacement)
			.replace(windowsTrailingRe, replacement);
		return sanitized;
	}

	return function(input) {
		var replacement = "_";
		return sanitize(input, replacement);
	}
})()

// transfer all values from one object to a main object containing all imports
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

// wait for the client to upload form data to the server
function wait_response_data(req, dispatch) {
    var queryData = "";
    var error = false;
    return new Promise(function(resolve) {
        req.on("data", function(data) {
            if(error) return;
            try {
                queryData += data;
                if (queryData.length > 250000) {
                    queryData = "";
                    dispatch("Payload too large", 413)
                    error = true
                    resolve(null);
                }
            } catch(e) {
                handle_error(e);
            }
        });
        req.on("end", function() {
            if(error) return;
            try {
                resolve(querystring.parse(queryData, null, null, { maxKeys: 256 }))
            } catch(e) {
                resolve(null);
            }
        });
    })
}

function new_token(len) {
    var token = crypto.randomBytes(len).toString("hex");
    return token;
}

// generate an expire string for cookies
function cookie_expire(timeStamp) {
    var dayWeekList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var monthList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

	var _date = new Date(timeStamp);
	
    var _DayOfWeek = dayWeekList[_date.getUTCDay()];
    var _Day = _date.getUTCDate().toString().padStart(2, 0);
    var _Month = monthList[_date.getUTCMonth()];
    var _Year = _date.getUTCFullYear();
    var _Hour = _date.getUTCHours().toString().padStart(2, 0);
    var _Minute = _date.getUTCMinutes().toString().padStart(2, 0);
    var _Second = _date.getUTCSeconds().toString().padStart(2, 0);

    var compile = _DayOfWeek + ", " + _Day + " " + _Month + " " + _Year + " " + _Hour + ":" + _Minute + ":" + _Second + " UTC";
    return compile
}

function encode_base64(str) {
    return new Buffer(str).toString("base64");
}
function decode_base64(b64str) {
    return new Buffer(b64str, "base64").toString("ascii");
}

var https_reference = https;
var prev_cS = http.createServer; // previous reference to http.createServer
var https_disabled;

var options = {};

function manage_https() {
    var private_key = settings.ssl.private_key;
    var cert        = settings.ssl.cert;
    var chain       = settings.ssl.chain;

    if(settings.ssl_enabled) {
        // check if paths exist
        https_disabled = (!fs.existsSync(private_key) || !fs.existsSync(cert) || !fs.existsSync(chain));
    } else {
        https_disabled = true;
    }

    if(https_disabled) {
        console.log("\x1b[32;1mRunning server in HTTP mode\x1b[0m");
        http.createServer = function(opt, func) {
            return prev_cS(func);
        }
        https_reference = http;
    } else {
        console.log("\x1b[32;1mDetected HTTPS keys. Running server in HTTPS mode\x1b[0m");
        options = {
            key:  fs.readFileSync(private_key),
            cert: fs.readFileSync(cert),
            ca:   fs.readFileSync(chain)
        };
    }
}
manage_https();

// properly take all data from an error stack
function process_error_arg(e) {
    var error = {};
    if(typeof e == "object") {
        // retrieve hidden properties
        var keys = Object.getOwnPropertyNames(e);
        for(var i = 0; i < keys.length; i++) {
            error[keys[i]] = e[keys[i]];
        }
    } else {
        error.data = e;
    }
    return error;
}

async function get_user_info(cookies, is_websocket) {
    /*
        User Levels:
        3: Superuser (Operator)
        2: Superuser
        1: Staff
        0: regular user
    */
    var user = {
        authenticated: false,
        username: "",
        id: 0,
        csrftoken: null,
        operator: false,
        superuser: false,
        staff: false,
        scripts: []
    }
    if(cookies.sessionid) {
        // user data from session
        var s_data = await db.get("SELECT * FROM auth_session WHERE session_key=?", 
            cookies.sessionid);
        if(s_data) {
            user = JSON.parse(s_data.session_data);
            if(cookies.csrftoken == user.csrftoken) { // verify csrftoken
                user.authenticated = true;
                var level = (await db.get("SELECT level FROM auth_user WHERE id=?", user.id)).level;

                var operator = level == 3;
                var superuser = level == 2;
                var staff = level == 1;

                user.operator = operator;
                user.superuser = superuser || operator;
                user.staff = staff || superuser || operator;

                if(user.staff && !is_websocket) {
                    user.scripts = await db.all("SELECT * FROM scripts WHERE owner_id=? AND enabled=1", user.id);
                } else {
                    user.scripts = [];
                }
            }
            user.session_key = s_data.session_key;
        }
    }
    return user;
}

// return "s" or not depending on the quantity
function plural(int, plEnding) {
    var p = "";
    if(int != 1) {
        p = !plEnding ? "s" : plEnding;
    }
    return p;
}

async function world_get_or_create(name, do_not_create, force_create) {
    name += "";
    if(typeof name != "string") name = "";
    if(name.length > 10000) {
        do_not_create = true;
    }
    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", name);
    if(!world) { // world doesn't exist, create it
        if((name.match(/^([\w\.\-]*)$/g) && !do_not_create) || force_create) {
            var date = Date.now();
            var rw = await db.run("INSERT INTO world VALUES(null, ?, null, ?, 2, 0, 0, 0, 0, '', '', '', '', '', '', 0, 0, '{}')",
                [name, date])
            world = await db.get("SELECT * FROM world WHERE id=?", rw.lastID)
        } else { // special world names that must not be created
            return false;
        }
    }
    return world;
}

async function can_view_world(world, user) {
    var permissions = {
        member: false,
        owner: false,
        can_write: false
    };

    var is_owner = world.owner_id == user.id;
    var superuser = user.superuser;

    if(world.readability == 2 && !is_owner) { // owner only
        return false;
    }

    var is_member = await db.get("SELECT * FROM whitelist WHERE world_id=? AND user_id=?",
        [world.id, user.id])

    // members (and owners) only
    if(world.readability == 1 && !is_member && !is_owner) {
        return false;
    }

    permissions.member = !!is_member; // !! because is_member is not a boolean
    permissions.owner = is_owner;

    if(is_owner) {
        permissions.member = true;
        // the owner can write by default
        if(is_owner) permissions.can_write = true;
    }

    // the readability and writability both have to be less than 2 for members to write
    if(world.readability < 2 && is_member && world.writability < 2) permissions.can_write = true;

    // anyone can write if anyone can read and write
    if(world.readability == 0 && world.writability == 0) permissions.can_write = true;
    
    return permissions;
}

// from: http://stackoverflow.com/questions/8273047/javascript-function-similar-to-python-range
function xrange(start, stop, step) {
    if (typeof stop == "undefined") {
        stop = start;
        start = 0;
    }
    if (typeof step == "undefined") {
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
        return [];
    }
    var result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
        result.push(i);
    }
    return result;
};

function tile_coord(coord) {
    coord = coord.split(",")
    return [parseInt(coord[0]), parseInt(coord[1])];
}

var transaction_active = false;
var is_switching_mode = false; // is the sql engine (asynchronous) finished with switching transaction mode?
var on_switched;
var transaction_req_id = 0;
var req_id = 0;

function transaction_obj(id) {
    var req_id = id;
    var fc = {
        // start or end transactions safely
        begin: async function(id) {
            if(!transaction_active && !is_switching_mode) {
                transaction_active = true;
                is_switching_mode = true;
                transaction_req_id = req_id;
                await db.run("BEGIN TRANSACTION")
                is_switching_mode = false;
                if(on_switched) on_switched();
            } else if(is_switching_mode) { // the signal hasn't reached, so wait
                on_switched = function() {
                    on_switched = null;
                    fc.begin(); // now begin after the signal completed
                }
            }
        },
        end: async function() {
            if(transaction_active && !is_switching_mode) {
                transaction_active = false;
                is_switching_mode = true;
                await db.run("COMMIT")
                is_switching_mode = false;
                if(on_switched) on_switched();
            } else if(is_switching_mode) {
                on_switched = function() {
                    on_switched = null;
                    fc.end();
                }
            }
        }
    }
    return fc;
}

process.on("uncaughtException", function(e) {
    fs.writeFileSync(settings.UNCAUGHT_PATH, JSON.stringify(process_error_arg(e)));
    console.log("Uncaught error:", e);
    process.exit();
});

var start_time = Date.now();
var _time_ago = ["millisecond", "second", "minute", "hour", "day", "month", "year"];
function uptime(custom_ms_ago) {
    // (milliseconds ago)
    var difference = custom_ms_ago || (Date.now() - start_time);
    var milliseconds_ago = difference;
    var _data = _time_ago[0];
    var show_minutes = true; // EG: ... and 20 minutes
    var divided = 1;
	if(milliseconds_ago >= 30067200000) {
        _data = _time_ago[6];
        divided = 30067200000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else if(milliseconds_ago >= 2505600000) {
        _data = _time_ago[5];
        divided = 2505600000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else if(milliseconds_ago >= 86400000) {
        _data = _time_ago[4];
        divided = 86400000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else if(milliseconds_ago >= 3600000) {
        _data = _time_ago[3];
        divided = 3600000;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
    } else if(milliseconds_ago >= 60000) {
        _data = _time_ago[2];
        divided = 60000;
        show_minutes = false;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
    } else if(milliseconds_ago >= 1000) {
        _data = _time_ago[1];
        divided = 1000;
        show_minutes = false;
		milliseconds_ago = Math.floor(milliseconds_ago / divided);
	} else {
        show_minutes = false;
    }
	if(milliseconds_ago !== 1) {
		_data += "s";
    }
    var extra = "";
    if(show_minutes) {
        var t_difference = difference;
        t_difference -= divided;
        if(t_difference > 0) {
            t_difference %= divided;
            t_difference = Math.floor(t_difference / 60000);
            if(t_difference > 0) {
                extra = " and " + t_difference + " minute";
                if(t_difference != 1) extra += "s";
            }
        }
    }
	return milliseconds_ago + " " + _data + extra;
}

var server = https_reference.createServer(options, async function(req, res) {
    req_id++;
    var current_req_id = req_id;
    try {
        await process_request(req, res, current_req_id);
    } catch(e) {
        if(transaction_active) {
            if(transaction_req_id == current_req_id && transaction_req_id > -1) {
                transaction_active = false;
                await db.run("COMMIT");
            }
        }
        res.statusCode = 500;
        var err500Temp = "";
        try {
            err500Temp = template_data["500.html"]()
        } catch(e) {
            err500Temp = "An error has occured while displaying the 500 internal server error page";
            handle_error(e);
        }
        res.end(err500Temp);
        handle_error(e); // writes error to error log
    }
})

function compareNoCase(str1, str2) {
	str1 += "";
	str2 += "";
	var res = str1.localeCompare(str2, "en", {
		sensitivity: "base"
	});
	return !res;
}

var csrf_tokens = {}; // all the csrf tokens that were returned to the clients

async function process_request(req, res, current_req_id) {
    var hostname = req.headers.host;
    if(!hostname) hostname = "www.ourworldoftext.com";
    hostname = hostname.slice(0, 1000);
	var offset = 2;
    var subdomains = !isIP(hostname) ? hostname.split(".").reverse() : [hostname];
    var sub = subdomains.slice(offset);
    if(sub.length == 1 && compareNoCase(sub[0], "test")) {
        res.write("OWOT subdomain testing <test.hostname.tld>");
        return res.end();
    }
    if(sub.length == 1 && compareNoCase(sub[0], "forums")) {
        res.write("<html><h1>Test page</h1></html>");
        return res.end();
    }
    if(sub.length == 1 && compareNoCase(sub[0], "serverrequeststatus")) {
        res.write("{}");
        return res.end();
    }
    if(sub.length == 1 && compareNoCase(sub[0], "info")) {
        res.write("<html><h1>Info</h1></html>");
        return res.end();
    }

    var URL = url.parse(req.url).pathname;
    if(URL.charAt(0) == "/") {
        URL = URL.substr(1);
    }
    try {
        URL = decodeURIComponent(URL);
    } catch (e) {}

    var request_resolved = false;

    // server will return cookies to the client if it needs to
    var include_cookies = [];

    var transaction = transaction_obj(current_req_id)

    function dispatch(data, status_code, params) {
        if(request_resolved) return; // if request is already sent
        request_resolved = true;
        /* params: {
            cookie: the cookie data
            mime: mime type (ex: text/plain)
            redirect: url to redirect to
            download_file: force browser to download this file as .txt. specifies its name
        } (all optional)*/
        var info = {}
        if(!params) {
            params = {};
        }
        if(typeof params.cookie == "string") {
            include_cookies.push(params.cookie)
        } else if(typeof params.cookie == "object") {
            include_cookies = include_cookies.concat(params.cookie)
        }
        if(include_cookies.length == 1) {
            include_cookies = include_cookies[0];
        }
        if(include_cookies.length > 0) {
            info["Set-Cookie"] = include_cookies;
        }
        if(params.download_file) {
            info["Content-disposition"] = "attachment; filename=" + params.download_file;
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
        res.write(data, "utf8")
        res.end()
    }

    var vars = {};
    var vars_joined = false; // is already joined with global_data?

    var found_url = false;
    for(var i in url_regexp) {
        var row = url_regexp[i];
        var options = row[2];
        if(!options) options = {};
        if(URL.match(row[0])) {
            found_url = true;
            if(typeof row[1] == "object") {
                var no_login = options.no_login;
                var method = req.method.toUpperCase();
                var post_data = {};
                var query_data = querystring.parse(url.parse(req.url).query)
                var cookies = parseCookie(req.headers.cookie);
                var user;
                if(no_login) {
                    user = {};
                } else {
                    user = await get_user_info(cookies);
                    // check if user is logged in
                    if(!cookies.csrftoken) {
                        var token = new_token(32)
                        var date = Date.now();
                        include_cookies.push("csrftoken=" + token + "; expires=" + cookie_expire(date + Year) + "; path=/;")
                        user.csrftoken = token;
                    } else {
                        user.csrftoken = cookies.csrftoken;
                    }
                }
                var redirected = false;
                function redirect(path) {
                    dispatch(null, null, {
                        redirect: path
                    })
                    redirected = true;
                }
                if(redirected) {
                    return;
                }
                if(method == "POST") {
                    var dat = await wait_response_data(req, dispatch)
                    if(!dat) {
                        return;
                    }
                    post_data = dat;
                }
                var URL_mod = URL; // modified url
                // remove end slash if enabled
                if(options.remove_end_slash) {
                    URL_mod = removeLastSlash(URL_mod);
                }
                // return compiled HTML pages
                function HTML(path, data) {
                    if(!template_data[path]) { // template not found
                        return "An unexpected error occured while generating this page"
                    }
                    if(!data) {
                        data = {};
                    }
                    data.user = user;
                    /*if(data.csrftoken) {
                        csrf_tokens[data.csrftoken] = 1;
                    }*/
                    return trimHTML(template_data[path](data));
                }
                vars = objIncludes(global_data, { // extra information
                    cookies,
                    post_data,
                    query_data,
                    path: URL_mod,
                    user,
                    redirect,
                    referer: req.headers.referer,
                    transaction,
                    broadcast: global_data.ws_broadcast,
                    HTML
                })
                vars_joined = true;
                if(row[1][method]) {
                    // Return the page
                    await row[1][method](req, dispatch, vars, {})
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
    if(!vars.user) vars.user = await get_user_info(parseCookie(req.headers.cookie))
    if(!vars.cookies) vars.cookie = parseCookie(req.headers.cookie);
    if(!vars.path) vars.path = URL;
	if(!vars.HTML) {
		vars.HTML = function (path, data) {
			if(!template_data[path]) { // template not found
				return "An unexpected error occured while generating this page"
			}
			if(!data) {
				data = {};
			}
			data.user = vars.user;
			return template_data[path](data);
		}
	}

    if(!vars_joined) {
        vars = objIncludes(global_data, vars)
        vars_joined = true
    }

    if(!found_url || !request_resolved) {
        return dispage("404", null, req, dispatch, vars)
    }
}

async function MODIFY_ANNOUNCEMENT(text) {
    if(!text) text = "";
    text += "";
    announcement_cache = text;

    var element = await db.get("SELECT value FROM server_info WHERE name='announcement'");
    if(!element) {
        await db.run("INSERT INTO server_info values('announcement', ?)", text);
    } else {
        await db.run("UPDATE server_info SET value=? WHERE name='announcement'", text)
    }
    ws_broadcast({
        kind: "announcement",
        text: text
    })
}

async function modify_bypass_key(key) {
    key += "";
    fs.writeFileSync(settings.bypass_key, key);
    bypass_key_cache = key;
}

function announce(text) {
    (async function() {
        await MODIFY_ANNOUNCEMENT(text);
        console.log("Updated announcement");
    })();
}

async function validate_claim_worldname(worldname, vars, rename_casing, world_id) {
    var user = vars.user;
    var db = vars.db;
    var world_get_or_create = vars.world_get_or_create;

    // ignore first /
    if(worldname[0] == "/") worldname = worldname.substr(1);
    if(worldname == "" && !user.superuser) {
        return {
            error: true,
            message: "Worldname cannot be blank"
        }
    }
    if(worldname.length > 10000) {
        return {
            error: true,
            message: "Error while claiming this world"
        }
    }
    worldname = worldname.split("/");
    for(var i in worldname) {
        // make sure there is no blank segment (superusers bypass this)
        if(worldname[i] == "" && !user.superuser) {
            return {
                error: true,
                message: "Segments cannot be blank (make sure name does not end in /)"
            }
        }
        // make sure segment is valid
        var claimMainPage = (worldname[i] == "" && worldname.length == 1 && user.superuser); // if superusers claim the front page
        if(!(worldname[i].match(/^([\w\.\-]*)$/g) && (worldname[i].length > 0 || claimMainPage))) {
            return {
                error: true,
                message: "Invalid world name. Contains invalid characters. Must contain either letters, numbers, or _. It can be seperated by /"
            }
        }
    }

    var valid_world_name = worldname.join("/");

    if(worldname.length == 1) { // regular world names
        worldname = worldname[0];
        var world = await world_get_or_create(worldname, rename_casing);
        if(world.owner_id == null || (rename_casing && world.id == world_id)) {
            if(rename_casing) {
                if(world.id == world_id || !world) {
                    return {
                        rename: true,
                        new_name: valid_world_name
                    }
                } else {
                    return {
                        error: true,
                        message: "World already exists, cannot rename to it"
                    }
                }
            }
            return {
                world_id: world.id,
                message: "Successfully claimed the world"
            };
        } else {
            return {
                error: true,
                message: "World already has an owner"
            }
        }
    } else { // world with /'s
        // make sure first segment is a world owned by the user
        var base_worldname = worldname[0];
        var base_world = await world_get_or_create(base_worldname, true);
        // world does not exist nor is owned by the user
        if(!base_world || (base_world && base_world.owner_id != user.id)) {
            return {
                error: true,
                message: "You do not own the base world in the path"
            }
        }
        worldname = worldname.join("/");
        // create world, except if user is trying to rename
        var claimedSubworld = await world_get_or_create(worldname, rename_casing, (true && !rename_casing));
        // only renaming the casing
        if(rename_casing && claimedSubworld) {
            if(claimedSubworld.id == world_id) {
                return {
                    rename: true,
                    new_name: valid_world_name
                }
            }
        }
        // does not exist
        if(!claimedSubworld) {
            return {
                rename: true,
                new_name: valid_world_name
            }
        }
        // already owned (Unless owner renames it)
        if(claimedSubworld.owner_id != null && !(rename_casing && claimedSubworld.id == world_id)) {
            return {
                error: true,
                message: "You already own this subdirectory world"
            }
        }
        // subworld is created, now claim it
        return {
            world_id: claimedSubworld.id,
            message: "Successfully claimed the subdirectory world"
        };
    }
}

async function init_chat_history() {
    if(!await db_ch.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ch_info'")) {
        await db_ch.run("CREATE TABLE 'ch_info' (name TEXT, value TEXT)");
    }
    if(!await db_ch.get("SELECT value FROM ch_info WHERE name='initialized'")) {
        await db_ch.run("INSERT INTO ch_info VALUES('initialized', 'true')");
        await db_ch.run("CREATE TABLE channels (id integer NOT NULL PRIMARY KEY, name integer, properties text, description text, date_created integer, world_id integer)")
        await db_ch.run("CREATE TABLE entries (id integer NOT NULL PRIMARY KEY, date integer, channel integer, data text)")
        await db_ch.run("CREATE TABLE default_channels (channel_id integer, world_id integer)")
        var rowid = await db_ch.run("INSERT INTO channels VALUES(null, ?, ?, ?, ?, ?)",
            ["global", "{}", "The global channel - Users can access this channel from any page on OWOT", Date.now(), 0])
        var global_id = rowid.lastID;
        // if a chat log with an old format exists
        if(fs.existsSync(settings.CHAT_LOG_PATH)) {
            var chatlogFile = fs.readFileSync(settings.CHAT_LOG_PATH, "utf8");
            chatlogFile = JSON.parse(chatlogFile);
            var global = chatlogFile.global_chatlog;
            var world = chatlogFile.world_chatlog;
            
            await db_ch.run("BEGIN TRANSACTION")
            // begin copying global chats
            for(var i = 0; i < global.length; i++) {
                var rowStr = JSON.stringify(global[i]);
                await db_ch.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
                    [Date.now(), global_id, rowStr])
            }
            // begin copying world chats
            for(var i in world) {
                var worldId = (await db.get("SELECT id FROM world WHERE name=? COLLATE NOCASE", i))
                if(!worldId) continue;
                worldId = worldId.id;
                var channelDesc = "Channel - \"" + i + "\"";
                if(!i) { // No name? It's the front page
                    channelDesc = "Front page channel"
                }
                // channel names start with _ (underscore)
                var world_channel = await db_ch.run("INSERT INTO channels VALUES(null, ?, ?, ?, ?, ?)",
                    ["_" + i, "{}", channelDesc, Date.now(), worldId])
                var chats = world[i];
                // copy each chat into the channel for the world
                for(var c = 0; c < chats.length; c++) {
                    var rowStr = JSON.stringify(chats[c]);
                    await db_ch.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
                        [Date.now(), world_channel.lastID, rowStr])
                }
                // mark this channel as the default for the world
                await db_ch.run("INSERT INTO default_channels VALUES(?, ?)",
                    [world_channel.lastID, worldId])
            }
            await db_ch.run("COMMIT")
        }
    }

    updateChatLogData();
}

var chat_cache = {};

function queue_chat_cache(world_id) {
    return new Promise(function(res) {
        chat_cache[world_id].queue.push(function(data) {
            res(data);
        })
    })
}

// safely delete the chat cache to free up memory
function invalidate_chat_cache(world_id) {
    var cache = chat_cache[world_id];
    if(!cache) return;

    // do not clear caches that are already being loaded
    if(!cache.loaded) return;

    // if chat entries are not added to the database, do not clear the cache
    if(world_id == 0) { // global channel
        if(global_chat_additions.length) return;
    } else { // world channel
        if(world_chat_additions[world_id]) return;
    }

    cache.queue.splice(0);
    cache.data.splice(0);
    cache.loaded = false;

    delete chat_cache[world_id];
}

// every 5 minutes, clear the chat cache
intv.invalidate_chat_cache = setInterval(function() {
    for(var i in chat_cache) {
        invalidate_chat_cache(i);
    }
}, Minute * 5)

// Retrieves the chat history of a specific channel instead of loading the entire database into memory
// The global channel is retrieved by using world id 0
// includes a race condition resolving system
async function retrieveChatHistory(world_id) {
    // no cache has been started
    if(!(world_id in chat_cache)) {
        chat_cache[world_id] = {queue: [], data: [], loaded: false};
    } else if(!chat_cache[world_id].loaded) {
        // a cache is in progress but not loaded yet
        return await queue_chat_cache(world_id);
    }

    // data for this channel is already fully loaded and cached
    if(world_id in chat_cache && chat_cache[world_id].loaded) return chat_cache[world_id].data;

    var default_channel;
    if(world_id != 0) { // not global channel (world channels)
        default_channel = await db_ch.get("SELECT channel_id FROM default_channels WHERE world_id=?", world_id);
        if(default_channel) {
            default_channel = default_channel.channel_id;
        } else {
            default_channel = 0;
        }
    } else { // global channel
        default_channel = await db_ch.get("SELECT id FROM channels WHERE world_id=0");
        if(default_channel) {
            default_channel = default_channel.id;
        } else {
            default_channel = 0;
        }
    }
    // add data if the channel exists. otherwise it's empty
    if(default_channel) {
        var world_chats;
        if(chatIsCleared[world_id]) {
            // the channel is being cleared. return a blank history
            world_chats = [];
        } else {
            world_chats = await db_ch.all("SELECT * FROM (SELECT * FROM entries WHERE channel=? ORDER BY id DESC LIMIT 100) ORDER BY id ASC", default_channel);
        }
        for(var a = 0; a < world_chats.length; a++) {
            var row = JSON.parse(world_chats[a].data);
            chat_cache[world_id].data.push(row)
        }
    }
    chat_cache[world_id].loaded = true;

    // other calls to this function requested the same chat history while is was being fetched.
    // send the complete data to those calls
    var queue = chat_cache[world_id].queue;
    for(var i = 0; i < queue.length; i++) {
        queue[i](chat_cache[world_id].data);
    }

    return chat_cache[world_id].data;
}

async function add_to_chatlog(chatData, world_id) {
    var location = "page"
    if(world_id == 0) {
        location = "global"
    }

    var history = await retrieveChatHistory(world_id);

    history.push(chatData);
    if(history.length > 100) {
        history.shift();
    }

    if(location == "page") {
        world_chat_additions.push([chatData, world_id]);
    } else if(location == "global") {
        global_chat_additions.push(chatData);
    }
}

var worldData = {};
var chatIsCleared = {};

var global_chat_additions = [];
var world_chat_additions = [];

function clearChatlog(world_id) {
    // clear from cache if it exists
    if(chat_cache[world_id] && chat_cache[world_id].loaded) {
        chat_cache[world_id].data.splice(0);
    }
    // queue to be cleared
    chatIsCleared[world_id] = true;
}

async function doUpdateChatLogData() {
    var copy_global_chat_additions = global_chat_additions.slice(0);
    var copy_world_chat_additions = world_chat_additions.slice(0);
    var copy_chatIsCleared = Object.assign(chatIsCleared, {})

    global_chat_additions = [];
    world_chat_additions = [];
    chatIsCleared = {};

    await db_ch.run("BEGIN TRANSACTION")

    for(var i in copy_chatIsCleared) {
        var worldId = i;
        var def_channel = await db_ch.get("SELECT channel_id FROM default_channels WHERE world_id=?", worldId)
        if(!def_channel) continue;
        def_channel = def_channel.channel_id
        await db_ch.run("DELETE FROM entries WHERE channel=?", def_channel)
    }

    for(var i = 0; i < copy_world_chat_additions.length; i++) {
        var row = copy_world_chat_additions[i];
        var chatData = row[0];
        var worldId = row[1];
        var worldName = await db.get("SELECT name FROM world WHERE id=?", worldId);
        if(!worldName) continue;
        worldName = worldName.name;
        var def_channel = await db_ch.get("SELECT channel_id FROM default_channels WHERE world_id=?", worldId)
        if(!def_channel) {
            var channelDesc = "Channel - \"" + worldName + "\"";
            if(!worldName) { // "" = front page
                channelDesc = "Front page channel"
            }
            var world_channel = await db_ch.run("INSERT INTO channels VALUES(null, ?, ?, ?, ?, ?)",
                ["_" + worldName, "{}", channelDesc, Date.now(), worldId])
            var new_def_channel = await db_ch.run("INSERT INTO default_channels VALUES(?, ?)",
                [world_channel.lastID, worldId])
            def_channel = world_channel.lastID;
        } else {
            def_channel = def_channel.channel_id;
        }
        await db_ch.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
            [Date.now(), def_channel, JSON.stringify(chatData)])
    }

    for(var i = 0; i < copy_global_chat_additions.length; i++) {
        var row = copy_global_chat_additions[i];
        var global_channel = (await db_ch.get("SELECT id FROM channels WHERE name='global'")).id;
        await db_ch.run("INSERT INTO entries VALUES(null, ?, ?, ?)",
            [Date.now(), global_channel, JSON.stringify(row)])
    }

    await db_ch.run("COMMIT")
}

async function updateChatLogData(no_timeout) {
    if(!(global_chat_additions.length > 0 ||
          world_chat_additions.length > 0 ||
          Object.keys(chatIsCleared).length > 0)) {
        if(!no_timeout) intv.updateChatLogData = setTimeout(updateChatLogData, 1000);
        return;
    }

    try {
        await doUpdateChatLogData();
    } catch(e) {
        handle_error(e);
    }

    if(!no_timeout) intv.updateChatLogData = setTimeout(updateChatLogData, 5000);
}

function getWorldData(world) {
    var ref = world.toLowerCase();

    if(worldData[ref]) return worldData[ref];

    worldData[ref] = {
        client_ids: {},
        id_overflow_int: 10000,
        user_count: 1
    }

    return worldData[ref];
}
function generateClientId(world) {
    var worldObj = getWorldData(world);

    var client_ids = worldObj.client_ids;

    // attempt to get a random id
	for(var i = 0; i < 64; i++) {
		var inclusive_id = Math.floor(Math.random() * ((9999 - 1000) + 1)) + 1000;
		if(!client_ids[inclusive_id]) return inclusive_id;
	}
	// attempt to enumerate if it failed
	for(var i = 1000; i <= 9999; i++) {
		if(!client_ids[i]) return i;
    }
    return worldObj.id_overflow_int++;
}

function getUserCountFromWorld(world) {
    var counter = 0;
    wss.clients.forEach(function(ws) {
        var user_world = ws.world_name;
        if(NCaseCompare(user_world, world)) {
            counter++;
        }
    })
    return counter;
}

function topActiveWorlds(number) {
    var clientNumbers = [];
    for(var i in worldData) {
        var cnt = getUserCountFromWorld(i);
        if(cnt == 0) continue;
        clientNumbers.push([cnt, i])
    }
    clientNumbers.sort(function(int1, int2) {
        return int2[0] - int1[0];
    })
    return clientNumbers.slice(0, number);
}

function broadcastUserCount() {
    if(!global_data.ws_broadcast) return;
    for(var user_world in worldData) {
        var worldObj = getWorldData(user_world);
        var current_count = worldObj.user_count;
        var new_count = getUserCountFromWorld(user_world);
        if(current_count != new_count) {
            worldObj.user_count = new_count;
            global_data.ws_broadcast({
                source: "signal",
                kind: "user_count",
                count: new_count
            }, user_world, {
                isChat: true,
                clientId: 0,
                chat_perm: "INHERIT"
            });
        }
    }
}

async function clear_expired_sessions(no_timeout) {
    // clear expires sessions
    await db.run("DELETE FROM auth_session WHERE expire_date <= ?", Date.now());

    // clear expired registration keys (and accounts that aren't activated yet)
    await db.each("SELECT id FROM auth_user WHERE is_active=0 AND ? - date_joined >= ?",
        [Date.now(), Day * settings.activation_key_days_expire], async function(data) {
        var id = data.id;
        await db.run("DELETE FROM registration_registrationprofile WHERE user_id=?", id);
        await db.run("DELETE FROM auth_user WHERE id=?", id)
    })

    if(!no_timeout) intv.clearExpiredSessions = setTimeout(clear_expired_sessions, Minute);
}

function resembles_int_number(string) {
    if(!string) return false;
    var set = "0123456789"
    for(var i = 0; i < string.length; i++) {
        var chr = string.charAt(i);
        if(set.indexOf(chr) == -1) return false;
    }
    return true;
}

var client_ips = {};
var closed_client_limit = 1000 * 60 * 16;
// TODO: some leftover disconnected clients (although rare)
intv.clear_closed_clients = setInterval(function() {
    var curTime = Date.now();
    for(var w in client_ips) {
        var world = client_ips[w];
        for(var c in world) {
            var client = world[c];
            if(client[4] && client[3] > -1 && client[3] + closed_client_limit <= curTime) {
                delete world[c];
            }
        }
        var keys = Object.keys(world);
        if(keys.length == 0) {
            delete client_ips[w];
        }
    }
}, 1000 * 60)

// ping clients every 30 seconds (resolve the issue where cloudflare terminates sockets inactive for approx. 1 minute)
function initPingAuto() {
    intv.ping_clients = setInterval(function() {
        if(!wss) return;
        wss.clients.forEach(function(ws) {
            if(ws.readyState != WebSocket.OPEN) return;
            try {
                ws.ping("keepalive")
            } catch(e) {
                handle_error(e);
            };
        })
    }, 1000 * 30)
}

async function initialize_server_components() {
    await (async function() {
        announcement_cache = await db.get("SELECT value FROM server_info WHERE name='announcement'");
        if(!announcement_cache) {
            announcement_cache = "";
        } else {
            announcement_cache = announcement_cache.value;
        }
    })();

    bypass_key_cache = fs.readFileSync(settings.bypass_key).toString("utf8");

    intv.userCount = setInterval(function() {
        broadcastUserCount();
    }, 2000);

    await clear_expired_sessions();

    server.listen(serverPort, function() {
        var addr = server.address();

        var cWidth = 50;
        var cHeight = 7;

        var tmg = new TerminalMessage(cWidth, cHeight);

        tmg.setSquare(0, 0, 25, cHeight - 1, "bright_cyan");
        tmg.setText("OWOT Server is running", 2, 1, "bright_white")
        tmg.setText("Address:", 2, 2, "bright_white")
        tmg.setText(addr.address + "", 4, 3, "cyan")
        tmg.setText("Port:", 2, 4, "bright_white")
        tmg.setText(addr.port + "", 4, 5, "cyan")

        console.log(tmg.render());

        // start listening for commands
        command_prompt();
    });

    wss = new WebSocket.Server({ server });
    global_data.wss = wss;

    sysLoad();
    sintLoad();

    initPingAuto();

    ws_broadcast = function(data, world, opts) {
        if(!opts) opts = {};
        data = JSON.stringify(data)
        wss.clients.forEach(function each(client) {
            try {
                if(client.readyState == WebSocket.OPEN &&
                world == void 0 || NCaseCompare(client.world_name, world)) {
                    if(opts.isChat) {
                        // when Inherited, it refers to the client's cached settings to avoid constant db lookups
                        if(opts.chat_perm == "INHERIT") opts.chat_perm = client.chat_permission;
                        if(opts.chat_perm == 1) if(!(client.is_member || client.is_owner)) return;
                        if(opts.chat_perm == 2) if(!client.is_owner) return;
                        if(client.chat_blocks && client.chat_blocks.indexOf(opts.clientId) > -1 ||
                            (client.chat_blocks.indexOf("*") > -1) && opts.clientId != 0) return;
                    }
                    client.send(data);
                }
            } catch(e) {
                handle_error(e);
            }
        });
    };

    tile_signal_update = function(world, x, y, content, properties, writability) {
        ws_broadcast({
            source: "signal",
            kind: "tileUpdate",
            tiles: {
                [y + "," + x]: {
                    content,
                    properties: Object.assign(properties, { writability })
                }
            }
        }, world)
    };

    global_data.ws_broadcast = ws_broadcast;
    global_data.tile_signal_update = tile_signal_update;

    wss.on("connection", async function (ws, req) {
        var ipHeaderAddr = "Unknown"
        try {
            var rnd = Math.floor(Math.random() * 1E4);
            var forwd = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];
            var realIp = req.headers["X-Real-IP"] || req.headers["x-real-ip"];
            if(!forwd) forwd = "None;" + rnd;
            if(!realIp) realIp = "None;" + rnd;
            ipHeaderAddr = forwd + " & " + realIp;
            ws.ipHeaderAddr = ipHeaderAddr;
            ws.ipFwd = forwd;
            ws.ipReal = realIp;
        } catch(e) {
            var error_ip = "ErrC" + Math.floor(Math.random() * 1E4);
            ws.ipHeaderAddr = error_ip;
            ws.ipFwd = error_ip;
            ws.ipReal = error_ip;
            handle_error(e);
        }

        var req_per_second = 133;
        var reqs_second = 0; // requests received at current second
        var current_second = Math.floor(Date.now() / 1000);
        function can_process_req() { // limit requests per second
            var compare_second = Math.floor(Date.now() / 1000);
            reqs_second++;
            if(compare_second == current_second) {
                if(reqs_second >= req_per_second) {
                    return false;
                } else {
                    return true;
                }
            } else {
                reqs_second = 0;
                current_second = compare_second;
                return true;
            }
        }
        try {
            // must be at the top before any async calls (errors would occur before this event declaration)
            ws.on("error", function(err) {
                handle_error(JSON.stringify(process_error_arg(err)));
            });
            var pre_queue = [];
            // adds data to a queue. this must be before any async calls and the message event
            function onMessage(msg) {
                pre_queue.push(msg);
            }
            ws.on("message", function(msg) {
                if(!can_process_req()) return;
                onMessage(msg);
            });
            var status, clientId = void 0;
            ws.on("close", function() {
                if(status && clientId != void 0) {
                    if(client_ips[status.world.id] && client_ips[status.world.id][clientId]) {
                        client_ips[status.world.id][clientId][4] = true;
                        client_ips[status.world.id][clientId][3] = Date.now();
                    }
                }
            });
            var location = url.parse(req.url).pathname;
            var world_name;
            function send_ws(data) {
                if(ws.readyState === WebSocket.OPEN) {
                    try {
                        ws.send(data) // not protected by callbacks
                    } catch(e) {
                        handle_error(e);
                    };
                }
            }
            if(location.match(/(\/ws\/$)/)) {
                world_name = location.replace(/(^\/)|(\/ws\/)|(ws\/$)/g, "");
            } else if(location === "/ws/r_u_alive/") {
                send_ws('"sure m8"');
                onMessage = function() {
                    send_ws('"yes im still alive"');
                };
                delete pre_queue;
                return;
            } else {
                send_ws(JSON.stringify({
                    kind: "error",
                    message: "Invalid address"
                }));
                return ws.close();
            }
            
            ws.world_name = world_name;

            var cookies = parseCookie(req.headers.cookie);
            var user = await get_user_info(cookies, true)
            var channel = new_token(16);
            var vars = objIncludes(global_data, {
                user,
                channel
            })

            status = await websockets.Main(ws, world_name, vars);

            ws.world_id = status.world.id;

            if(typeof status == "string") {
                send_ws(JSON.stringify({
                    kind: "error",
                    message: status
                }));
                return ws.close();
            }
            vars.world = status.world;
            vars.timemachine = status.timemachine

            var properties = JSON.parse(status.world.properties);
            var chat_permission = properties.chat_permission;
            if(!chat_permission) chat_permission = 0;
            ws.chat_permission = chat_permission;

            var can_chat = chat_permission == 0 || (chat_permission == 1 && status.permission.member) || (chat_permission == 2 && status.permission.owner);

            var initial_user_count;
            if(can_chat) {
                initial_user_count = getUserCountFromWorld(world_name);
            }

            user.stats = status.permission;

            ws.is_member = user.stats.member;
            ws.is_owner = user.stats.owner;

            clientId = generateClientId(world_name);

            if(!client_ips[status.world.id]) {
                client_ips[status.world.id] = {};
            }
            client_ips[status.world.id][clientId] = [ws._socket.remoteAddress, ws._socket.address(), ws.ipHeaderAddr, -1, false];

            ws.clientId = clientId;
            ws.chat_blocks = [];

            var sentClientId = clientId;
            if(!can_chat) sentClientId = -1;
            send_ws(JSON.stringify({
                kind: "channel",
                sender: channel,
                id: sentClientId,
                initial_user_count
            }))
            onMessage = async function(msg) {
                if(!can_process_req()) return;
                try {
                    if(!(typeof msg == "string" || typeof msg == "object")) {
                        return;
                    }
                    if(!(msg.constructor == Buffer || msg.constructor == String)) {
                        return send_ws(JSON.stringify({
                            kind: "error",
                            message: "Invalid socket type"
                        }))
                    }
                    if(msg.constructor == Buffer) { // buffers not supported at the moment
                        return;
                    }
                } catch(e) {
                    handle_error(e);
                    return;
                }
                req_id++;
                var current_req_id = req_id;
                try {
                    // This is a ping
                    if(msg.startsWith("2::")) {
                        var args = msg.substr(3);
                        var res = {
                            kind: "ping",
                            result: "pong"
                        }
                        if(args == "@") {
                            res.time = true;
                        }
                        return send_ws(JSON.stringify(res));
                    }
                    // Parse request. If failed, return a "418" message
                    try {
                        msg = JSON.parse(msg);
                    } catch(e) {
                        send_ws(JSON.stringify({
                            kind: "error",
                            message: "418 I'm a Teapot"
                        }))
                        return ws.close()
                    }
                    if(!msg || msg.constructor != Object) {
                        send_ws(JSON.stringify({
                            kind: "error",
                            message: "Invalid_Type"
                        }))
                        return;
                    }
                    var kind = msg.kind;
                    // Begin calling a websocket function for the necessary request
                    if(websockets[kind]) {
                        function send(msg) {
                            msg.kind = kind
                            send_ws(JSON.stringify(msg))
                        }
                        function broadcast(data, opts) {
                            data.source = kind;
                            ws_broadcast(data, world_name, opts);
                        }
                        var res = await websockets[kind](ws, msg, send, objIncludes(vars, {
                            transaction: transaction_obj(current_req_id),
                            broadcast,
                            clientId
                        }))
                        if(typeof res == "string") {
                            send_ws(JSON.stringify({
                                kind: "error",
                                message: res
                            }));
                        }
                    }
                } catch(e) {
                    handle_error(e);
                }
            }
            // Some messages might have been received before the socket finished opening
            if(pre_queue.length > 0) {
                for(var p = 0; p < pre_queue.length; p++) {
                    onMessage(pre_queue[p]);
                    pre_queue.splice(p, 1)
                    p--;
                }
            }
        } catch(e) {
            handle_error(e);
        }
    })
}

var wss;
function start_server() {
    (async function() {
        try {
            await initialize_server_components();
        } catch(e) {
            console.log("An error occured during component initialization");
            console.log(e);
        }
    })();
}

function TerminalMessage(cWidth, cHeight) {
    var charField = new Array(cWidth * cHeight).fill(" ");
    var foreColorField = new Array(cWidth * cHeight).fill("");
    var backColorField = new Array(cWidth * cHeight).fill("");

    var chrInf = {
        vPipe: "\u2551",
        hPipe: "\u2550",
        tlPipe: "\u2554",
        trPipe: "\u2557",
        blPipe: "\u255a",
        brPipe: "\u255d",
        mShade: "\u2592"
    }

    var fore_colors = {
        black:          "30",
        red:            "31",
        green:          "32",
        yellow:         "33",
        blue:           "34",
        magenta:        "35",
        cyan:           "36",
        white:          "37",
        bright_black:   "30;1",
        bright_red:     "31;1",
        bright_green:   "32;1",
        bright_yellow:  "33;1",
        bright_blue:    "34;1",
        bright_magenta: "35;1",
        bright_cyan:    "36;1",
        bright_white:   "37;1"
    };
    
    var back_colors = {
        black:          "40",
        red:            "41",
        green:          "42",
        yellow:         "43",
        blue:           "44",
        magenta:        "45",
        cyan:           "46",
        white:          "47",
        bright_black:   "100",
        bright_red:     "101",
        bright_green:   "102",
        bright_yellow:  "103",
        bright_blue:    "104",
        bright_magenta: "105",
        bright_cyan:    "106",
        bright_white:   "107"
    };

    this.setChar = function(chr, x, y, fore, back) {
        if(x < 0 || y < 0 || x >= cWidth || y >= cHeight) return;
        var idx = y * cWidth + x;
        if(chr == "\r" || chr == "\n" || chr.length != 1) chr = " ";
        charField[idx] = chr;
        if(fore) {
            foreColorField[idx] = fore_colors[fore]
        } else if(fore != "i") {
            foreColorField[idx] = "";
        }
        if(back) {
            backColorField[idx] = back_colors[back]
        } else if(back != "i") {
            backColorField[idx] = "";
        }
    }

    this.setSquare = function(x1, y1, x2, y2, fore, back) {
        var tmp;
        // flip x positions if the X is greater than Y
        if(x1 > x2) {
            tmp = x1;
            x1 = x2;
            x2 = tmp;
        }
        if(y1 > y2) {
            tmp = y1;
            y1 = y2;
            y2 = tmp;
        }

        // 4 corners
        this.setChar(chrInf.tlPipe, x1, y1, fore, back)
        this.setChar(chrInf.brPipe, x2, y2, fore, back)
        this.setChar(chrInf.trPipe, x2, y1, fore, back)
        this.setChar(chrInf.blPipe, x1, y2, fore, back)

        // 2 horizontal lines
        for(var x = 0; x < x2 - x1 - 1; x++) {
            this.setChar(chrInf.hPipe, x + x1 + 1, y1, fore, back);
            this.setChar(chrInf.hPipe, x + x1 + 1, y2, fore, back);
        }

        // 2 vertical lines
        for(var y = 0; y < y2 - y1 - 1; y++) {
            this.setChar(chrInf.vPipe, x1, y + y1 + 1, fore, back);
            this.setChar(chrInf.vPipe, x2, y + y1 + 1, fore, back);
        }
    }

    this.setText = function(text, x, y, fore, back) {
        var cx = x;
        var cy = y;
        for(var i = 0; i < text.length; i++) {
            var chr = text[i];
            if(chr == "\n") {
                cx = c;
                cy++;
                continue;
            }
            this.setChar(chr, cx, cy, fore, back);
            cx++;
        }
    }

    this.setBack = function(back) {
        for(var i = 0; i < backColorField.length; i++) {
            backColorField[i] = back_colors[back];
        }
    }

    // render the char field into a string to be logged to the terminal
    this.render = function() {
        var res = "";

        var use_color = false;
        var prev_back = "";
        var prev_fore = "";
        var prev_is_bright = false;

        var xNl = 0;
        // is space, reset fore color
        for(var i = 0; i < charField.length; i++) {
            if(charField[i] == " ") foreColorField[i] = "";
        }

        for(var i = 0; i < charField.length; i++) {
            // with color escape optimizations
            var foreCol = foreColorField[i];
            var backCol = backColorField[i];

            var foreColD = foreCol; // original copy of color info (original will get modified)
            var backColD = backCol;
            if(foreCol || backCol) use_color = true;

            var col_cmp = "";

            if(backCol && prev_back == backCol) backCol = "";
            if(foreCol && prev_fore == foreCol) foreCol = "";

            if(foreCol && !backCol) col_cmp = foreCol;
            if(!foreCol && backCol) col_cmp = backCol;
            if(foreCol && backCol) col_cmp = foreCol + ";" + backCol;

            var fBlank = false;
            var bBlank = false;
            var blank = "";

            // detect if the current character has no color information, but the previous character did
            if(prev_back && !backColD) {
                backCol = "";
                prev_back = "";
                bBlank = true;
            }
            if(prev_fore && !foreColD) {
                foreCol = "";
                prev_fore = "";
                fBlank = true;
            }
            // reset to terminal default colors
            if(fBlank && !bBlank) blank = "\x1b[" + "37" + "m";
            if(!fBlank && bBlank) blank = "\x1b[" + "40" + "m";
            if(fBlank && bBlank) blank = "\x1b[" + "0" + "m";
            res += blank;

            // reset brightness
            if(prev_is_bright && !foreColD.endsWith(";1")) {
                res += "\x1b[0m";
            }

            // set the color of the character
            if(col_cmp) res += "\x1b[" + col_cmp + "m";
            res += charField[i];

            if(backCol) prev_back = backCol;
            if(foreCol) prev_fore = foreCol;
            if(foreColD.endsWith(";1")) {
                prev_is_bright = true;
            } else {
                prev_is_bright = false;
            }
            
            // detect newlines
            xNl++;
            if(xNl >= cWidth) {
                xNl = 0;
                if(i != charField.length - 1) res += "\n";
            }
        }

        if(use_color) {
            res += "\x1b[0m"; // terminal reset
        }

        return res;
    }

    return this;
}

var base64table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encodeCharProt(array) {
	// convert array from writability-format to base64-format
	for(var c = 0; c < array.length; c++) {
		switch(array[c]) {
			case null: array[c] = 0; continue;
			case 0: array[c] = 1; continue;
			case 1: array[c] = 2; continue;
			case 2: array[c] = 3; continue;
		}
	}
	var str = "@";
	var bytes = Math.ceil(128 / 3)
	for(var i = 0; i < bytes; i++) {
		var idx = i * 3;
		var char1 = ((4*4)*array[idx + 0]);
		var char2 = ((4)*array[idx + 1])
		var char3 = ((1)*array[idx + 2])
		if(idx + 1 > 127) char2 = 0;
		if(idx + 2 > 127) char3 = 0;
		var code = char1 + char2 + char3;
		str += base64table.charAt(code)
	}
	return str;
}

function decodeCharProt(str) {
	var res = new Array(128).fill(0);
	str = str.substr(1);
	for(var i = 0; i < str.length; i++) {
		var code = base64table.indexOf(str.charAt(i));
		var char1 = Math.trunc(code / (4*4) % 4);
		var char2 = Math.trunc(code / (4) % 4);
		var char3 = Math.trunc(code / (1) % 4);
		res[i*3 + 0] = char1;
		if(i*3 + 1 > 127) break;
		res[i*3 + 1] = char2;
		if(i*3 + 2 > 127) break;
		res[i*3 + 2] = char3;
	}
	// convert from base64-format to writability-format
	for(var c = 0; c < res.length; c++) {
		switch(res[c]) {
			case 0: res[c] = null; continue;
			case 1: res[c] = 0; continue;
			case 2: res[c] = 1; continue;
			case 3: res[c] = 2; continue;
		}
	}
	return res;
}
/*
	Writability format (tiles and chars):
		null: The parent's writability
		0: public
		1: members
		2: owners
*/

// split a string properly with characters containing surrogates and combining characters
function advancedSplit(str) {
    str += "";
    var data = str.match(/([\uD800-\uDBFF][\uDC00-\uDFFF])|(([\0-\u02FF\u0370-\u1DBF\u1E00-\u20CF\u2100-\uD7FF\uDC00-\uFE1F\uFE30-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF])([\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+))|.|\n|\r/g)
    if(data == null) return [];
    for(var i = 0; i < data.length; i++) {
        // contains surrogates without second character?
		// This invalid character would not have been added to the string anyway
        if(data[i].match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g)) {
            data.splice(i, 1)
        }
    }
    for(var i = 0; i < data.length; i++) {
        data[i] = data[i].slice(0, 16); // limit of 16 combining characters
    }
    // if a part contains a single nul character, make the entire part nul
	for(var i = 0; i < data.length; i++) {
        var chr = data[i];
		for(var x = 0; x < chr.length; x++) {
			if(chr[x] == "\0") {
				data[i] = "\0";
				break;
			}
		}
    }
    return data;
}

function insert_char_at_index(string, char, index) {
	string += "";
	char += "";
	string = advancedSplit(string);
	var stringPrev = string.slice(0);
	char = advancedSplit(char);
	if(char.length == 0) return string.join("");
	if(char.length > 1) char = char.slice(0, 1);
	char = char[0];
	
	if(char == "\0") return string.join("");
	
	var c1 = /([\0-\u02FF\u0370-\u1DBF\u1E00-\u20CF\u2100-\uD7FF\uDC00-\uFE1F\uFE30-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF])/g

	var c2 = /([\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+)/g

	var ex1 = char.match(c1)
	var ex2 = char.match(c2)

	if(ex2 && !ex1) { // combining char without the first char?
		char = "@"
	}
	
	string[index] = char;
	
	string = string.join("");
	
	string = advancedSplit(string);
	
	for(var i = 0; i < 128; i++) {
		var char1 = stringPrev[i];
		var char2 = string[i];
		
		if(i == index) continue;
		if(char1 != char2) {
			stringPrev[index] = "!";
			string = stringPrev;
		}
	}
	
	// make sure content is exactly 128
    if(string.length > 128) string = string.slice(0, 128);
    if(string.length < 128) string = string.concat(Array(128).fill(" ")).slice(0, 128);
	
	return string.join("");
}

function handle_error(e) {
    var str = JSON.stringify(process_error_arg(e));
    log_error(str);
    if(isTestServer) {
        console.log("Error:", str)
    }
}

function html_tag_esc(str, non_breaking_space) {
    str = str.replace(/\&/g, "&amp;");
    str = str.replace(/\"/g, "&quot;");
    str = str.replace(/\'/g, "&#39;");
    if(non_breaking_space) { // replace spaces with non-breaking space html tags
        str = str.replace(/\u0020/g, "&nbsp;");
    }
    str = str.replace(/\</g, "&lt;");
    str = str.replace(/\>/g, "&gt;");
    return str;
}

function sanitize_color(col) {
    if(!col) col = 0;
    col = parseInt(col);
    if(!col) col = 0;
    if(col == -1) return -1; // skips the colors if -1
    col = Math.floor(col);
    if(col < 0) col = 0;
    if(col > 16777215) col = 16777215;
    return col;
}

function fixColors(colors) {
	if(Array.isArray(colors)) {
		colors = colors.slice(0, 128);
		for(var g = 0; g < colors.length; g++) {
			colors[g] = sanitize_color(colors[g]);
		}
	} else {
		colors = sanitize_color(colors);
	}
	return colors;
}

var worldViews = {};

var global_data = {
    template_data,
    db,
    dispage,
    ms,
    cookie_expire,
    checkHash,
    encryptHash,
    new_token,
    querystring,
    url,
    split_limit,
    website: settings.website,
    send_email,
    crypto,
    filename_sanitize,
    get_third,
    get_fourth,
    create_date,
    get_user_info,
    world_get_or_create,
    can_view_world,
    san_nbr,
    xrange,
    tile_coord,
    modules,
    plural,
    announcement: function() { return announcement_cache },
    announce: MODIFY_ANNOUNCEMENT,
    uptime,
    validate_claim_worldname,
    encodeCharProt,
    decodeCharProt,
    advancedSplit,
    insert_char_at_index,
    add_to_chatlog,
    getWorldData,
    clearChatlog,
    html_tag_esc,
    wss, // this is undefined by default, but will get a value once wss is initialized
    topActiveWorlds,
    NCaseCompare,
    handle_error,
    retrieveChatHistory,
    client_ips,
    modify_bypass_key,
    get_bypass_key: function() { return bypass_key_cache },
    trimHTML,
    tile_database: systems.tile_database,
    g_transaction: transaction_obj(-1),
    intv,
    WebSocket,
    fixColors,
    sanitize_color,
    worldViews
}

function sysLoad() {
    // initialize variables in the systems
    for(var i in systems) {
        var sys = systems[i];
        sys.main(global_data);
    }
}

function sintLoad() {
    // if page modules contain a startup function, run it
    for(var i in pages) {
        var mod = pages[i];
        if(mod.startup_internal) {
            mod.startup_internal(global_data);
        }
    }
}

function stopPrompt() {
    prompt_stopped = true; // do not execute any more prompts
    prompt.stop();
}

// stops server (for upgrades/maintenance) without crashing everything
// This lets node terminate the program when all handles are complete
function stopServer() {
    console.log("\x1b[32mStopping server...\x1b[0m");
    (async function() {
        stopPrompt();
        for(var i in intv) {
            clearInterval(intv[i]);
            clearTimeout(intv[i]);
            delete intv[i];
        }

        await updateChatLogData(true);
        await clear_expired_sessions(true);

        for(var i in pages) {
            var mod = pages[i];
            if(mod.server_exit) {
                await mod.server_exit();
            }
        }

        for(var i in systems) {
            var sys = systems[i];
            if(sys.server_exit) {
                await sys.server_exit();
            }
        }

        server.close();
        wss.close();

        var count = process._getActiveHandles().length;
        console.log("Stopped server with " + count + " handles remaining.");
    })();
}