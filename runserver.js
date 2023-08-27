/*
**  Our World of Text
**  Est. May 1, 2016 as Your World of Text Node, and November 19, 2016 as Node World of Text
**  Reprogrammed September 17, 2017
**  Released October 8, 2017 as Our World of Text
**  This is the main file
*/

console.log("Starting up...");

const crypto      = require("crypto");
const fs          = require("fs");
const http        = require("http");
const https       = require("https");
const isIP        = require("net").isIP;
const nodemailer  = require("nodemailer");
const path        = require("path");
const pg          = require("pg");
const querystring = require("querystring");
const sql         = require("sqlite3");
const url         = require("url");
const util        = require("util");
const WebSocket   = require("ws");
const worker      = require("node:worker_threads");
const zip         = require("adm-zip");
const zlib        = require("zlib");

const bin_packet   = require("./backend/utils/bin_packet.js");
const utils        = require("./backend/utils/utils.js");
const templates    = require("./backend/utils/templates.js");
const rate_limiter = require("./backend/utils/rate_limiter.js");
const ipaddress    = require("./backend/utils/ipaddress.js");
const prompt       = require("./backend/utils/prompt.js");
const restrictions = require("./backend/utils/restrictions.js");

var trimHTML             = utils.trimHTML;
var create_date          = utils.create_date;
var san_nbr              = utils.san_nbr;
var san_dp               = utils.san_dp;
var checkURLParam        = utils.checkURLParam;
var removeLastSlash      = utils.removeLastSlash;
var parseCookie          = utils.parseCookie;
var ar_str_trim          = utils.ar_str_trim;
var ar_str_decodeURI     = utils.ar_str_decodeURI;
var http_time            = utils.http_time;
var encode_base64        = utils.encode_base64;
var decode_base64        = utils.decode_base64;
var process_error_arg    = utils.process_error_arg;
var tile_coord           = utils.tile_coord;
var uptime               = utils.uptime;
var compareNoCase        = utils.compareNoCase;
var resembles_int_number = utils.resembles_int_number;
var TerminalMessage      = utils.TerminalMessage;
var encodeCharProt       = utils.encodeCharProt;
var decodeCharProt       = utils.decodeCharProt;
var change_char_in_array = utils.change_char_in_array;
var html_tag_esc         = utils.html_tag_esc;
var parseAcceptEncoding  = utils.parseAcceptEncoding;
var dump_dir             = utils.dump_dir;
var arrayIsEntirely      = utils.arrayIsEntirely;
var normalizeCacheTile   = utils.normalizeCacheTile;
var checkDuplicateCookie = utils.checkDuplicateCookie;
var advancedSplit        = utils.advancedSplit;
var filterEdit           = utils.filterEdit;

var normalize_ipv6 = ipaddress.normalize_ipv6;
var ipv4_to_int    = ipaddress.ipv4_to_int;
var ipv6_to_int    = ipaddress.ipv6_to_int;
var ipv4_to_range  = ipaddress.ipv4_to_range;
var ipv6_to_range  = ipaddress.ipv6_to_range;
var is_cf_ipv4_int = ipaddress.is_cf_ipv4_int;
var is_cf_ipv6_int = ipaddress.is_cf_ipv6_int;

var DATA_PATH = "../nwotdata/";
var SETTINGS_PATH = DATA_PATH + "settings.json";

function initializeDirectoryStruct() {
	// create the data folder that stores all of the server's data
	if(!fs.existsSync(DATA_PATH)) {
		fs.mkdirSync(DATA_PATH, 0o777);
	}
	// initialize server configuration
	if(!fs.existsSync(SETTINGS_PATH)) {
		fs.writeFileSync(SETTINGS_PATH, fs.readFileSync("./settings_example.json"));
		console.log("Created the settings file at [" + SETTINGS_PATH + "]. You must configure the settings file and then start the server back up again.");
		console.log("Full path of settings: " + path.resolve(SETTINGS_PATH));
		sendProcMsg("EXIT");
		process.exit();
	}
}
initializeDirectoryStruct();

const settings = require(SETTINGS_PATH);

var serverPort     = settings.port;
var serverDB       = settings.paths.database;
var editsDB        = settings.paths.edits;
var chatDB         = settings.paths.chat_history;
var imageDB        = settings.paths.images;
var miscDB         = settings.paths.misc;
var staticNumsPath = settings.paths.static_shortcuts;
var restrPath      = settings.paths.restr;
var restrCg1Path   = settings.paths.restr_cg1;
var accountSystem  = settings.account_system; // "uvias" or "local"

var loginPath = "/accounts/login/";
var logoutPath = "/accounts/logout/";
var registerPath = "/accounts/register/";
var profilePath = "/accounts/profile/";

if(accountSystem != "uvias" && accountSystem != "local") {
	console.log("ERROR: Invalid account system: " + accountSystem);
	sendProcMsg("EXIT");
	process.exit();
}

Error.stackTraceLimit = 1024;
var gzipEnabled = false;
var shellEnabled = true;

var isTestServer = false;
var debugLogging = false;
var testUviasIds = false;
var serverLoaded = false;
var isStopping = false;

var valid_subdomains = []; // e.g. ["test"]
var closed_client_limit = 1000 * 60 * 20; // 20 min
var ws_req_per_second = 1000;
var pw_encryption = "sha512WithRSAEncryption";

var wss; // websocket handler
var monitorWorker;
var clientVersion = "";
var pgConn; // postgreSQL connection for Uvias
var intv = {}; // intervals and timeouts
var pluginMgr = null;

// Global
CONST = {};
CONST.tileCols = 16;
CONST.tileRows = 8;
CONST.tileArea = CONST.tileCols * CONST.tileRows;

// tile cache for fetching and updating
// 3 levels: world_id -> tile_y -> tile_x
var memTileCache = {};

var ranks_cache = { users: {} };
var announcement_cache = "";
var restr_cache = "";
var restr_cg1_cache = "";
var worldData = {};
var client_cursor_pos = {};
var client_ips = {};
var ip_address_conn_limit = {}; // {ip: count}
var ip_address_req_limit = {}; // {ip: ws_limits} // TODO: Cleanup objects

console.log("Loaded libs");

function loadPlugin(reload) {
	if(!reload) {
		if(pluginMgr !== null) {
			return pluginMgr;
		}
	}
	try {
		var pluginPath = DATA_PATH + "plugin.js";
		var modPath = require.resolve(pluginPath);
		delete require.cache[modPath];
		pluginMgr = require(pluginPath);
	} catch(e) {
		pluginMgr = {};
	}
	return pluginMgr;
}

function loadShellFile() {
	var file = null;
	try {
		file = fs.readFileSync(DATA_PATH + "shell.js");
	} catch(e) {
		file = null;
	}
	if(file) {
		file = file.toString("utf8");
	}
	return file;
}

function getClientVersion() {
	return clientVersion;
}
function setClientVersion(ver) {
	if(clientVersion === ver) return false;
	if(ver) {
		clientVersion = ver;
	} else {
		clientVersion = "";
	}
	return true;
}

// temporary solution - TODO: make more secure
var csrfkeys = [Math.floor(Date.now() / 86400000).toString(), crypto.randomBytes(8)];
function createCSRF(userid, kclass) {
	var csrftoken = crypto.createHmac("sha1", csrfkeys[kclass]).update(userid.toString()).digest("hex").toLowerCase();
	return csrftoken;
}
function checkCSRF(token, userid, kclass) {
	if(typeof token != "string" || !token) return false;
	return token.toLowerCase() == createCSRF(userid, kclass);
}

function handle_error(e, doLog) {
	var str = JSON.stringify(process_error_arg(e));
	log_error(str);
	if(isTestServer || doLog) {
		console.log("Error:", str);
	}
}

process.argv.forEach(function(a) {
	if(a == "--test-server") {
		if(!isTestServer) console.log("\x1b[31;1mThis is a test server\x1b[0m");
		isTestServer = true;
	}
	if(a == "--log") {
		if(!debugLogging) console.log("\x1b[31;1mDebug logging enabled\x1b[0m");
		debugLogging = true;
	}
	if(a == "--uvias-test-info") {
		testUviasIds = true;
	}
	if(a == "--lt") {
		if(!isTestServer) console.log("\x1b[31;1mThis is a test server\x1b[0m");
		isTestServer = true;
		if(!debugLogging) console.log("\x1b[31;1mDebug logging enabled\x1b[0m");
		debugLogging = true;
		testUviasIds = true;
	}
});

async function runShellScript(includeColors) {
	var shellFile = loadShellFile();
	if(shellFile == null) {
		return "ERR: File does not exist";
	}
	var getFunc = null;
	var shellCont = {};
	try {
		getFunc = eval("(function(shell) {\n" + shellFile + "\n})(shellCont);");
	} catch(e) {
		return "ERR: Load: \n" + util.inspect(e, { colors: includeColors });
	}
	var mainFunc = shellCont.main;
	if(!mainFunc) {
		return "ERR: main function not found";
	}
	var resp = "<No response>";
	try {
		resp = await mainFunc();
	} catch(e) {
		return "ERR: Run: \n" + util.inspect(e, { colors: includeColors });
	}
	if(typeof resp != "string" && typeof resp != "number" && typeof resp != "bigint") {
		resp = util.inspect(resp, { colors: includeColors });
	} else {
		resp += "";
	}
	return resp;
}

function makePgClient() {
	pgConn = new pg.Client({
		connectionString: "pg://"
	});
	console.log("Postgres client connected");
	pgConn.on("end", function() {
		console.log("WARNING: Postgres client is closed");
		if(isStopping) return;
		setTimeout(uvias_init, 1000 * 2);
	});
	pgConn.on("error", function(err) {
		console.log("ERROR: Postgres client received an error:");
		console.log(err);
	});
}
if(accountSystem == "uvias") {
	pg.defaults.user = settings.pg_db.user || "owot";
	pg.defaults.host = settings.pg_db.host || "/var/run/postgresql";
	pg.defaults.database = settings.pg_db.database || "uvias";
}

var uvias = {};

uvias.all = async function(query, data) {
	if(data != void 0 && !Array.isArray(data)) data = [data];
	var result = await pgConn.query(query, data);
	return result.rows;
}

uvias.get = async function(query, data) {
	if(data != void 0 && !Array.isArray(data)) data = [data];
	var result = await pgConn.query(query, data);
	return result.rows[0];
}

uvias.run = async function(query, data) {
	if(data != void 0 && !Array.isArray(data)) data = [data];
	await pgConn.query(query, data);
}

if(testUviasIds) {
	uvias.id = "owottest";
	uvias.name = "Our World Of Text Test Server";
	uvias.domain = "test.ourworldoftext.com";
	uvias.private = true;
	uvias.only_verified = false;
	uvias.custom_css_file_path = settings.paths.uvias_css;
} else {
	uvias.id = "owot";
	uvias.name = "Our World Of Text";
	uvias.domain = "ourworldoftext.com";
	uvias.private = false;
	uvias.only_verified = false;
	uvias.custom_css_file_path = settings.paths.uvias_css;
}

if(uvias.custom_css_file_path) {
	uvias.custom_css_file_path = path.resolve(uvias.custom_css_file_path);
}

uvias.sso = "/accounts/sso";
// redirect to /accounts/logout/ to clear token cookie
uvias.logout = "/accounts/logout/?return=" + "/home/";
uvias.address = "https://uvias.com";
uvias.loginPath = uvias.address + "/api/loginto/" + uvias.id;
uvias.logoutPath = uvias.address + "/logoff?service=" + uvias.id;
uvias.registerPath = uvias.address + "/api/loginto/" + uvias.id + "#create";
uvias.profilePath = uvias.address + "/profile/@me";
if(accountSystem == "uvias") {
	loginPath = uvias.loginPath;
	logoutPath = uvias.logoutPath;
	registerPath = uvias.registerPath;
	profilePath = uvias.profilePath;
}

function toHex64(n) {
	var a = new BigUint64Array(1);
	a[0] = BigInt(n);
	return a[0].toString(16);
}

function toInt64(n) {
	var a = new BigInt64Array(1);
	a[0] = BigInt("0x" + n);
	return a[0];
}

if(isTestServer) {
	serverPort = settings.test_port;
}

function log_error(err) {
	if(settings.error_log) {
		try {
			err = JSON.stringify(err);
			err = "TIME: " + Date.now() + "\r\n" + err + "\r\n" + "-".repeat(20) + "\r\n\r\n\r\n";
			fs.appendFileSync(settings.paths.log, err);
		} catch(e) {
			console.log("Error logging error:", e);
		}
	}
}

var database,
	edits_db,
	chat_history,
	image_db,
	misc_db;
function setupDatabases() {
	database = new sql.Database(serverDB);
	edits_db = new sql.Database(editsDB);
	chat_history = new sql.Database(chatDB);
	image_db = new sql.Database(imageDB);
	misc_db = new sql.Database(miscDB);
}

var staticShortcuts = {};
function setupStaticShortcuts() {
	if(!staticNumsPath) return;
	var data;
	try {
		data = fs.readFileSync(staticNumsPath);
	} catch(e) {
		// static shortcuts don't exist
		return;
	}
	data = data.toString("utf8").replace(/\r\n/g, "\n").split("\n");
	for(var i = 0; i < data.length; i++) {
		var row = data[i].split("\t");
		var num = row[0];
		var path = row[1];
		if(!num || !path) continue;
		num = num.trim();
		path = path.trim();
		staticShortcuts[num] = path;
	}
}

var static_path = "./frontend/static/";
var static_path_web = "static/";

var template_data = {}; // data used by the server
var templates_path = "./frontend/templates/";

var static_data = {}; // return static server files

templates.registerFilter("plural", function(count, string) {
	if(!string) return "";
	if(count != 1) {
		if(string.endsWith("s")) {
			return string + "es";
		} else if(string.endsWith("y")) {
			return string.slice(0, -1) + "ies";
		} else {
			return string + "s";
		}
	}
	return string;
});

function load_static() {
	for(var i in template_data) {
		delete template_data[i];
	}
	for(var i in static_data) {
		delete static_data[i];
	}
	
	console.log("Loading static files...");
	dump_dir(static_data, static_path, static_path_web, false, true);

	console.log("Loading HTML templates...");
	dump_dir(template_data, templates_path, "", false, true);

	console.log("Compiling HTML templates...");
	for(var i in template_data) {
		template_data[i] = templates.compile(template_data[i]);
		templates.addFile(i, template_data[i]);
	}
}

var sql_table_init = "./backend/default.sql";
var sql_indexes_init = "./backend/indexes.sql";
var sql_edits_init = "./backend/edits.sql";

var zip_file;
function setupZipLog() {
	if(!fs.existsSync(settings.paths.zip_log)) {
		zip_file = new zip();
	} else {
		zip_file = new zip(settings.paths.zip_log);
	}
	console.log("Handling previous error logs (if any)");
	if(fs.existsSync(settings.paths.log)) {
		var file = fs.readFileSync(settings.paths.log);
		if(file.length > 0) {
			var log_data = fs.readFileSync(settings.paths.log);
			zip_file.addFile("NWOT_LOG_" + Date.now() + ".txt", log_data, "", 0o644);
			fs.truncateSync(settings.paths.log);
		}
	}
	zip_file.writeZip(settings.paths.zip_log);
}

console.log("Loading page files");

var pages = {
	accounts: {
		configure: require("./backend/pages/accounts/configure.js"),
		download: require("./backend/pages/accounts/download.js"),
		login: require("./backend/pages/accounts/login.js"),
		logout: require("./backend/pages/accounts/logout.js"),
		member_autocomplete: require("./backend/pages/accounts/member_autocomplete.js"),
		nsfw: require("./backend/pages/accounts/nsfw.js"),
		password_change: require("./backend/pages/accounts/password_change.js"),
		password_change_done: require("./backend/pages/accounts/password_change_done.js"),
		private: require("./backend/pages/accounts/private.js"),
		profile: require("./backend/pages/accounts/profile.js"),
		register: require("./backend/pages/accounts/register.js"),
		register_complete: require("./backend/pages/accounts/register_complete.js"),
		sso: require("./backend/pages/accounts/sso.js"),
		tabular: require("./backend/pages/accounts/tabular.js"),
		verify: require("./backend/pages/accounts/verify.js"),
		verify_email: require("./backend/pages/accounts/verify_email.js")
	},
	admin: {
		administrator: require("./backend/pages/admin/administrator.js"),
		backgrounds: require("./backend/pages/admin/backgrounds.js"),
		manage_ranks: require("./backend/pages/admin/manage_ranks.js"),
		set_custom_rank: require("./backend/pages/admin/set_custom_rank.js"),
		user: require("./backend/pages/admin/user.js"),
		user_list: require("./backend/pages/admin/user_list.js"),
		users_by_id: require("./backend/pages/admin/users_by_id.js"),
		users_by_username: require("./backend/pages/admin/users_by_username.js"),
		restrictions: require("./backend/pages/admin/restrictions.js"),
		shell: require("./backend/pages/admin/shell.js")
	},
	other: {
		ipaddress: require("./backend/pages/other/ipaddress.js"),
		load_backgrounds: require("./backend/pages/other/load_backgrounds.js"),
		random_color: require("./backend/pages/other/random_color.js"),
		test: require("./backend/pages/other/test.js")
	},
	"404": require("./backend/pages/404.js"),
	activate_complete: require("./backend/pages/activate_complete.js"),
	coordlink: require("./backend/pages/coordlink.js"),
	home: require("./backend/pages/home.js"),
	protect: require("./backend/pages/protect.js"),
	protect_char: require("./backend/pages/protect_char.js"),
	register_failed: require("./backend/pages/register_failed.js"),
	script_edit: require("./backend/pages/script_edit.js"),
	script_manager: require("./backend/pages/script_manager.js"),
	script_view: require("./backend/pages/script_view.js"),
	static: require("./backend/pages/static.js"),
	unprotect: require("./backend/pages/unprotect.js"),
	unprotect_char: require("./backend/pages/unprotect_char.js"),
	urllink: require("./backend/pages/urllink.js"),
	world_props: require("./backend/pages/world_props.js"),
	world_style: require("./backend/pages/world_style.js"),
	yourworld: require("./backend/pages/yourworld.js")
};

var websockets = {
	chat: require("./backend/websockets/chat.js"),
	chathistory: require("./backend/websockets/chathistory.js"),
	clear_tile: require("./backend/websockets/clear_tile.js"),
	cmd: require("./backend/websockets/cmd.js"),
	cmd_opt: require("./backend/websockets/cmd_opt.js"),
	cursor: require("./backend/websockets/cursor.js"),
	fetch: require("./backend/websockets/fetch.js"),
	link: require("./backend/websockets/link.js"),
	protect: require("./backend/websockets/protect.js"),
	write: require("./backend/websockets/write.js"),
	config: require("./backend/websockets/config.js"),
	boundary: require("./backend/websockets/boundary.js")
};

var modules = {
	fetch_tiles: require("./backend/modules/fetch_tiles.js"),
	protect_areas: require("./backend/modules/protect_areas.js"),
	write_data: require("./backend/modules/write_data.js"),
	write_links: require("./backend/modules/write_links.js")
};

var subsystems = {
	chat_mgr: require("./backend/subsystems/chat_mgr.js"),
	tile_database: require("./backend/subsystems/tile_database.js"),
	tile_fetcher: require("./backend/subsystems/tile_fetcher.js"),
	world_mgr: require("./backend/subsystems/world_mgr.js")
};

var sanitizeWorldname = subsystems.world_mgr.sanitizeWorldname;
var modifyWorldProp = subsystems.world_mgr.modifyWorldProp;
var commitAllWorlds = subsystems.world_mgr.commitAllWorlds;
var releaseWorld = subsystems.world_mgr.releaseWorld;
var getOrCreateWorld = subsystems.world_mgr.getOrCreateWorld;
var fetchWorldMembershipsByUserId = subsystems.world_mgr.fetchWorldMembershipsByUserId;
var fetchOwnedWorldsByUserId = subsystems.world_mgr.fetchOwnedWorldsByUserId;
var revokeMembershipByWorldName = subsystems.world_mgr.revokeMembershipByWorldName;
var promoteMembershipByWorldName = subsystems.world_mgr.promoteMembershipByWorldName;
var claimWorldByName = subsystems.world_mgr.claimWorldByName;
var renameWorld = subsystems.world_mgr.renameWorld;
var canViewWorld = subsystems.world_mgr.canViewWorld;
var getWorldNameFromCacheById = subsystems.world_mgr.getWorldNameFromCacheById;

function asyncDbSystem(database) {
	const db = {
		// gets data from the database (only 1 row at a time)
		get: function(command, args) {
			if(args == void 0 || args == null) args = [];
			return new Promise(function(r, rej) {
				database.get(command, args, function(err, res) {
					if(err) {
						return rej({
							sqlite_error: process_error_arg(err),
							input: { command, args }
						});
					}
					r(res);
				});
			});
		},
		// runs a command (insert, update, etc...) and might return "lastID" if needed
		run: function(command, args) {
			if(args == void 0 || args == null) args = [];
			return new Promise(function(r, rej) {
				database.run(command, args, function(err, res) {
					if(err) {
						return rej({
							sqlite_error: process_error_arg(err),
							input: { command, args }
						});
					}
					var info = {
						lastID: this.lastID,
						changes: this.changes
					}
					r(info);
				});
			});
		},
		// gets multiple rows in one command
		all: function(command, args) {
			if(args == void 0 || args == null) args = [];
			return new Promise(function(r, rej) {
				database.all(command, args, function(err, res) {
					if(err) {
						return rej({
							sqlite_error: process_error_arg(err),
							input: { command, args }
						});
					}
					r(res);
				});
			});
		},
		// get multiple rows but execute a function for every row
		each: function(command, args, callbacks) {
			if(typeof args == "function") {
				callbacks = args;
				args = [];
			}
			var def = callbacks;
			var callback_error = false;
			var cb_err_desc = "callback_error";
			callbacks = function(e, data) {
				try {
					def(data);
				} catch(e) {
					callback_error = true;
					cb_err_desc = e;
				}
			}
			return new Promise(function(r, rej) {
				database.each(command, args, callbacks, function(err, res) {
					if(err) return rej({
						sqlite_error: process_error_arg(err),
						input: { command, args }
					});
					if(callback_error) return rej(cb_err_desc);
					r(res);
				});
			});
		},
		// like run, but executes the command as a SQL file
		// (no comments allowed, and must be semicolon separated)
		exec: function(command) {
			return new Promise(function(r, rej) {
				database.exec(command, function(err) {
					if(err) {
						return rej({
							sqlite_error: process_error_arg(err),
							input: { command }
						});
					}
					r(true);
				});
			});
		}
	};
	return db;
}

var db,
	db_edits,
	db_ch,
	db_img,
	db_misc
function loadDbSystems() {
	db = asyncDbSystem(database);
	db_edits = asyncDbSystem(edits_db);
	db_ch = asyncDbSystem(chat_history);
	db_img = asyncDbSystem(image_db);
	db_misc = asyncDbSystem(misc_db);
}

var transporter;
var email_available = true;

async function loadEmail() {
	if(!settings.email.enabled) return;
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
			await transporter.verify();
		}
	} catch(e) {
		handle_error(e);
		email_available = false;
		console.log("\x1b[31;1mEmail is disabled because the verification failed (credentials possibly incorrect)" + JSON.stringify(process_error_arg(e)) + "\x1b[0m");
	}
	if(email_available) {
		console.log("Logged into email");
	}
}

async function send_email(destination, subject, text) {
	var testEmailAddress = "test@localhost";
	if(accountSystem != "local") return;
	if(isTestServer || subject == testEmailAddress) {
		console.log("To:", destination);
		console.log("Subject:", subject);
		console.log("Body:", text);
		console.log("================");
		return null;
	}
	if(!email_available) return false;
	var options = {
		from: settings.email.display_email,
		to: destination,
		subject: subject,
		html: text
	}
	return new Promise(function(resolve) {
		transporter.sendMail(options, function(error, info) {
			if (error) {
				resolve("error");
			} else {
				resolve(info);
			}
		});
	});
}

async function fetchCloudflareIPs(ip_type) {
	if(ip_type == 4) {
		ip_type = "ips-v4";
	} else if(ip_type == 6) {
		ip_type = "ips-v6";
	} else {
		return null;
	}
	return new Promise(function(resolve) {
		https.get("https://www.cloudflare.com/" + ip_type, function(response) {
			var data = "";
			response.on("data", function(part) {
				data += part;
			});
			response.on("end", function() {
				resolve(data);
			});
		}).on("error", function() {
			resolve(null);
		});
	});
}

var valid_methods = ["GET", "POST", "HEAD", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"];
function valid_method(mtd) {
	return valid_methods.indexOf(mtd) > -1;
}

async function initialize_server() {
	console.log("Starting server...");

	setupDatabases();
	setupStaticShortcuts();
	load_static();
	setupZipLog();
	loadDbSystems();
	manage_https();
	setupHTTPServer();

	await initialize_misc_db();
	await initialize_ranks_db();
	await initialize_edits_db();
	await initialize_image_db();

	global_data.db = db;
	global_data.db_img = db_img;
	global_data.db_misc = db_misc;
	global_data.db_edits = db_edits;
	global_data.db_ch = db_ch;
	
	if(accountSystem == "uvias") {
		await uvias_init();
	}

	if(accountSystem == "local") {
		await loadEmail();
	}
	
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

		await db.exec(tables);
		await db.exec(indexes);

		init = true;
		if(accountSystem == "local") {
			account_prompt();
		} else if(accountSystem == "uvias") {
			account_prompt(true);
		}
	}
	if(!init) {
		start_server();
	}
}

function sendProcMsg(msg) {
	if(process.send) {
		process.send(msg);
	}
}

async function initialize_misc_db() {
	if(!await db_misc.get("SELECT name FROM sqlite_master WHERE type='table' AND name='properties'")) {
		await db_misc.run("CREATE TABLE 'properties' (key BLOB, value BLOB)");
	}
}

async function initialize_edits_db() {
	if(!await db_edits.get("SELECT name FROM sqlite_master WHERE type='table' AND name='edit'")) {
		await db_edits.exec(fs.readFileSync(sql_edits_init).toString());
	}
}

async function initialize_image_db() {
	if(!await db_img.get("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")) {
		await db_img.run("CREATE TABLE 'images' (id INTEGER NOT NULL PRIMARY KEY, name TEXT, date_created INTEGER, mime TEXT, data BLOB)");
	}
}

/*
	TODO: scrap this & rename to 'chat tag'
	proposed change:
	- global tags; world tags
*/
async function initialize_ranks_db() {
	if(!await db_misc.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ranks'")) {
		await db_misc.run("CREATE TABLE 'ranks' (id INTEGER, level INTEGER, name TEXT, props TEXT)");
		await db_misc.run("CREATE TABLE 'user_ranks' (userid INTEGER, rank INTEGER)");
		await db_misc.run("INSERT INTO properties VALUES(?, ?)", ["max_rank_id", 0]);
		await db_misc.run("INSERT INTO properties VALUES(?, ?)", ["rank_next_level", 4]);
	}
	if(!await db_misc.get("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_ranks'")) {
		await db_misc.run("CREATE TABLE 'admin_ranks' (id INTEGER, level INTEGER)");
	}
	var ranks = await db_misc.all("SELECT * FROM ranks");
	var user_ranks = await db_misc.all("SELECT * FROM user_ranks");
	ranks_cache.ids = [];
	for(var i = 0; i < ranks.length; i++) {
		var rank = ranks[i];
		
		var id = rank.id;
		var level = rank.level;
		var name = rank.name;
		var props = JSON.parse(rank.props);

		ranks_cache[id] = {
			id,
			level,
			name,
			chat_color: props.chat_color
		};
		ranks_cache.ids.push(id);
	}
	ranks_cache.count = ranks.length;
	for(var i = 0; i < user_ranks.length; i++) {
		var ur = user_ranks[i];
		ranks_cache.users[ur.userid] = ur.rank;
	}
}

function encryptHash(pass, salt) {
	if(!salt) {
		salt = crypto.randomBytes(10).toString("hex");
	}
	var hsh = crypto.createHmac(pw_encryption, salt).update(pass).digest("hex");
	var hash = pw_encryption + "$" + salt + "$" + hsh;
	return hash;
}

function checkHash(hash, pass) {
	if(typeof pass !== "string") return false;
	if(typeof hash !== "string") return false;
	hash = hash.split("$");
	if(hash.length !== 3) return false;
	return encryptHash(pass, hash[1]) === hash.join("$");
}

async function account_prompt(isUvias) {
	var question = "You've just installed the server,\nwhich means you don\'t have any superusers defined.\nWould you like to create one now? (yes/no): ";
	var resp = await prompt.ask(question);
	if(resp.toLowerCase() == "yes") {
		if(!isUvias) {
			var user = await prompt.ask("Username: ");
			user = user.trim();
			if(!user.length) {
				console.log("Username is too short.");
				return account_prompt(isUvias);
			}
			var pass1 = (await prompt.ask("Password: ", true)).trim();
			var pass2 = (await prompt.ask("Password (again): ", true)).trim();
			if(pass1 != pass2) {
				console.log("Your passwords didn't match.");
				return account_prompt(isUvias);
			}
			if(!pass1) {
				console.log("Your password is too short.");
				return account_prompt(isUvias);
			}
			var date = Date.now();
			var passHash = encryptHash(pass1);
			db.run("INSERT INTO auth_user VALUES(null, ?, '', ?, 1, 3, ?, ?)", [user, passHash, date, date]);
			console.log("Superuser created successfully.\n");
		} else {
			var user = await prompt.ask("Uvias Display Name: ");
			user = user.trim();
			if(!user.length) {
				console.log("Username is too short.");
				return account_prompt(isUvias);
			}
			var db_user = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", user);
			if(!db_user) {
				console.log("User not found.");
				return account_prompt(isUvias);
			}
			var uid = "x" + db_user.uid;
			await db_misc.run("INSERT INTO admin_ranks VALUES(?, ?)", [uid, 3]);
			console.log("Account successfully set as superuser.\n");
		}
		start_server();
	} else if(resp.toLowerCase() == "no") {
		start_server();
		return;
	} else {
		console.log("Please enter either \"yes\" or \"no\" (not case sensitive).");
		return account_prompt(isUvias);
	}
}

var prompt_stopped = false;
async function command_prompt() {
	var input = await prompt.ask(">> ");
	if(input == "stop") {
		return stopServer();
	}
	if(input == "res") {
		return stopServer(true);
	}
	if(input == "maint") {
		return stopServer(false, true);
	}
	if(input == "sta") {
		load_static();
		return command_prompt();
	}
	if(input == "help") {
		console.log("stop: close server\nres: restart\nmaint: maintenance mode\nsta: reload templates and static files");
		return command_prompt();
	}
	// REPL
	try {
		console.dir(eval(input), { colors: true });
	} catch(e) {
		console.dir(e, { colors: true });
	}
	if(prompt_stopped) return;
	command_prompt();
}

//Time in milliseconds
var ms = {
	millisecond: 1,
	second: 1000,
	minute: 60000,
	hour: 3600000,
	day: 86400000,
	week: 604800000,
	month: 2629746000,
	year: 31556952000,
	decade: 315569520000
};

var http_rate_limits = [ // function ; hold limit ; [method]
	[pages.accounts.login, 2],
	[pages.accounts.logout, 2],
	[pages.accounts.register, 1],
	[pages.accounts.profile, 2, "GET"],
	[pages.accounts.profile, 10, "POST"],
	[pages.accounts.configure, 2],
	[pages.accounts.member_autocomplete, 4],
	[pages.accounts.download, 2],
	[pages.accounts.tabular, 2],
	[pages.accounts.sso, 3],
	[pages.protect, 16],
	[pages.unprotect, 16],
	[pages.protect_char, 16],
	[pages.unprotect_char, 16],
	[pages.coordlink, 16],
	[pages.urllink, 16],
	[pages.yourworld, 16, "POST"],
	[pages.yourworld, 6, "GET"],
	[pages.world_style, 2],
	[pages.world_props, 2]
];

var http_req_holds = {}; // ip/identifier -> {"<index>": {holds: <number>, resp: [<promises>,...]},...}

function check_http_rate_limit(ip, func, method) {
	var idx = -1;
	var max = 0;
	for(var i = 0; i < http_rate_limits.length; i++) {
		var line = http_rate_limits[i];
		var lf = line[0]; // function
		var lc = line[1]; // number of requests at a time to process
		var lm = line[2]; // method (optional)
		if(lf != func) continue;
		if(lm && lm != method) continue;
		idx = i;
		max = lc;
		break;
	}
	if(idx == -1) return -1;
	if(!http_req_holds[ip]) {
		http_req_holds[ip] = {};
	}
	holdObj = http_req_holds[ip];
	if(!holdObj[idx]) {
		holdObj[idx] = {
			holds: 1,
			max,
			resp: []
		};
		return idx;
	}
	var obj = holdObj[idx];
	if(obj.holds >= max) {
		return new Promise(function(res) {
			obj.resp.push(res);
		});
	}
	obj.holds++;
	return idx;
}

function release_http_rate_limit(ip, rate_id) {
	var obj = http_req_holds[ip];
	if(!obj) return;
	var lim = obj[rate_id];
	if(!lim) return;
	lim.holds--;
	var diff = lim.max - lim.holds;
	if(lim.holds <= 0) { // failsafe
		diff = lim.resp.length;
		lim.holds = 0;
	}
	for(var i = 0; i < diff; i++) {
		var func = lim.resp[0];
		if(!func) continue;
		if(lim.holds < lim.max) {
			lim.holds++;
			func(rate_id);
			lim.resp.splice(0, 1);
		}
	}
	if(!lim.holds && !lim.resp.length) {
		delete obj[rate_id];
	}
}

// pathname or regexp ; function or redirect path ; [options]
var url_patterns = [];
var url_error_endpoints = {};
function registerEndpoint(pattern, router, opts) {
	// pathname or regexp ; function or redirect path ; [options]
	if(!opts) opts = {};

	if(typeof pattern == "string") {
		pattern = pattern.replace(/\./g, "\\.");
		pattern = pattern.replace(/\*/g, "(.*)");
		if(pattern.at(-1) != "$" && pattern.at(-1) != "/") {
			pattern += "[/]?$";
		}
		if(pattern.at(-1) == "/") {
			pattern += "$";
		}
		pattern = new RegExp("^" + pattern, "g");
	}

	url_patterns.push([pattern, router, opts]);
}
function registerErrorEndpoint(code, router) {
	url_error_endpoints[code] = router;
}

function createEndpoints() {
	registerEndpoint("favicon.ico", "/static/favicon.png", { no_login: true });
	registerEndpoint("robots.txt", "/static/robots.txt", { no_login: true });
	registerEndpoint("home", pages.home);
	registerEndpoint(".well-known/*", null);

	registerEndpoint("accounts/login", pages.accounts.login);
	registerEndpoint("accounts/logout", pages.accounts.logout);
	registerEndpoint("accounts/register", pages.accounts.register);
	registerEndpoint("accounts/profile$", "/accounts/profile/"); // ensure there is always an ending slash
	registerEndpoint("accounts/profile", pages.accounts.profile);
	registerEndpoint("accounts/private", pages.accounts.private);
	registerEndpoint("accounts/configure/*", pages.accounts.configure);
	registerEndpoint("accounts/member_autocomplete", pages.accounts.member_autocomplete);
	registerEndpoint("accounts/register/complete", pages.accounts.register_complete);
	registerEndpoint("accounts/verify/*", pages.accounts.verify);
	registerEndpoint("accounts/download/*", pages.accounts.download);
	registerEndpoint("accounts/password_change", pages.accounts.password_change);
	registerEndpoint("accounts/password_change/done", pages.accounts.password_change_done);
	registerEndpoint("accounts/nsfw/*", pages.accounts.nsfw);
	registerEndpoint("accounts/tabular", pages.accounts.tabular);
	registerEndpoint("accounts/verify_email/*", pages.accounts.verify_email);
	registerEndpoint("accounts/sso", pages.accounts.sso);

	registerEndpoint("ajax/protect", pages.protect);
	registerEndpoint("ajax/unprotect", pages.unprotect);
	registerEndpoint("ajax/protect/char", pages.protect_char);
	registerEndpoint("ajax/unprotect/char", pages.unprotect_char);
	registerEndpoint("ajax/coordlink", pages.coordlink);
	registerEndpoint("ajax/urllink", pages.urllink);

	registerEndpoint("administrator/", pages.admin.administrator);
	registerEndpoint("administrator/user/*", pages.admin.user);
	registerEndpoint("administrator/users/by_username/*", pages.admin.users_by_username);
	registerEndpoint("administrator/users/by_id/*", pages.admin.users_by_id);
	registerEndpoint("administrator/backgrounds", pages.admin.backgrounds, { binary_post_data: true });
	registerEndpoint("administrator/manage_ranks", pages.admin.manage_ranks);
	registerEndpoint("administrator/set_custom_rank/*", pages.admin.set_custom_rank);
	registerEndpoint("administrator/user_list", pages.admin.user_list);
	registerEndpoint("administrator/monitor/", (settings && settings.monitor && settings.monitor.redirect) ? settings.monitor.redirect : null);
	registerEndpoint("administrator/shell", pages.admin.shell);
	registerEndpoint("administrator/restrictions", pages.admin.restrictions, { binary_post_data: true });

	registerEndpoint("script_manager/", pages.script_manager);
	registerEndpoint("script_manager/edit/*", pages.script_edit);
	registerEndpoint("script_manager/view/*", pages.script_view);

	registerEndpoint("world_style", pages.world_style);
	registerEndpoint("world_props", pages.world_props);

	registerEndpoint("other/random_color", pages.other.random_color, { no_login: true });
	registerEndpoint("other/backgrounds/*", pages.other.load_backgrounds, { no_login: true });
	registerEndpoint("other/test/*", pages.other.test, { no_login: true });
	registerEndpoint("other/ipaddress", pages.other.ipaddress);

	registerEndpoint("static/*", pages.static, { no_login: true });
	registerEndpoint("static", pages.static, { no_login: true });

	registerEndpoint(/^([\w\/\.\-\~]*)$/g, pages.yourworld, { remove_end_slash: true });

	registerErrorEndpoint(404, pages["404"]);
	registerErrorEndpoint(500, pages["500"]);
}

/*
	redirect the page's processing to that of another page
	EG: return callPage("404", { extra parameters for page }, req, write, server, ctx, "POST")
	EG: return callPage("accounts/login", { extra parameters for page }, req, write, server, ctx)
*/
async function callPage(page, params, req, write, server, ctx, method) {
	if(!method || !valid_method(method)) {
		method = "GET";
	}
	method = method.toUpperCase();
	if(!params) {
		params = {};
	}
	if(!server) {
		server = {};
	}
	var pageObj = pages;
	page = page.split("/");
	for(var i = 0; i < page.length; i++) {
		pageObj = pageObj[page[i]];
	}
	await pageObj[method](req, write, server, ctx, params);
}

// transfer all values from one object to a main object containing all imports
function objIncludes(defaultObj, include) {
	var new_obj = {};
	for(var i in defaultObj) {
		new_obj[i] = defaultObj[i];
	}
	for(var i in include) {
		new_obj[i] = include[i];
	}
	return new_obj;
}

// wait for the client to upload form data to the server
function wait_response_data(req, dispatch, binary_post_data, raise_limit) {
	var sizeLimit = 1000000;
	if(raise_limit) sizeLimit = 100000000;
	var queryData;
	if(binary_post_data) {
		queryData = Buffer.from([]);
	} else {
		queryData = "";
	}
	var error = false;
	if(req.aborted) { // request aborted before we could insert our listeners
		return null;
	}
	return new Promise(function(resolve) {
		req.on("data", function(data) {
			if(error) return;
			try {
				if(binary_post_data) {
					queryData = Buffer.concat([queryData, data]);
					periodHTTPInboundBytes += data.length;
				} else {
					queryData += data;
					periodHTTPInboundBytes += Buffer.byteLength(data);
				}
				if (queryData.length > sizeLimit) { // hard limit
					if(binary_post_data) {
						queryData = Buffer.from([]);
					} else {
						queryData = "";
					}
					dispatch("Payload too large", 413);
					error = true;
					resolve(null);
				}
			} catch(e) {
				handle_error(e);
			}
		});
		req.on("end", function() {
			if(error) return;
			try {
				if(binary_post_data) {
					resolve(queryData);
				} else {
					resolve(querystring.parse(queryData, null, null, { maxKeys: 256 }));
				}
			} catch(e) {
				resolve(null);
			}
		});
	});
}

function new_token(len) {
	var token = crypto.randomBytes(len).toString("hex");
	return token;
}

var https_reference = https;
var createHTTPServer = http.createServer;
var https_disabled = false;

var options = {};

function manage_https() {
	var private_key = settings.ssl.private_key;
	var cert = settings.ssl.cert;
	var chain = settings.ssl.chain;

	if(settings.ssl_enabled) {
		// check if paths exist
		https_disabled = (!fs.existsSync(private_key) || !fs.existsSync(cert) || !fs.existsSync(chain));
	} else {
		https_disabled = true;
	}

	if(https_disabled) {
		console.log("\x1b[31;1mRunning server in HTTP mode\x1b[0m");
		http.createServer = function(opt, func) {
			return createHTTPServer(func);
		}
		https_reference = http;
	} else {
		console.log("\x1b[31;1mDetected HTTPS keys. Running server in HTTPS mode\x1b[0m");
		options = {
			key:  fs.readFileSync(private_key),
			cert: fs.readFileSync(cert),
			ca:   fs.readFileSync(chain)
		};
	}
}

// parse Uvias account token
function parseToken(token) {
	if(typeof token != "string") return false;
	token = token.split("|");
	if(token.length != 2) return false;
	var uid1 = token[0].toLowerCase();
	var sid2 = token[1];
	if(uid1.length < 1 || uid1.length > 16) return false;
	if(sid2.length < 1 || sid2.length > 24) return false;
	var alpha = "0123456789abcdef";
	for(var i = 0; i < uid1.length; i++) {
		if(alpha.indexOf(uid1.charAt(i)) == -1) return false;
	}
	var uid = toInt64(uid1).toString();
	var session_id = Buffer.from(sid2, "base64");
	if(session_id.length != 16) return false;
	return {
		uid,
		session_id
	};
}

// TODO: cache user data (only care about uvias)
async function get_user_info(cookies, is_websocket, dispatch) {
	/*
		User Levels:
		3: Superuser (Operator)
		2: Superuser
		1: Staff
		0: regular user
	*/
	var date = Date.now();
	var user = {
		authenticated: false,
		username: "",
		display_username: "",
		id: 0,
		csrftoken: null,
		operator: false,
		superuser: false,
		staff: false,
		is_active: false,
		scripts: [],
		session_key: "",
		email: "",
		uv_rank: 0
	};
	if(accountSystem == "local" && cookies.sessionid) {
		// user data from session
		var s_data = await db.get("SELECT * FROM auth_session WHERE session_key=?", cookies.sessionid);
		if(s_data) {
			user = JSON.parse(s_data.session_data);
			if(cookies.csrftoken == user.csrftoken) { // verify csrftoken
				user.authenticated = true;
				var userauth = (await db.get("SELECT level, is_active, email FROM auth_user WHERE id=?", user.id));
				var level = userauth.level;
				user.is_active = !!userauth.is_active;
				user.email = userauth.email;

				user.operator = level == 3;
				user.superuser = level == 2 || level == 3;
				user.staff = level == 1 || level == 2 || level == 3;

				if(user.staff && !is_websocket) {
					user.scripts = await db.all("SELECT * FROM scripts WHERE owner_id=? AND enabled=1", user.id);
				} else {
					user.scripts = [];
				}
			}
			user.session_key = s_data.session_key;
		}
	}

	if(accountSystem == "uvias" && cookies.token) {
		var parsed = await uvias.get("SELECT * FROM accounts.parse_token($1::text)", [cookies.token]);
		var success = false;
		var has_refreshed = false;
		if(parsed) {
			var uid = parsed.uid;
			var session_id = parsed.session_id;
			// check if this session id belongs to a user
			var session = await uvias.get("SELECT * FROM accounts.get_session($1::bigint, $2::bytea)", [uid, session_id]);
			if(session) {
				// both guests and users are included
				var user_account = await uvias.get("SELECT to_hex(uid) as uid, username, rank_id FROM accounts.users WHERE uid=$1::bigint", uid);
				if(user_account) {
					success = true;
					var session_expire = session.expires.getTime();
					var session_halfway = session_expire - (ms.day * 3.5);
					if(date >= session_halfway) { // refresh token if it is about to expire
						var ref_res = await uvias.get("SELECT * FROM accounts.refresh_session($1::bigint, $2::bytea)", [uid, session_id]);
						if(ref_res) {
							has_refreshed = true;
							var new_expiry_time = ref_res.new_expiry_time;
							var is_persistent = ref_res.is_persistent;
						}
					}
					// only users, not guests
					var links_local = await uvias.get("SELECT to_hex(uid) as uid, login_name, email, email_verified FROM accounts.links_local WHERE uid=$1::bigint", uid);
					user.authenticated = true;
					user.display_username = user_account.username;
					user.uv_rank = user_account.rank_id;
					if(links_local) {
						user.is_active = links_local.email_verified;
						user.email = links_local.email;
						user.username = links_local.login_name;
						user.id = "x" + links_local.uid;
					} else {
						user.username = user_account.username;
						user.id = "x" + user_account.uid;
					}

					// no data yet
					user.operator = false;
					user.superuser = false;
					user.staff = false;
					
					var rank_data = await db_misc.get("SELECT level FROM admin_ranks WHERE id=?", user.id);
					if(rank_data) {
						var level = rank_data.level;

						user.operator = level == 3;
						user.superuser = level == 2 || level == 3;
						user.staff = level == 1 || level == 2 || level == 3;
					}

					// TODO: might want to add a public script repository for OWOT and remove/change this
					if(user.staff && !is_websocket) {
						user.scripts = await db.all("SELECT * FROM scripts WHERE owner_id=? AND enabled=1", user.id);
					} else {
						user.scripts = [];
					}

					user.csrftoken = new_token(32);
					user.session_key = cookies.token;
				}
			}
		}
		/*if(!success) {
			// if the token is invalid, delete the cookie
			if(dispatch) {
				dispatch.addCookie("token=; expires=" + http_time(0) + "; path=/");
			}
		}*/
	}
	return user;
}

function checkHTTPRestr(list, ipVal, ipFam) {
	var resp = {
		siteAccess: false,
		siteAccessNote: null
	};
	if(!list) return resp;
	for(var i = 0; i < list.length; i++) {
		var item = list[i];

		var ip = item.ip;
		if(ip) {
			var riRange = ip[0];
			var riFam = ip[1];
			if(riFam != ipFam) continue;
			if(!(ipVal >= riRange[0] && ipVal <= riRange[1])) continue;
		} else {
			continue;
		}

		var type = item.type;
		var mode = item.mode;
		if(type == "daccess" && mode == "site") {
			var note = item.note;
			resp.siteAccessNote = note;
			resp.siteAccess = true;
		}
	}
	return resp;
}

process.on("unhandledRejection", function(reason) {
	console.log("Unhandled promise rejection!\n" + Date.now());
	console.log("Error:", reason);
});

var periodHTTPOutboundBytes = 0;
var periodHTTPInboundBytes = 0;
var periodWSOutboundBytes = 0;
var periodWSInboundBytes = 0;

var server,
	HTTPSockets,
	HTTPSocketID;
function setupHTTPServer() {
	server = https_reference.createServer(options, function(req, res) {
		var compCallbacks = [];
		var cbExecuted = false;
		process_request(req, res, compCallbacks).then(function() {
			cbExecuted = true;
			for(var i = 0; i < compCallbacks.length; i++) {
				var cb = compCallbacks[i];
				cb();
			}
		}).catch(function(e) {
			res.statusCode = 500;
			var err500Temp = "";
			try {
				err500Temp = templates.execute(templates.getFile("500.html"));
				if(cbExecuted) {
					console.log("An error has occurred while executing request callbacks");
				} else {
					for(var i = 0; i < compCallbacks.length; i++) {
						var cb = compCallbacks[i];
						cb();
					}
				}
				
			} catch(e) {
				err500Temp = "HTTP 500: An internal server error has occurred";
				handle_error(e);
			}
			res.end(err500Temp);
			handle_error(e); // writes error to error log
		});
	});
	
	HTTPSockets = {};
	HTTPSocketID = 0;
	server.on("connection", function(socket) {
		var sockID = HTTPSocketID++;
		HTTPSockets[sockID] = socket;
		socket.on("close", function() {
			delete HTTPSockets[sockID];
		});
	});
}

function setupMonitorServer() {
	if(typeof settings.monitor.port != "number") return;
	monitorWorker = new worker.Worker("./backend/monitor/monitor.js", {
		workerData: {
			port: settings.monitor.port,
			ip: settings.monitor.ip,
			user: settings.monitor.credentials.user,
			pass: settings.monitor.credentials.pass
		}
	});
	monitorWorker.on("error", function(e) {
		handle_error(e);
	});
}

function parseHostname(hostname) {
	if(!hostname) hostname = "ourworldoftext.com";
	hostname = hostname.slice(0, 1000);
	var subdomains = !isIP(hostname) ? hostname.split(".").reverse() : [hostname];
	var sub = subdomains.slice(2);
	for(var i = 0; i < sub.length; i++) sub[i] = sub[i].toLowerCase();
	return sub;
}

function createDispatcher(res, opts) {
	var encoding = opts.encoding;
	if(!encoding) encoding = [];
	var gzip = opts.gzip;
	
	var requestResolved = false;
	var requestStreaming = false;
	var requestEnded = false;
	var requestPromises = [];
	var cookiesToReturn = [];
	function dispatch(data, status_code, params) {
		if(requestResolved || requestEnded) return; // if request response is already sent
		if(!requestStreaming) {
			requestResolved = true;
		}
		/* params: {
			cookie: the cookie data
			mime: mime type (ex: text/plain)
			redirect: url to redirect to
			download_file: force browser to download this file as .txt. specifies its name
			headers: header data
		} (all optional)*/
		var info = {};
		if(!params) {
			params = {};
		}
		if(typeof params.cookie == "string") {
			cookiesToReturn.push(params.cookie);
		} else if(typeof params.cookie == "object") {
			cookiesToReturn = cookiesToReturn.concat(params.cookie);
		}
		if(cookiesToReturn.length == 1) {
			cookiesToReturn = cookiesToReturn[0];
		}
		if(cookiesToReturn.length > 0) {
			info["Set-Cookie"] = cookiesToReturn;
		}
		if(params.download_file) {
			info["Content-disposition"] = "attachment; filename=" + params.download_file;
		}
		if(Math.floor(status_code / 100) * 100 == 300 || params.redirect !== void 0) { // 3xx status code
			if(params.redirect) {
				if(!status_code) {
					status_code = 302;
				}
				info.Location = params.redirect;
			}
		}
		if(params.mime) {
			info["Content-Type"] = params.mime;
		}
		if(params.headers) {
			for(var i in params.headers) {
				info[i] = params.headers[i];
			}
		}
		if(!status_code) {
			status_code = 200;
		}
		if(!data) {
			data = "";
		}
		if(gzip && (encoding.includes("gzip") || encoding.includes("*") && !requestStreaming)) {
			var doNotEncode = false;
			if(data.length < 1450) {
				doNotEncode = true;
			}
			if(typeof params.mime == "string") {
				if(params.mime.indexOf("text") == -1 && params.mime.indexOf("javascript") == -1 && params.mime.indexOf("json") == -1) {
					doNotEncode = true;
				}
			} else {
				doNotEncode = true;
			}
			if(!doNotEncode) {
				info["Content-Encoding"] = "gzip";
				data = zlib.gzipSync(data);
			}
		}
		if(!requestStreaming) info["Content-Length"] = Buffer.byteLength(data);
		res.writeHead(status_code, info);
		if(!requestStreaming) {
			res.write(data);
			res.end();
			periodHTTPOutboundBytes += data.length;
		}
	}
	res.on("close", function() {
		requestEnded = true;
		for(var i = 0; i < requestPromises.length; i++) {
			var prom = requestPromises[i];
			prom();
		}
	});
	dispatch.isResolved = function() {
		return requestResolved;
	}
	dispatch.addCookie = function(cookie) {
		cookiesToReturn.push(cookie);
	}
	dispatch.startStream = function() {
		requestStreaming = true;
	}
	dispatch.endStream = function() {
		if(requestResolved || requestEnded) return;
		requestResolved = true;
		res.end();
	}
	dispatch.writeStream = function(data) {
		if(requestResolved || requestEnded) return true;
		if(!requestStreaming) return false;
		return new Promise(function(resolve) {
			requestPromises.push(resolve);
			res.write(data, function() {
				var loc = requestPromises.indexOf(resolve);
				if(loc > -1) {
					requestPromises.splice(loc, 1);
				} else {
					return; // already resolved
				}
				resolve(requestResolved || requestEnded);
			});
			periodHTTPOutboundBytes += data.length;
		});
	}
	return dispatch;
}

async function process_request(req, res, compCallbacks) {
	if(!serverLoaded) return res.end("Server is not initialized");
	if(isStopping) return;

	var hostname = parseHostname(req.headers.host);

	var URLparse = url.parse(req.url);
	var URL = URLparse.pathname;
	if(URL.charAt(0) == "/") { URL = URL.slice(1); }
	try {
		URL = decodeURIComponent(URL);
	} catch (e) {};

	if(hostname.length == 1 && valid_subdomains.indexOf(hostname[0]) > -1) {
		URL = "other/" + hostname[0] + "/" + URL;
	}

	var acceptEncoding = parseAcceptEncoding(req.headers["accept-encoding"]);

	var realIp = req.headers["X-Real-IP"] || req.headers["x-real-ip"];
	var cfIp = req.headers["CF-Connecting-IP"] || req.headers["cf-connecting-ip"];
	var remIp = req.socket.remoteAddress;
	var evalIp = evaluateIpAddress(remIp, realIp, cfIp);
	var ipAddress = evalIp[0];
	var ipAddressFam = evalIp[1];
	var ipAddressVal = evalIp[2];

	var restr = restrictions.getRestrictions();
	var deniedPages = checkHTTPRestr(restr, ipAddressVal, ipAddressFam);
	if(deniedPages.siteAccess) {
		var deny_notes = "None";
		if(deniedPages.siteAccessNote) {
			deny_notes = deniedPages.siteAccessNote;
		}
		res.writeHead(403);
		return res.end(templates.execute(templates.getFile("denied.html"), {
			deny_notes
		}));
	}

	var dispatch = createDispatcher(res, {
		encoding: acceptEncoding,
		gzip: gzipEnabled
	});

	var page_aborted = false;

	async function processPage(handler, options) {
		if(!options) options = {};
		var no_login = options.no_login;
		var binary_post_data = options.binary_post_data;
		var remove_end_slash = options.remove_end_slash;

		if(handler == null) {
			dispatch("No route is available for this page", 404);
			return true;
		}
		if(typeof handler == "string") { // redirection
			dispatch(null, null, { redirect: handler });
			return true;
		}
		if(typeof handler != "object") { // not a valid page type
			return false;
		}
		if(req.aborted) {
			page_aborted = true;
			return;
		}
		var method = req.method.toUpperCase();
		var rate_id = await check_http_rate_limit(ipAddress, handler, method);
		if(rate_id != -1) { // release handle when this request finishes
			compCallbacks.push(function() {
				release_http_rate_limit(ipAddress, rate_id);
			});
		}
		var post_data = {};
		var query_data = querystring.parse(url.parse(req.url).query);
		var cookies = parseCookie(req.headers.cookie);
		var user;
		if(no_login) {
			user = {};
		} else {
			user = await get_user_info(cookies, false, dispatch);
			// check if user is logged in
			if(!cookies.csrftoken) {
				var token = new_token(32);
				var date = Date.now();
				// TODO: introduce only for forms
				dispatch.addCookie("csrftoken=" + token + "; expires=" + http_time(date + ms.year) + "; path=/;");
				user.csrftoken = token;
			} else {
				user.csrftoken = cookies.csrftoken;
			}
		}
		if(method == "POST") {
			var dat = await wait_response_data(req, dispatch, binary_post_data, user.superuser);
			if(dat) {
				post_data = dat;
			}
		}
		var URL_mod = URL; // modified url
		// remove end slash if enabled
		if(remove_end_slash) {
			URL_mod = removeLastSlash(URL_mod);
		}
		// return compiled HTML pages
		function render(path, data) {
			var template = templates.getFile(path);
			if(!template) { // template not found
				return "An unexpected error occurred while generating this page";
			}
			if(!data) {
				data = {};
			}
			data.user = user;
			data.loginPath = loginPath;
			data.logoutPath = logoutPath;
			data.registerPath = registerPath;
			data.profilePath = profilePath;
			data.accountSystem = accountSystem;
			var staticVersion = getClientVersion();
			if(staticVersion) {
				staticVersion = "?v=" + staticVersion;
			}
			data.staticVersion = staticVersion;
			return templates.execute(template, data);
		}
		var ctx = { // request-specific variables
			cookies,
			post_data,
			query_data,
			path: URL_mod,
			user,
			referer: req.headers.referer,
			render,
			ipAddress,
			ipAddressFam,
			ipAddressVal,
			setCallback: function(cb) {
				compCallbacks.push(cb);
			}
		};
		var pageStat;
		if(handler[method] && valid_method(method)) {
			// Return the page
			pageStat = await handler[method](req, dispatch, global_data, ctx, {});
		} else {
			dispatch("Method " + method + " not allowed.", 405);
		}
		if(!dispatch.isResolved()) return false;
		return true;
	}

	var page_resolved = false;
	for(var i in url_patterns) {
		var pattern = url_patterns[i];
		var urlReg = pattern[0];
		var pageRes = pattern[1];
		var options = pattern[2];

		if(!URL.match(urlReg)) {
			continue;
		}

		var status = await processPage(pageRes, options);
		if(status) {
			page_resolved = true;
		}
		break;
	}

	if(page_aborted) {
		return;
	}

	if(!dispatch.isResolved()) {
		var endpoint = url_error_endpoints["404"];
		if(endpoint) {
			var status = await processPage(endpoint, {});
			if(status) {
				page_resolved = true;
			}
		}
	}

	// the error page failed to render somehow
	if(!page_resolved) {
		return dispatch("HTTP 404: The resource cannot be found", 404);
	}
}

function loadString(type) {
	switch(type) {
		case "announcement":
			return announcement_cache;
		case "restr":
			return restr_cache;
		case "restr_cg1":
			return restr_cg1_cache;
	}
	return null;
}

function loadRestrictionsList() {
	try {
		restr_cache = fs.readFileSync(restrPath).toString("utf8");
	} catch(e) {};
	try {
		restr_cg1_cache = fs.readFileSync(restrCg1Path).toString("utf8");
	} catch(e) {};
	try {
		if(restr_cache) {
			var list = restr_cache.toString("utf8").replace(/\r\n/g, "\n").split("\n");
			var result = restrictions.procRest(list);
			restrictions.setRestrictions(result.data);
		}
		if(restr_cg1_cache) {
			var list = restr_cg1_cache.toString("utf8").replace(/\r\n/g, "\n").split("\n");
			var result = restrictions.procCoal(list);
			restrictions.setCoalition(result.data);
		}
	} catch(e) {
		handle_error(e);
	}
}

function saveRestrictions(type, data) {
	if(type == "main") {
		restr_cache = data;
		fs.writeFileSync(restrPath, data);
	} else if(type == "cg1") {
		restr_cg1_cache = data;
		fs.writeFileSync(restrCg1Path, data);
	}
}

async function loadAnnouncement() {
	announcement_cache = await db.get("SELECT value FROM server_info WHERE name='announcement'");
	if(!announcement_cache) {
		announcement_cache = "";
	} else {
		announcement_cache = announcement_cache.value;
	}
}

async function modifyAnnouncement(text) {
	if(!text) text = "";
	text += "";
	announcement_cache = text;

	var element = await db.get("SELECT value FROM server_info WHERE name='announcement'");
	if(!element) {
		await db.run("INSERT INTO server_info values('announcement', ?)", text);
	} else {
		await db.run("UPDATE server_info SET value=? WHERE name='announcement'", text);
	}
	ws_broadcast({
		kind: "announcement",
		text: text
	});
}

function getWorldData(worldId) {
	if(worldData[worldId]) return worldData[worldId];

	worldData[worldId] = {
		id_overflow_int: 10000,
		display_user_count: 0,
		user_count: 0
	};

	return worldData[worldId];
}
function generateClientId(world_id) {
	var worldObj = getWorldData(world_id);

	var rand_ids = client_ips[world_id];
	if(!rand_ids) rand_ids = {};

	// attempt to get a random id
	for(var i = 0; i < 64; i++) {
		var inclusive_id = Math.floor(Math.random() * ((9999 - 1) + 1)) + 1;
		if(!rand_ids[inclusive_id]) {
			return inclusive_id;
		}
	}
	// attempt to enumerate if it failed
	for(var i = 1; i <= 9999; i++) {
		if(!rand_ids[i]) {
			return i;
		}
	}
	return worldObj.id_overflow_int++;
}

function getUserCountFromWorld(worldId) {
	var counter = 0;
	wss.clients.forEach(function(ws) {
		if(!ws.sdata) return;
		if(!ws.sdata.userClient) return;
		if(ws.sdata.world.id == worldId) {
			counter++;
		}
	});
	return counter;
}

function topActiveWorlds(number) {
	var clientNumbers = [];
	for(var id in worldData) {
		var cnt = getUserCountFromWorld(id);
		if(cnt == 0) continue;
		clientNumbers.push([cnt, getWorldNameFromCacheById(id)]);
	}
	clientNumbers.sort(function(int1, int2) {
		return int2[0] - int1[0];
	});
	return clientNumbers.slice(0, number);
}

function broadcastUserCount() {
	for(var id in worldData) {
		var worldObj = worldData[id];
		var current_count = worldObj.display_user_count;
		var new_count = worldObj.user_count;
		if(current_count != new_count) {
			worldObj.display_user_count = new_count;
			ws_broadcast({
				source: "signal",
				kind: "user_count",
				count: new_count
			}, id, {
				isChat: true,
				clientId: 0
			});
		}
	}
}

async function clear_expired_sessions(no_timeout) {
	// clear expired sessions
	await db.run("DELETE FROM auth_session WHERE expire_date <= ?", Date.now());
	// clear expired registration keys
	await db.each("SELECT id FROM auth_user WHERE is_active=0 AND ? - date_joined >= ? AND (SELECT COUNT(*) FROM registration_registrationprofile WHERE user_id=auth_user.id) > 0",
		[Date.now(), ms.day * settings.activation_key_days_expire], async function(data) {
		var id = data.id;
		await db.run("DELETE FROM registration_registrationprofile WHERE user_id=?", id);
	});

	if(!no_timeout) intv.clearExpiredSessions = setTimeout(clear_expired_sessions, ms.minute);
}

function initClearClosedClientsInterval() {
	intv.clear_closed_clients = setInterval(function() {
		var curTime = Date.now();
		for(var w in client_ips) {
			var world = client_ips[w];
			for(var c in world) {
				var client = world[c];
				if(client[2] && client[1] > -1 && client[1] + closed_client_limit <= curTime) {
					delete world[c];
				}
			}
			var keys = Object.keys(world);
			if(keys.length == 0) {
				delete client_ips[w];
			}
		}
	}, 1000 * 60 * 2); // 2 minutes
}

// ping clients every 30 seconds
function initWebsocketPingInterval() {
	intv.ping_clients = setInterval(function() {
		if(!wss) return;
		wss.clients.forEach(function(ws) {
			if(ws.readyState != WebSocket.OPEN) return;
			try {
				ws.ping();
			} catch(e) {
				handle_error(e);
			}
		});
	}, 1000 * 30);
}

async function uviasSendIdentifier() {
	await uvias.run("SELECT accounts.set_service_info($1::text, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::boolean, $8::boolean, $9::text);",
		[uvias.id, uvias.name, uvias.domain, uvias.sso, uvias.logout, process.pid, uvias.private, uvias.only_verified, uvias.custom_css_file_path]);
	console.log("Sent service identifier");
}

async function uvias_init() {
	makePgClient();

	console.log("Connecting to account database...");
	try {
		await pgConn.connect();
	} catch(e) {
		handle_error(e);
		// the connection failed - stop right there and wait for the connection to reload
		return;
	}
	await uviasSendIdentifier();

	await uvias.run("LISTEN uv_kick");
	await uvias.run("LISTEN uv_sess_renew");
	await uvias.run("LISTEN uv_rep_upd");
	await uvias.run("LISTEN uv_user_upd");
	await uvias.run("LISTEN uv_user_del");
	await uvias.run("LISTEN uv_service");
	await uvias.run("LISTEN uv_rank_upd");

	pgConn.on("notification", async function(notif) {
		var channel = notif.channel;
		var data;
		try {
			data = JSON.parse(notif.payload);
		} catch(e) {
			console.log("Malformed data:", notif.payload);
			return;
		}
		switch(channel) {
			case "uv_kick":
				invalidateWebsocketSession(data.session);
				if(debugLogging) console.log("Signal uv_kick. Session '" + data.session + "', Reason '" + data.reason + "'");
				break;
			case "uv_sess_renew":
				if(debugLogging) console.log("Signal uv_sess_renew. Session '" + data.session + "'");
				break;
			case "uv_rep_upd":
				if(debugLogging) console.log("Signal uv_rep_upd. UID 'x" + toHex64(toInt64(data.uid)) + "'");
				break;
			case "uv_user_upd":
				if(debugLogging) console.log("Signal uv_user_upd. UID 'x" + toHex64(toInt64(data.uid)) + "'");
				break;
			case "uv_user_del":
				if(debugLogging) console.log("Signal uv_user_del. UID 'x" + toHex64(toInt64(data.uid)) + "'");
				break;
			case "uv_service":
				if(debugLogging) console.log("Signal uv_service. ID '" + data.id + "'");
				if(data.id == "uvias") {
					await uviasSendIdentifier();
				}
				break;
			case "uv_rank_upd":
				if(debugLogging) console.log("Signal uv_rank_upd. ID '" + data.id + "'");
				break;
		}
	});
}

function wsSend(socket, data) {
	if(socket.readyState !== WebSocket.OPEN) return;
	var error = false;
	socket.sdata.messageBackpressure++;
	try {
		socket.send(data, function() {
			if(!error && socket.sdata) {
				socket.sdata.messageBackpressure--;
			}
			error = true;
		});
	} catch(e) {
		if(!error && socket.sdata) {
			socket.sdata.messageBackpressure--;
		}
		error = true;
	}
}

function ws_broadcast(data, world_id, opts) {
	if(!wss) return; // this can only happen pre-initialization
	if(!opts) opts = {};
	data = JSON.stringify(data);
	wss.clients.forEach(function each(client) {
		if(!client.sdata) return;
		if(!client.sdata.userClient) return;
		if(client.readyState != WebSocket.OPEN) return;
		try {
			// world_id is optional - setting it to undefined will broadcast to all clients
			if(world_id == void 0 || client.sdata.world.id == world_id) {
				if(opts.isChat) {
					if(client.sdata.world.opts.noChatGlobal && opts.location == "global") return;
					var isOwner = client.sdata.world.ownerId == client.sdata.user.id;
					var isMember = !!client.sdata.world.members.map[client.sdata.user.id];
					var chatPerm = client.sdata.world.feature.chat;

					// 1: members only
					if(chatPerm == 1) if(!(isMember || isOwner)) return;
					// 2: owner only
					if(chatPerm == 2) if(!isOwner) return;
					// -1: unavailable to all
					if(chatPerm == -1) return;
					// check if user has blocked this client
					if(client.sdata.chat_blocks.block_all && opts.clientId != 0) return;
					if(client.sdata.chat_blocks.id.includes(opts.clientId)) return;
					if(opts.username && client.sdata.chat_blocks.user.includes(opts.username)) return;
					if(client.sdata.chat_blocks.no_anon && opts.username === null) return;
					if(client.sdata.chat_blocks.no_reg && opts.username !== null) return;
				}
				wsSend(client, data);
			}
		} catch(e) {
			handle_error(e);
		}
	});
}

function broadcastMonitorEvent(type, data) {
	if(!settings.monitor || !settings.monitor.enabled) return;
	try {
		if(type == "raw") {
			monitorWorker.postMessage(data);
		} else {
			monitorWorker.postMessage("[" + type + "] " + data);
		}
	} catch(e) {}
}

// todo: fix this
function evaluateIpAddress(remIp, realIp, cfIp) {
	var ipAddress = remIp;
	var ipAddressFam = 4;
	var ipAddressVal = 1;
	if(!ipAddress) { // ipv4
		ipAddress = "0.0.0.0";
	} else {
		if(ipAddress.indexOf(".") > -1) { // ipv4
			ipAddress = ipAddress.split(":").slice(-1);
			ipAddress = ipAddress[0];
			ipAddressVal = ipv4_to_int(ipAddress);
		} else { // ipv6
			ipAddressFam = 6;
			ipAddress = normalize_ipv6(ipAddress);
			ipAddressVal = ipv6_to_int(ipAddress);
		}
	}

	if(ipAddress == "127.0.0.1" && realIp) {
		ipAddress = realIp;
		if(ipAddress.indexOf(".") > -1) {
			ipAddressFam = 4;
		} else {
			ipAddressFam = 6;
			ipAddress = normalize_ipv6(ipAddress);
		}
		if(ipAddressFam == 4) {
			ipAddressVal = ipv4_to_int(ipAddress);
			if(is_cf_ipv4_int(ipAddressVal)) {
				ipAddress = cfIp;
				if(!ipAddress) {
					ipAddress = "0.0.0.0";
				}
				if(ipAddress.indexOf(".") > -1) {
					ipAddressFam = 4;
					ipAddressVal = ipv4_to_int(ipAddress);
				} else {
					ipAddressFam = 6;
					ipAddress = normalize_ipv6(ipAddress);
					ipAddressVal = ipv6_to_int(ipAddress);
				}
			}
		} else if(ipAddressFam == 6) {
			ipAddressVal = ipv6_to_int(ipAddress);
			if(is_cf_ipv6_int(ipAddressVal)) {
				ipAddress = cfIp;
				if(!ipAddress) {
					ipAddress = "0.0.0.0";
				}
				if(ipAddress.indexOf(".") > -1) {
					ipAddressFam = 4;
					ipAddressVal = ipv4_to_int(ipAddress);
				} else {
					ipAddressFam = 6;
					ipAddress = normalize_ipv6(ipAddress);
					ipAddressVal = ipv6_to_int(ipAddress);
				}
			}
		}
	}
	return [ipAddress, ipAddressFam, ipAddressVal];
}

var ws_limits = { // [amount per ip, per ms, minimum ms cooldown]
	chat:			[256, 1000, 0], // rate-limiting handled separately
	chathistory:	[4, 500, 0],
	clear_tile:		[1000, 1000, 0],
	cmd_opt:		[10, 1000, 0],
	cmd:			[256, 1000, 0],
	debug:			[10, 1000, 0],
	fetch:			[256, 1000, 0], // TODO: fetch rate limits
	link:			[400, 1000, 0], // TODO: fix link limits
	protect:		[400, 1000, 0],
	write:			[256, 1000, 0], // rate-limiting handled separately
	cursor:			[70, 1000, 0]
};

function can_process_req_kind(lims, kind) {
	if(!ws_limits[kind]) return true;
	var date = Date.now();
	var wlims = ws_limits[kind];
	var amount = wlims[0];
	var per_ms = wlims[1];
	var cooldn = wlims[2];
	if(!lims[kind]) lims[kind] = [0, Math.floor(date / per_ms), date % per_ms, 0];
	var curr_date = Math.floor((date - lims[kind][2]) / per_ms);
	if(cooldn && date - lims[kind][3] < cooldn) {
		return false;
	}
	if(lims[kind][1] == curr_date) {
		lims[kind][3] = date;
		return lims[kind][0]++ <= amount;
	}
	lims[kind][0] = 0;
	lims[kind][1] = curr_date;
	lims[kind][3] = date;
	return true;
}

function get_ip_kind_limits(ip) {
	if(ip_address_req_limit[ip]) {
		return ip_address_req_limit[ip];
	}
	var obj = {};
	ip_address_req_limit[ip] = obj;
	return obj;
}

var connections_per_ip = 50;
function can_connect_ip_address(ip) {
	if(!ip_address_conn_limit[ip] || !ip || ip == "0.0.0.0") return true;
	if(ip_address_conn_limit[ip] >= connections_per_ip) return false;
	return true;
}

function add_ip_address_connection(ip) {
	if(!ip) return;
	if(!(ip in ip_address_conn_limit)) ip_address_conn_limit[ip] = 0;
	ip_address_conn_limit[ip]++;
}

function remove_ip_address_connection(ip) {
	if(!ip) return;
	if(!ip_address_conn_limit[ip]) return; // undefined or 0
	ip_address_conn_limit[ip]--;
	if(!ip_address_conn_limit[ip]) delete ip_address_conn_limit[ip];
}

function invalidateWebsocketSession(session_token) {
	if(!session_token) return;
	wss.clients.forEach(function(ws) {
		if(!ws.sdata) return;
		if(ws.sdata.terminated) return;
		if(!ws.sdata.user) return;
		if(!ws.sdata.user.session_key) return; // safety layer: don't process unauthenticated clients
		if(ws.sdata.user.session_key != session_token) return;
		ws.sdata.terminated = true;
		ws.close();
	});
}

async function manageWebsocketConnection(ws, req) {
	if(isStopping || !serverLoaded) return ws.close();
	ws.sdata = {
		terminated: false,
		ipAddress: null,
		ipAddressFam: null,
		ipAddressVal: null,
		origin: req.headers["origin"],
		userClient: false,
		world: null,
		user: null,
		channel: null,
		clientId: null,
		keyQuery: null,
		hasBroadcastedCursorPosition: false,
		cursorPositionHidden: false,
		messageBackpressure: 0,
		receiveContentUpdates: true,
		descriptiveCmd: false,
		passiveCmd: false,
		handleCmdSockets: false,
		cmdsSentInSecond: 0,
		lastCmdSecond: 0,
		hide_user_count: false,
		chat_blocks: null,
		center: [0, 0],
		boundary: [0, 0, 0, 0],
		localFilter: true
	};

	var parsedURL = url.parse(req.url);
	var location = parsedURL.pathname;
	var search = querystring.parse(parsedURL.query);

	var bytesWritten = 0;
	var bytesRead = 0;
	
	// process ip address headers from cloudflare/nginx
	var realIp = req.headers["X-Real-IP"] || req.headers["x-real-ip"];
	var cfIp = req.headers["CF-Connecting-IP"] || req.headers["cf-connecting-ip"];
	var remIp = req.socket.remoteAddress;
	var evalIp = evaluateIpAddress(remIp, realIp, cfIp);
	ws.sdata.ipAddress = evalIp[0];
	ws.sdata.ipAddressFam = evalIp[1];
	ws.sdata.ipAddressVal = evalIp[2];

	// must be at the top before any async calls (errors may otherwise occur before the event declaration)
	ws.on("error", function(err) {
		handle_error(JSON.stringify(process_error_arg(err)));
	});

	// TODO: may not fire in all cases
	function updateNetworkStats() {
		var b_out = req.socket.bytesWritten;
		var b_in = req.socket.bytesRead;
		periodWSOutboundBytes += b_out - bytesWritten;
		periodWSInboundBytes += b_in - bytesRead;
		bytesWritten = b_out;
		bytesRead = b_in;
	}
	function send_ws(data) {
		wsSend(ws, data);
		updateNetworkStats();
	}
	function error_ws(errorCode, errorMsg) {
		send_ws(JSON.stringify({
			kind: "error",
			code: errorCode,
			message: errorMsg
		}));
		ws.close();
	}

	if(!can_connect_ip_address(ws.sdata.ipAddress)) {
		return error_ws("CONN_LIMIT", "Too many connections");
	}
	add_ip_address_connection(ws.sdata.ipAddress);
	var reqs_second = 0; // requests received at current second
	var current_second = Math.floor(Date.now() / 1000);
	function can_process_req() { // limit requests per second
		var compare_second = Math.floor(Date.now() / 1000);
		reqs_second++;
		if(compare_second == current_second) {
			if(reqs_second >= ws_req_per_second) {
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
	var kindLimits = get_ip_kind_limits(ws.sdata.ipAddress);

	if(typeof location != "string") {
		location = "/ws";
	}

	// remove last slash
	if(location.at(-1) == "/") location = location.slice(0, -1);
	// check for and remove "/ws" at the end
	if(location.toLowerCase().endsWith("/ws")) {
		location = location.slice(0, -3);
	} else {
		// path doesn't end with /ws or /ws/
		return error_ws("INVALID_ADDR", "Invalid address");
	}
	// remove initial slash
	if(location.at(0) == "/") location = location.slice(1);

	var pre_queue = [];
	// adds data to a queue. this must be before any async calls and the message event
	function pre_message(msg) {
		if(!can_process_req()) return;
		pre_queue.push(msg);
	}
	ws.on("message", pre_message);

	var world = null;
	var clientId = void 0;
	var worldObj = null;

	ws.on("close", function() {
		if(world) {
			releaseWorld(world);
		}
		remove_ip_address_connection(ws.sdata.ipAddress);
		ws.sdata.terminated = true;
		if(world && clientId != void 0) {
			if(client_ips[world.id] && client_ips[world.id][clientId]) {
				client_ips[world.id][clientId][2] = true;
				client_ips[world.id][clientId][1] = Date.now();
			}
		}
		if(worldObj && !ws.sdata.hide_user_count) {
			worldObj.user_count--;
		}
		if(world && ws.sdata.hasBroadcastedCursorPosition && !ws.sdata.cursorPositionHidden && ws.sdata.channel) {
			ws_broadcast({
				kind: "cursor",
				hidden: true,
				channel: ws.sdata.channel
			}, world.id);
			var channel = ws.sdata.channel;
			var worldId = world.id;
			if(client_cursor_pos[worldId]) {
				delete client_cursor_pos[worldId][channel];
				if(Object.keys(client_cursor_pos[worldId]).length == 0) {
					delete client_cursor_pos[worldId];
				}
			}
		}
		updateNetworkStats();
	});
	if(ws.sdata.terminated) return; // in the event of an immediate close

	var cookies = parseCookie(req.headers.cookie);
	var user = await get_user_info(cookies, true);
	if(ws.sdata.terminated) return;
	var channel = new_token(7);
	ws.sdata.channel = channel;

	var server = global_data;
	var ctx = {
		user, channel,
		keyQuery: search.key,
		world: null
	};

	if(search.hide == "1") {
		ws.sdata.hide_user_count = true;
	}

	world = await getOrCreateWorld(location);
	if(ws.sdata.terminated) return;
	if(!world) {
		return error_ws("NO_EXIST", "World does not exist");
	}

	var permission = await canViewWorld(world, user, {
		memKey: search.key
	});
	if(ws.sdata.terminated) return;
	if(!permission) {
		return error_ws("NO_PERM", "No permission");
	}

	ws.sdata.userClient = true; // client connection is now initialized
	ws.sdata.keyQuery = search.key;
	
	ctx.world = world;

	ws.sdata.world = world;
	ws.sdata.user = user;

	var chat_permission = world.feature.chat;
	var can_chat = chat_permission == 0 || (chat_permission == 1 && permission.member) || (chat_permission == 2 && permission.owner);

	worldObj = getWorldData(world.id);
	if(!ws.sdata.terminated && !ws.sdata.hide_user_count) {
		worldObj.user_count++;
	}

	var initial_user_count;
	if(can_chat) {
		initial_user_count = worldObj.user_count;
	}

	clientId = generateClientId(world.id);

	if(!client_ips[world.id]) {
		client_ips[world.id] = {};
	}
	client_ips[world.id][clientId] = [ws.sdata.ipAddress, -1, false, -1];
	// [Ip, Disconnect time, Is disconnected, Last chat time (on global)]

	ws.sdata.clientId = clientId;
	ws.sdata.chat_blocks = {
		id: [],
		user: [],
		no_tell: false,
		no_anon: false,
		no_reg: false,
		block_all: false
	};

	broadcastMonitorEvent("Connect", ws.sdata.ipAddress + ", [" + clientId + ", '" + channel + "'] connected to world ['" + world.name + "', " + world.id + "]");

	var sentClientId = clientId;
	if(!can_chat) sentClientId = -1;
	send_ws(JSON.stringify({
		kind: "channel",
		sender: channel,
		id: sentClientId,
		initial_user_count
	}));

	if(client_cursor_pos[world.id]) {
		var world_cursors = client_cursor_pos[world.id];
		for(var csr_channel in world_cursors) {
			var csr = world_cursors[csr_channel];
			if(csr.hidden) continue;
			var tileX = csr.tileX;
			var tileY = csr.tileY;
			var isCenter = -24 <= tileX && tileX <= 24 && -24 <= tileY && tileY <= 24;
			if(!isCenter) continue;
			send_ws(JSON.stringify({
				kind: "cursor",
				position: {
					tileX: csr.tileX,
					tileY: csr.tileY,
					charX: csr.charX,
					charY: csr.charY
				},
				channel: csr_channel
			}));
		}
	}

	ws.off("message", pre_message);
	ws.on("message", handle_message);
	async function handle_message(msg, isBinary) {
		if(!isBinary) {
			msg = msg.toString("utf8");
		}
		updateNetworkStats();
		if(!can_process_req()) return;
		if(!(typeof msg == "string" || typeof msg == "object")) {
			return;
		}
		if(msg.constructor == Buffer) { // TODO
			/*msg = bin_packet.decode(msg);
			if(!msg) return; // malformed packet*/
			return;
		}
		// Parse JSON message
		try {
			if(typeof msg == "string") msg = JSON.parse(msg);
		} catch(e) {
			return ws.close();
		}
		if(!msg || msg.constructor != Object) {
			return;
		}
		var kind = msg.kind;
		if(typeof kind != "string") return;
		kind = kind.toLowerCase();
		var requestID = null;
		if(typeof msg.request == "number") {
			requestID = san_nbr(msg.request);
		}
		if(kind == "ping") {
			var res = {
				kind: "ping",
				result: "pong"
			}
			if(msg.id != void 0) {
				res.id = san_nbr(msg.id);
			}
			return send_ws(JSON.stringify(res)); 
		}
		// Begin calling a websocket function for the necessary request
		if(!websockets.hasOwnProperty(kind)) {
			return;
		}
		if(!can_process_req_kind(kindLimits, kind)) return;
		function send(msg) {
			msg.kind = kind;
			if(requestID !== null) msg.request = requestID;
			send_ws(JSON.stringify(msg));
		}
		function broadcast(data, opts) {
			if(data.kind && data.kind != kind) {
				data.source = kind;
			}
			ws_broadcast(data, world.id, opts);
		}
		var res;
		var resError = false;
		try {
			res = await websockets[kind](ws, msg, send, broadcast, server, ctx);
		} catch(e) {
			resError = true;
			handle_error(e);
		}
		if(!resError && typeof res == "string") {
			send_ws(JSON.stringify({
				kind: "error",
				code: "PARAM",
				message: res
			}));
		}
	}
	// Some messages might have been received before the socket finished opening
	if(pre_queue.length > 0) {
		for(var p = 0; p < pre_queue.length; p++) {
			handle_message(pre_queue[p]);
			pre_queue.splice(p, 1);
			p--;
		}
	}
}

async function start_server() {
	await loadAnnouncement();
	loadRestrictionsList();
	
	if(accountSystem == "local") {
		await clear_expired_sessions();
	}

	intv.userCount = setInterval(function() {
		broadcastUserCount();
	}, 2000);

	intv.traff_mon_net_interval = setInterval(function() {
		if(periodHTTPOutboundBytes || periodHTTPInboundBytes) {
			broadcastMonitorEvent("Network", "HTTP stream: " + periodHTTPOutboundBytes + " (out); " + periodHTTPInboundBytes + " (in)");
			periodHTTPOutboundBytes = 0;
			periodHTTPInboundBytes = 0;
		}
		if(periodWSOutboundBytes || periodWSInboundBytes) {
			broadcastMonitorEvent("Network", "WebSocket: " + periodWSOutboundBytes + " (out); " + periodWSInboundBytes + " (in)");
			periodWSOutboundBytes = 0;
			periodWSInboundBytes = 0;
			wss.clients.forEach(function(ws) {
				if(!ws.sdata) return;
				if(ws.sdata.messageBackpressure > 1) {
					broadcastMonitorEvent("Backpressure", "Warning - backpressure of " + ws.sdata.messageBackpressure + " (" + ws.sdata.ipAddress + ")");
				}
			});
		}
	}, 1000);

	initClearClosedClientsInterval();

	// ping clients at a regular interval to ensure they dont disconnect constantly
	initWebsocketPingInterval();

	loadPlugin(true);
	createEndpoints();

	server.listen(serverPort, settings.ip, function() {
		var addr = server.address();

		console.log("\x1b[92;1mOWOT Server is running\x1b[0m");
		console.log("Address: " + addr.address);
		console.log("Port: " + addr.port);

		// start listening for commands
		command_prompt();
	});

	wss = new WebSocket.Server({
		server,
		perMessageDeflate: true,
		maxPayload: 128000
	});
	global_data.wss = wss;

	wss.on("connection", async function(ws, req) {
		try {
			manageWebsocketConnection(ws, req);
		} catch(e) {
			// failed to initialize
			handle_error(e);
		}
	});

	await sysLoad(); // initialize the subsystems (tile database; chat manager)
	serverLoaded = true;

	if(settings.monitor && settings.monitor.enabled) {
		setupMonitorServer();
	}
}

// the server context
var global_data = {
	website: settings.website,
	db: null,
	db_img: null,
	db_misc: null,
	db_edits: null,
	db_ch: null,
	wsSend,
	ws_broadcast,
	createCSRF,
	checkCSRF,
	memTileCache,
	isTestServer,
	shellEnabled,
	loadString,
	saveRestrictions,
	uvias,
	accountSystem,
	callPage,
	ms,
	checkHash,
	encryptHash,
	new_token,
	querystring,
	url,
	send_email,
	get_user_info,
	modules,
	announce: modifyAnnouncement,
	wss, // this is undefined by default, but will get a value once wss is initialized
	topActiveWorlds,
	handle_error,
	client_ips,
	tile_database: subsystems.tile_database,
	tile_fetcher: subsystems.tile_fetcher,
	chat_mgr: subsystems.chat_mgr,
	intv,
	ranks_cache,
	static_data,
	stopServer,
	broadcastMonitorEvent,
	uviasSendIdentifier,
	client_cursor_pos,
	loadShellFile,
	runShellScript,
	loadPlugin,
	rate_limiter,
	getClientVersion,
	setClientVersion,
	staticShortcuts
};

async function sysLoad() {
	// initialize variables in the subsystems
	for(var i in subsystems) {
		var sys = subsystems[i];
		await sys.main(global_data);
	}
}

function stopPrompt() {
	prompt_stopped = true; // do not execute any more prompts
	prompt.stop();
}

// systemctl
process.once("SIGTERM", function() {
	stopServer();
});
process.once("SIGINT", function() {
	stopServer();
});

// stops server (for upgrades/maintenance) without crashing everything
// This lets node terminate the program when all handles are complete
function stopServer(restart, maintenance) {
	if(isStopping) return;
	isStopping = true;
	console.log("\x1b[31;1mStopping server...\x1b[0m");
	if(!restart && !maintenance) {
		sendProcMsg("EXIT");
	}
	(async function() {
		stopPrompt();
		for(var i in intv) {
			clearInterval(intv[i]);
			clearTimeout(intv[i]);
			delete intv[i];
		}

		try {
			if(accountSystem == "local") {
				await clear_expired_sessions(true);
			}

			if(serverLoaded) {
				for(var i in pages) {
					var mod = pages[i];
					if(mod.server_exit) {
						await mod.server_exit();
					}
				}

				for(var i in subsystems) {
					var sys = subsystems[i];
					if(sys.server_exit) {
						await sys.server_exit();
					}
				}

				server.close();
				wss.close();

				for(var id in HTTPSockets) {
					HTTPSockets[id].destroy();
				}

				if(accountSystem == "uvias") {
					pgConn.end();
				}

				if(monitorWorker && settings.monitor && settings.monitor.enabled) {
					monitorWorker.terminate();
				}
			}
		} catch(e) {
			handle_error(e);
			if(!isTestServer) console.log(e);
		}
		var handles = process._getActiveHandles();

		for(var i = 0; i < handles.length; i++) {
			var handle = handles[i];
			var cons = "";
			if(handle && handle.constructor && handle.constructor.name) cons = handle.constructor.name;
			if(cons) {
				if(cons == "WriteStream") {
					process.stdout.write("- Write stream, FD: " + handle.fd + "\n");
				} else if(cons == "Server") {
					process.stdout.write("- Server, Key: " + handle._connectionKey + ", Connections: " + handle._connections + "\n");
				} else if(cons == "Socket") {
					process.stdout.write("- Socket, ");
					if(handle._peername) {
						process.stdout.write("Address: [" + handle._peername.address + "]:" + handle._peername.port + ", IP type: " + handle._peername.family);
					} else {
						if(handle.parser && handle.parser.constructor && handle.parser.constructor.name == "HTTPParser") {
							process.stdout.write("HTTP");
						} else {
							process.stdout.write("Unknown");
						}
					}
					process.stdout.write("\n");
				} else {
					process.stdout.write("- Other, Type: " + cons + "\n");
				}
			} else {
				console.log("- Unknown handle, Typeof " + (typeof handle));
			}
		}

		var count = handles.length;
		console.log("Stopped server with " + count + " handles remaining.");
		if(restart) {
			sendProcMsg("RESTART");
		} else if(maintenance) {
			sendProcMsg("PORT=" + serverPort);
			sendProcMsg("MAINT");
		}
	})();
}

// start the server
initialize_server().catch(function(e) {
	console.log("An error occurred during the initialization process:");
	console.log(e);
});
