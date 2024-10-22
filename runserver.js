/*
**  Our World of Text
**  Est. May 1, 2016 as Your World of Text Node, and November 19, 2016 as Node World of Text
**  Reprogrammed September 17, 2017
**  Released October 8, 2017 as Our World of Text
*/

console.log("Starting up...");

const crypto      = require("crypto");
const fs          = require("fs");
const http        = require("http");
const https       = require("https");
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

const bin_packet   = require("./backend/utils/bin_packet.js");
const utils        = require("./backend/utils/utils.js");
const rate_limiter = require("./backend/utils/rate_limiter.js");
const ipaddress    = require("./backend/framework/ipaddress.js");
const prompt       = require("./backend/utils/prompt.js");
const restrictions = require("./backend/utils/restrictions.js");
const frameUtils   = require("./backend/framework/utils.js");
const serverUtil   = require("./backend/framework/server.js");
const templates    = require("./backend/framework/templates.js");

var trimHTML             = utils.trimHTML;
var create_date          = utils.create_date;
var san_nbr              = utils.san_nbr;
var san_dp               = utils.san_dp;
var checkURLParam        = utils.checkURLParam;
var removeLastSlash      = utils.removeLastSlash;
var ar_str_trim          = utils.ar_str_trim;
var ar_str_decodeURI     = utils.ar_str_decodeURI;
var http_time            = utils.http_time;
var encode_base64        = utils.encode_base64;
var decode_base64        = utils.decode_base64;
var process_error_arg    = utils.process_error_arg;
var tile_coord           = utils.tile_coord;
var calculateTimeDiff    = utils.calculateTimeDiff;
var compareNoCase        = utils.compareNoCase;
var resembles_int_number = utils.resembles_int_number;
var TerminalMessage      = utils.TerminalMessage;
var encodeCharProt       = utils.encodeCharProt;
var decodeCharProt       = utils.decodeCharProt;
var change_char_in_array = utils.change_char_in_array;
var html_tag_esc         = utils.html_tag_esc;
var dump_dir             = utils.dump_dir;
var arrayIsEntirely      = utils.arrayIsEntirely;
var normalizeCacheTile   = utils.normalizeCacheTile;
var checkDuplicateCookie = utils.checkDuplicateCookie;
var advancedSplit        = utils.advancedSplit;
var filterEdit           = utils.filterEdit;
var toHex64              = utils.toHex64;
var toInt64              = utils.toInt64;

var parseCookie = frameUtils.parseCookie;

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
var serverDBPath   = settings.paths.database;
var editsDBPath    = settings.paths.edits;
var chatDBPath     = settings.paths.chat_history;
var imageDBPath    = settings.paths.images;
var miscDBPath     = settings.paths.misc;
var staticNumsPath = settings.paths.static_shortcuts;
var restrPath      = settings.paths.restr;
var restrCg1Path   = settings.paths.restr_cg1;
var accountSystem  = settings.account_system; // "uvias" or "local"

var loginPath = "/accounts/login/";
var logoutPath = "/accounts/logout/";
var registerPath = "/accounts/register/";
var profilePath = "/accounts/profile/";

var sql_table_init = "./backend/default.sql";
var sql_indexes_init = "./backend/indexes.sql";
var sql_edits_init = "./backend/edits.sql";

var serverSettings = {
	announcement: "",
	chatGlobalEnabled: "1"
};
var serverSettingsStatus = {};

if(accountSystem != "uvias" && accountSystem != "local") {
	console.log("ERROR: Invalid account system: " + accountSystem);
	sendProcMsg("EXIT");
	process.exit();
}

var shellEnabled = true;

var isTestServer = false;
var debugLogging = false;
var testUviasIds = false;
var serverLoaded = false;
var isStopping = false;

var closed_client_limit = 1000 * 60 * 20; // 20 min
var ws_req_per_second = 1000;
var pw_encryption = "sha512WithRSAEncryption";
var connections_per_ip = 50;
var static_path = "./frontend/static/";
var static_path_web = "static/";
var templates_path = "./frontend/templates/";

var httpServer;
var wss; // websocket handler
var uvias;
var monitorWorker;
var pgConn; // postgreSQL connection for Uvias
var intv = {}; // intervals and timeouts
var pluginMgr = null;
var serverStartTime = Date.now();
var transporter;
var email_available = true;
var prompt_stopped = false;
var db,
	db_edits,
	db_chat,
	db_img,
	db_misc;

// Global
CONST = {};
CONST.tileCols = 16;
CONST.tileRows = 8;
CONST.tileArea = CONST.tileCols * CONST.tileRows;

// tile cache for fetching and updating
// 3 levels: world_id -> tile_y -> tile_x
var memTileCache = {};

var clientVersion = "";
var ranks_cache = { users: {} };
var restr_cache = "";
var restr_cg1_cache = "";
var restr_update = null;
var restr_cg1_update = null;
var worldData = {};
var client_cursor_pos = {};
var client_ips = {};
var ip_address_conn_limit = {}; // {ip: count}
var ip_address_req_limit = {}; // {ip: ws_limits} // TODO: Cleanup objects
var staticShortcuts = {};
var template_data = {}; // data used by the server
var static_data = {}; // return static server files

console.log("Loaded libs");

function loadPlugin(reload) {
	if(!reload) {
		return pluginMgr;
	}
	try {
		var pluginPath = DATA_PATH + "plugin.js";
		if(!fs.existsSync(pluginPath)) {
			pluginMgr = {};
			return pluginMgr;
		}
		var modPath = require.resolve(pluginPath);
		delete require.cache[modPath];
		pluginMgr = require(pluginPath);
	} catch(e) {
		console.log("Plugin load error:", e);
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

function getServerUptime() {
	return Date.now() - serverStartTime;
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

function deployNewClientVersion() {
	var staticVersion = getClientVersion();
	if(staticVersion) {
		staticVersion = "?v=" + staticVersion;
	}
	httpServer.setDefaultTemplateData("staticVersion", staticVersion);
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

// only accessible through modifying shell.js in the data directory - no web interface ever used to enter commands
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
	pg.defaults.password = settings.pg_db.password;
	if(settings.pg_db.port) {
		pg.defaults.port = settings.pg_db.port;
	}
}

class UviasClient {
	stats = {
		runningAll: 0,
		runningGet: 0,
		runningRun: 0
	}

	ranksCache = {};

	id = null;
	name = null;
	domain = null;
	private = null;
	only_verified = null;
	custom_css_file_path = null;

	pid_bypass = false;

	paths = {
		sso: null,
		logout: null,
		address: null,
		loginPath: null,
		logoutPath: null,
		registerPath: null,
		profilePath: null
	};

	async all(query, data) {
		if(data != void 0 && !Array.isArray(data)) data = [data];
		this.stats.runningAll++;
		var result = await pgConn.query(query, data);
		this.stats.runningAll--;
		return result.rows;
	}
	
	async get(query, data) {
		if(data != void 0 && !Array.isArray(data)) data = [data];
		this.stats.runningGet++;
		var result = await pgConn.query(query, data);
		this.stats.runningGet--;
		return result.rows[0];
	}
	
	async run(query, data) {
		if(data != void 0 && !Array.isArray(data)) data = [data];
		this.stats.runningRun++;
		await pgConn.query(query, data);
		this.stats.runningRun--;
	}

	async loadRanks() {
		this.ranksCache = {};
		var data = await this.all("SELECT * FROM accounts.ranks");
		for(var i = 0; i < data.length; i++) {
			var rank = data[i];
			var id = rank.id;
			var name = rank.name;
			this.ranksCache[name] = id;
		}
	}

	getRankIdByName(name) {
		return this.ranksCache[name];
	}
}

function setupUvias() {
	uvias = new UviasClient();

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

	if(settings.uvias?.pid_bypass) {
		uvias.pid_bypass = true;
	}

	uvias.paths.sso = "/accounts/sso";
	// redirect to /accounts/logout/ to clear token cookie
	uvias.paths.logout = "/accounts/logout/?return=" + "/home/";
	uvias.paths.address = "https://uvias.com";
	uvias.paths.loginPath = uvias.paths.address + "/api/loginto/" + uvias.id;
	uvias.paths.logoutPath = uvias.paths.address + "/logoff?service=" + uvias.id;
	uvias.paths.registerPath = uvias.paths.address + "/api/loginto/" + uvias.id + "#create";
	uvias.paths.profilePath = uvias.paths.address + "/profile/@me";
	if(accountSystem == "uvias") {
		loginPath = uvias.paths.loginPath;
		logoutPath = uvias.paths.logoutPath;
		registerPath = uvias.paths.registerPath;
		profilePath = uvias.paths.profilePath;
	}
}

if(isTestServer) {
	serverPort = settings.test_port;
	Error.stackTraceLimit = 128;
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

function setupStaticShortcuts() {
	if(!staticNumsPath) return;
	var data;
	try {
		data = fs.readFileSync(staticNumsPath);
	} catch(e) {
		// static shortcuts don't exist
		return;
	}
	for(var i in staticShortcuts) {
		delete staticShortcuts[i];
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

function loadStatic() {
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

function setupZipLog() {
	var zip_file;
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
	boundary: require("./backend/websockets/boundary.js"),
	stats: require("./backend/websockets/stats.js")
};

var modules = {
	fetch_tiles: require("./backend/modules/fetch_tiles.js"),
	protect_areas: require("./backend/modules/protect_areas.js"),
	write_data: require("./backend/modules/write_data.js"),
	write_links: require("./backend/modules/write_links.js"),
	clear_areas: require("./backend/modules/clear_areas.js")
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

class AsyncDBManager {
	database = null;
	constructor(_db) {
		this.database = _db;
	}

	// gets data from the database (only 1 row at a time)
	async get(command, args) {
		var self = this;
		if(args == void 0 || args == null) args = [];
		return new Promise(function(r, rej) {
			self.database.get(command, args, function(err, res) {
				if(err) {
					return rej({
						sqlite_error: process_error_arg(err),
						input: { command, args }
					});
				}
				r(res);
			});
		});
	}

	// runs a command (insert, update, etc...) and might return "lastID" if needed
	async run(command, args) {
		var self = this;
		if(args == void 0 || args == null) args = [];
			return new Promise(function(r, rej) {
				self.database.run(command, args, function(err, res) {
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
	}

	// gets multiple rows in one command
	async all(command, args) {
		var self = this;
		if(args == void 0 || args == null) args = [];
			return new Promise(function(r, rej) {
				self.database.all(command, args, function(err, res) {
					if(err) {
						return rej({
							sqlite_error: process_error_arg(err),
							input: { command, args }
						});
					}
					r(res);
				});
			});
	}

	// get multiple rows but execute a function for every row
	async each(command, args, callbacks) {
		var self = this;
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
			self.database.each(command, args, callbacks, function(err, res) {
				if(err) return rej({
					sqlite_error: process_error_arg(err),
					input: { command, args }
				});
				if(callback_error) return rej(cb_err_desc);
				r(res);
			});
		});
	}

	// like run, but executes the command as a SQL file
	// (no comments allowed, and must be semicolon separated)
	async exec(command) {
		var self = this;
		return new Promise(function(r, rej) {
			self.database.exec(command, function(err) {
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
}

function loadDbSystems() {
	var database = new sql.Database(serverDBPath);
	var edits_db = new sql.Database(editsDBPath);
	var chat_history = new sql.Database(chatDBPath);
	var image_db = new sql.Database(imageDBPath);
	var misc_db = new sql.Database(miscDBPath);

	db = new AsyncDBManager(database);
	db_edits = new AsyncDBManager(edits_db);
	db_chat = new AsyncDBManager(chat_history);
	db_img = new AsyncDBManager(image_db);
	db_misc = new AsyncDBManager(misc_db);
}

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

function setupHTTPServer() {
	httpServer = new serverUtil.HTTPServer(settings.port, global_data);

	httpServer.setPageTree(pages);
	httpServer.setDefaultTemplateData("loginPath", loginPath);
	httpServer.setDefaultTemplateData("logoutPath", logoutPath);
	httpServer.setDefaultTemplateData("registerPath", registerPath);
	httpServer.setDefaultTemplateData("profilePath", profilePath);
	httpServer.setDefaultTemplateData("accountSystem", accountSystem);
}


async function initializeServer() {
	console.log("Starting server...");

	if(accountSystem == "uvias") {
		setupUvias();
		await uvias_init();
		global_data.uvias = uvias;
	}

	loadDbSystems();
	setupStaticShortcuts();
	loadStatic();
	setupZipLog();
	setupHTTPServer();

	await initialize_misc_db();
	await initialize_ranks_db();
	await initialize_edits_db();
	await initialize_image_db();

	global_data.db = db;
	global_data.db_img = db_img;
	global_data.db_misc = db_misc;
	global_data.db_edits = db_edits;
	global_data.db_chat = db_chat;

	global_data.checkCSRF = httpServer.checkCSRF;
	global_data.createCSRF = httpServer.createCSRF;

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

async function promptCommand() {
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
		loadStatic();
		return promptCommand();
	}
	if(input == "help") {
		console.log("stop: close server\nres: restart\nmaint: maintenance mode\nsta: reload templates and static files");
		return promptCommand();
	}
	// REPL
	try {
		console.dir(eval(input), { colors: true });
	} catch(e) {
		console.dir(e, { colors: true });
	}
	if(prompt_stopped) return;
	promptCommand();
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

intv.release_stuck_requests = setInterval(function() {
	httpServer.releaseStuckRequests();
}, 1000 * 60);

function createEndpoints(server) {
	server.registerEndpoint("favicon.ico", "/static/favicon.png", { no_login: true });
	server.registerEndpoint("robots.txt", "/static/robots.txt", { no_login: true });
	server.registerEndpoint("home", pages.home);
	server.registerEndpoint(".well-known/*", null);

	server.registerEndpoint("accounts/login", pages.accounts.login);
	server.registerEndpoint("accounts/logout", pages.accounts.logout);
	server.registerEndpoint("accounts/register", pages.accounts.register);
	server.registerEndpoint("accounts/profile$", "/accounts/profile/"); // ensure there is always an ending slash
	server.registerEndpoint("accounts/profile", pages.accounts.profile);
	server.registerEndpoint("accounts/private", pages.accounts.private);
	server.registerEndpoint("accounts/configure/*", pages.accounts.configure);
	server.registerEndpoint("accounts/member_autocomplete", pages.accounts.member_autocomplete);
	server.registerEndpoint("accounts/register/complete", pages.accounts.register_complete);
	server.registerEndpoint("accounts/verify/*", pages.accounts.verify);
	server.registerEndpoint("accounts/download/*", pages.accounts.download);
	server.registerEndpoint("accounts/password_change", pages.accounts.password_change);
	server.registerEndpoint("accounts/password_change/done", pages.accounts.password_change_done);
	server.registerEndpoint("accounts/nsfw/*", pages.accounts.nsfw);
	server.registerEndpoint("accounts/tabular", pages.accounts.tabular);
	server.registerEndpoint("accounts/verify_email/*", pages.accounts.verify_email);
	server.registerEndpoint("accounts/sso", pages.accounts.sso);

	server.registerEndpoint("ajax/protect", pages.protect);
	server.registerEndpoint("ajax/unprotect", pages.unprotect);
	server.registerEndpoint("ajax/protect/char", pages.protect_char);
	server.registerEndpoint("ajax/unprotect/char", pages.unprotect_char);
	server.registerEndpoint("ajax/coordlink", pages.coordlink);
	server.registerEndpoint("ajax/urllink", pages.urllink);

	server.registerEndpoint("administrator/", pages.admin.administrator);
	server.registerEndpoint("administrator/user/*", pages.admin.user);
	server.registerEndpoint("administrator/users/by_username/*", pages.admin.users_by_username);
	server.registerEndpoint("administrator/users/by_id/*", pages.admin.users_by_id);
	server.registerEndpoint("administrator/backgrounds", pages.admin.backgrounds, { binary_post_data: true });
	server.registerEndpoint("administrator/manage_ranks", pages.admin.manage_ranks);
	server.registerEndpoint("administrator/set_custom_rank/*", pages.admin.set_custom_rank);
	server.registerEndpoint("administrator/user_list", pages.admin.user_list);
	server.registerEndpoint("administrator/monitor/", (settings && settings.monitor && settings.monitor.redirect) ? settings.monitor.redirect : null);
	server.registerEndpoint("administrator/shell", pages.admin.shell);
	server.registerEndpoint("administrator/restrictions", pages.admin.restrictions, { binary_post_data: true });

	server.registerEndpoint("script_manager/", pages.script_manager);
	server.registerEndpoint("script_manager/edit/*", pages.script_edit);
	server.registerEndpoint("script_manager/view/*", pages.script_view);

	server.registerEndpoint("world_style", pages.world_style);
	server.registerEndpoint("world_props", pages.world_props);

	server.registerEndpoint("other/random_color", pages.other.random_color, { no_login: true });
	server.registerEndpoint("other/backgrounds/*", pages.other.load_backgrounds, { no_login: true });
	server.registerEndpoint("other/test/*", pages.other.test, { no_login: true });
	server.registerEndpoint("other/ipaddress", pages.other.ipaddress);

	server.registerEndpoint("static/*", pages.static, { no_login: true });
	server.registerEndpoint("static", pages.static, { no_login: true });

	// match all ASCII symbols and Unicode-defined letters
	server.registerEndpoint(/^([\u0021-\u007E\p{L}]*)$/gu, pages.yourworld, { remove_end_slash: true });

	server.registerErrorEndpoint(404, pages["404"]);
	server.registerErrorEndpoint(500, pages["500"]);

	// set rate limits

	server.setHTTPRateLimit(pages.accounts.login, 2);
	server.setHTTPRateLimit(pages.accounts.logout, 2);
	server.setHTTPRateLimit(pages.accounts.register, 1);
	server.setHTTPRateLimit(pages.accounts.profile, 2, "GET");
	server.setHTTPRateLimit(pages.accounts.profile, 10, "POST");
	server.setHTTPRateLimit(pages.accounts.configure, 2);
	server.setHTTPRateLimit(pages.accounts.member_autocomplete, 4);
	server.setHTTPRateLimit(pages.accounts.download, 2);
	server.setHTTPRateLimit(pages.accounts.tabular, 2);
	server.setHTTPRateLimit(pages.accounts.sso, 3);
	server.setHTTPRateLimit(pages.protect, 16);
	server.setHTTPRateLimit(pages.unprotect, 16);
	server.setHTTPRateLimit(pages.protect_char, 16);
	server.setHTTPRateLimit(pages.unprotect_char, 16);
	server.setHTTPRateLimit(pages.coordlink, 16);
	server.setHTTPRateLimit(pages.urllink, 16);
	server.setHTTPRateLimit(pages.yourworld, 16, "POST");
	server.setHTTPRateLimit(pages.yourworld, 6, "GET");
	server.setHTTPRateLimit(pages.world_style, 2);
	server.setHTTPRateLimit(pages.world_props, 2);
}

function new_token(len) {
	var token = crypto.randomBytes(len).toString("hex");
	return token;
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
async function getUserInfo(cookies, is_websocket, dispatch) {
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

process.on("unhandledRejection", function(reason) {
	console.log("Unhandled promise rejection!\n" + Date.now());
	console.log("Error:", reason);
});

var periodWSOutboundBytes = 0;
var periodWSInboundBytes = 0;

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

function loadString(type) {
	switch(type) {
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
		if(restr_cache != data) {
			restr_update = data;
		}
		restr_cache = data;
	} else if(type == "cg1") {
		if(restr_cg1_cache != data) {
			restr_cg1_update = data;
		}
		restr_cg1_cache = data;
	}
}

async function commitRestrictionsToDisk() {
	if(restr_update != null) {
		await fs.promises.writeFile(restrPath, restr_update);
		restr_update = null;
	}
	if(restr_cg1_update != null) {
		await fs.promises.writeFile(restrCg1Path, restr_cg1_update);
		restr_cg1_update = null;
	}
}

async function loadServerSettings() {
	for(var option in serverSettings) {
		var dbValue = await db.get("SELECT value FROM server_info WHERE name=?", option);
		if(dbValue) {
			serverSettings[option] = dbValue.value;
		}
		serverSettingsStatus[option] = {
			updating: false
		};
	}
}

async function updateServerSetting(option, value) {
	if(!(option in serverSettings)) {
		return false;
	}
	if(serverSettingsStatus[option].updating) return false;
	serverSettingsStatus[option].updating = true;
	serverSettings[option] = value;
	var element = await db.get("SELECT value FROM server_info WHERE name=?", option);
	if(!element) {
		await db.run("INSERT INTO server_info values(?, ?)", [option, value]);
	} else {
		await db.run("UPDATE server_info SET value=? WHERE name=?", [value, option]);
	}
	serverSettingsStatus[option].updating = false;
}

function getServerSetting(option) {
	if(!(option in serverSettings)) {
		return null;
	}
	return serverSettings[option];
}

async function modifyAnnouncement(text) {
	if(typeof text != "string") return false;
	updateServerSetting("announcement", text);
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

async function loopClearExpiredSessions(no_timeout) {
	// clear expired sessions
	await db.run("DELETE FROM auth_session WHERE expire_date <= ?", Date.now());
	// clear expired registration keys
	await db.each("SELECT id FROM auth_user WHERE is_active=0 AND ? - date_joined >= ? AND (SELECT COUNT(*) FROM registration_registrationprofile WHERE user_id=auth_user.id) > 0",
		[Date.now(), ms.day * settings.activation_key_days_expire], async function(data) {
		var id = data.id;
		await db.run("DELETE FROM registration_registrationprofile WHERE user_id=?", id);
	});

	if(!no_timeout) intv.clearExpiredSessions = setTimeout(loopClearExpiredSessions, ms.minute);
}

async function loopCommitRestrictions(no_timeout) {
	await commitRestrictionsToDisk();
	if(!no_timeout) intv.commitRestrictionsToDisk = setTimeout(loopCommitRestrictions, ms.second * 5);
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
			} catch(e) {}
		});
	}, 1000 * 30);
}

async function uviasSendIdentifier() {
	var currentPID = process.pid;
	if(uvias.pid_bypass) {
		currentPID = 1;
	}
	await uvias.run("SELECT accounts.set_service_info($1::text, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::boolean, $8::boolean, $9::text);",
		[
			uvias.id, uvias.name, uvias.domain,
			uvias.paths.sso, uvias.paths.logout, currentPID, uvias.private, uvias.only_verified, uvias.custom_css_file_path
		]);
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

	await uvias.loadRanks();

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
	clear_tile:		[512, 1000, 0],
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
		headers: req.headers,
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

	var parsedURL = new URL(req.url, "ws://example.com/ws");
	var location = parsedURL.pathname;
	try {
		location = decodeURIComponent(location);
	} catch(e) {}
	var search = parsedURL.searchParams;

	var bytesWritten = 0;
	var bytesRead = 0;

	var pre_queue = [];
	var world = null;
	var clientId = void 0;
	var worldObj = null;
	var hasClientReleasedObjects = false;
	
	// process ip address headers from cloudflare/nginx
	var realIp = req.headers["X-Real-IP"] || req.headers["x-real-ip"];
	var cfIp = req.headers["CF-Connecting-IP"] || req.headers["cf-connecting-ip"];
	var remIp = req.socket.remoteAddress;
	var evalIp = evaluateIpAddress(remIp, realIp, cfIp);
	ws.sdata.ipAddress = evalIp[0];
	ws.sdata.ipAddressFam = evalIp[1];
	ws.sdata.ipAddressVal = evalIp[2];
	
	var restr = restrictions.getRestrictions();
	
	var deniedPages = httpServer.checkHTTPRestr(restr, ws.sdata.ipAddressVal, ws.sdata.ipAddressFam);
	if(deniedPages.siteAccess) {
		var deny_notes = "None";
		if(deniedPages.siteAccessNote) {
			deny_notes = deniedPages.siteAccessNote;
		}
		ws.send("Site access denied, note: "+deny_notes);
		ws.close();
		return;
	}
	
	function evictClient() {
		if(hasClientReleasedObjects) return;
		hasClientReleasedObjects = true;
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
	}

	// must be at the top before any async calls (errors may otherwise occur before the event declaration)
	ws.on("error", function(err) {
		if(err && !["WS_ERR_INVALID_OPCODE", "Z_DATA_ERROR", "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"].includes(err.code)) {
			handle_error(JSON.stringify(process_error_arg(err)));
		}
		if(!ws.sdata.terminated) {
			ws.close();
		}
		evictClient();
	});
	ws.on("close", function() {
		evictClient();
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

	// adds data to a queue. this must be before any async calls and the message event
	function pre_message(msg) {
		if(!can_process_req()) return;
		pre_queue.push(msg);
	}
	ws.on("message", pre_message);

	if(ws.sdata.terminated) return; // in the event of an immediate close

	var cookies = parseCookie(req.headers.cookie);
	var user = await getUserInfo(cookies, true);
	if(ws.sdata.terminated) return;
	var channel = new_token(7);
	ws.sdata.channel = channel;

	var ctx = {
		user, channel,
		keyQuery: search.get("key"),
		world: null
	};

	if(search.get("hide") == "1") {
		ws.sdata.hide_user_count = true;
	}

	world = await getOrCreateWorld(location);
	if(ws.sdata.terminated) return;
	if(!world) {
		return error_ws("NO_EXIST", "World does not exist");
	}

	var permission = await canViewWorld(world, user, {
		memKey: search.get("key")
	});
	if(ws.sdata.terminated) return;
	if(!permission) {
		return error_ws("NO_PERM", "No permission");
	}

	ws.sdata.userClient = true; // client connection is now initialized
	ws.sdata.keyQuery = search.get("key");
	
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
		if(ws.sdata.terminated) return;
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
			};
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
			res = await websockets[kind](ws, msg, send, broadcast, global_data, ctx);
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
	await loadServerSettings();
	loadRestrictionsList();
	
	if(accountSystem == "local") {
		await loopClearExpiredSessions();
	}

	await loopCommitRestrictions();

	intv.userCount = setInterval(function() {
		broadcastUserCount();
	}, 2000);

	intv.traff_mon_net_interval = setInterval(function() {
		var httpByteStat = httpServer.consumeByteTransferStats();
		if(httpByteStat.out || httpByteStat.in) {
			broadcastMonitorEvent("Network", "HTTP stream: " + httpByteStat.out + " (out); " + httpByteStat.in + " (in)");
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

	createEndpoints(httpServer);

	if(settings.monitor && settings.monitor.enabled) {
		setupMonitorServer();
	}

	httpServer.listen(settings.ip, function() {
		var addr = httpServer.server.address();

		console.log("\x1b[92;1mOWOT Server is running\x1b[0m");
		console.log("Address: " + addr.address);
		console.log("Port: " + addr.port);

		// start listening for commands
		promptCommand();
	});

	wss = new WebSocket.Server({
		server: httpServer.server,
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

	var plugin = loadPlugin(true);
	if(plugin && plugin.main) {
		plugin.main(global_data);
	}
}

// the server context
var global_data = {
	website: settings.website,
	db: null,
	db_img: null,
	db_misc: null,
	db_edits: null,
	db_chat: null,
	uvias: null,
	wsSend,
	ws_broadcast,
	createCSRF: null,
	checkCSRF: null,
	memTileCache,
	isTestServer,
	shellEnabled,
	loadString,
	updateServerSetting,
	getServerSetting,
	restrictions,
	saveRestrictions,
	accountSystem,
	ms,
	checkHash,
	encryptHash,
	new_token,
	querystring,
	url,
	send_email,
	getUserInfo,
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
	deployNewClientVersion,
	staticShortcuts,
	setupStaticShortcuts,
	getServerUptime
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
			if(serverLoaded) {
				for(var i in subsystems) {
					var sys = subsystems[i];
					if(sys.server_exit) {
						await sys.server_exit();
					}
				}

				httpServer.close();
				wss.close();

				if(accountSystem == "uvias") {
					pgConn.end();
				}

				if(monitorWorker && settings.monitor && settings.monitor.enabled) {
					monitorWorker.terminate();
				}
			}

			var plugin = loadPlugin();
			if(plugin && plugin.server_exit) {
				plugin.server_exit();
			}

			if(accountSystem == "local") {
				await loopClearExpiredSessions(true);
			}

			await loopCommitRestrictions(true);
		} catch(e) {
			handle_error(e);
			if(!isTestServer) console.log(e);
		}

		var handles = [];
		if(process._getActiveHandles) {
			handles = process._getActiveHandles();
		}

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
initializeServer().catch(function(e) {
	console.log("An error occurred during the initialization process:");
	console.log(e);
});
