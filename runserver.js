/*
**  Our World of Text
**  Est. May 1, 2016 as Your World of Text Node, and November 19, 2016 as Node World of Text
**  Reprogrammed September 17, 2017
**  Released October 10, 2017 as Our World of Text
**  This is the main file
*/

console.log("Starting up...");

var serverLoaded = false;
var isStopping = false;

const crypto      = require("crypto");
const fs          = require("fs");
const http        = require("http");
const https       = require("https");
const isIP        = require("net").isIP;
const nodemailer  = require("nodemailer");
const path        = require("path");
const pg          = require("pg");
const prompt      = require("./lib/prompt/prompt.js");
const querystring = require("querystring");
const sql         = require("sqlite3");
const swig        = require("./lib/swig/swig.js");
const url         = require("url");
const util        = require("util");
const WebSocket   = require("ws");
const zip         = require("adm-zip");
const zlib        = require("zlib");

const bin_packet   = require("./backend/utils/bin_packet.js");
const utils        = require("./backend/utils/utils.js");
const templates    = require("./backend/utils/templates.js");
const rate_limiter = require("./backend/utils/rate_limiter.js");

var trimHTML             = utils.trimHTML;
var create_date          = utils.create_date;
var san_nbr              = utils.san_nbr;
var san_dp               = utils.san_dp;
var toUpper              = utils.toUpper;
var NCaseCompare         = utils.NCaseCompare;
var split_limit          = utils.split_limit;
var checkURLParam        = utils.checkURLParam;
var removeLastSlash      = utils.removeLastSlash;
var parseCookie          = utils.parseCookie;
var ar_str_trim          = utils.ar_str_trim;
var ar_str_decodeURI     = utils.ar_str_decodeURI;
var filename_sanitize    = utils.filename_sanitize;
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
var advancedSplit        = utils.advancedSplit;
var change_char_in_array = utils.change_char_in_array;
var html_tag_esc         = utils.html_tag_esc;
var sanitize_color       = utils.sanitize_color;
var fixColors            = utils.fixColors;
var parseAcceptEncoding  = utils.parseAcceptEncoding;
var dump_dir             = utils.dump_dir;
var arrayIsEntirely      = utils.arrayIsEntirely;
var normalizeCacheTile   = utils.normalizeCacheTile;
var parseTextcode        = utils.parseTextcode;
var checkDuplicateCookie = utils.checkDuplicateCookie;

var gzipEnabled = false;
var shellEnabled = true;
var clientVersion = "";

// Global
CONST = {};
CONST.tileCols = 16;
CONST.tileRows = 8;
CONST.tileArea = CONST.tileCols * CONST.tileRows;

// tile cache for fetching and updating
// 3 levels: world_id -> tile_y -> tile_x
var memTileCache = {};

console.log("Loaded libs");

var DATA_PATH = "../data/";
var DATA_PATH_TEST = DATA_PATH + "test/";
var SETTINGS_PATH = DATA_PATH + "settings.json";

function initializeDirectoryStruct() {
	// create the data folder that stores all of the server's data
	if(!fs.existsSync(DATA_PATH)) {
		fs.mkdirSync(DATA_PATH, 0o777);
	}
	// directory used for storing data for the test server
	if(!fs.existsSync(DATA_PATH_TEST)) {
		fs.mkdirSync(DATA_PATH_TEST, 0o777);
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

var csrfkeys = [crypto.randomBytes(8), crypto.randomBytes(8)];
function createCSRF(userid, kclass) {
	var csrftoken = crypto.createHmac("sha1", csrfkeys[kclass]).update(userid.toString()).digest("hex").toLowerCase();
	return csrftoken;
}
function checkCSRF(token, userid, kclass) {
	if(typeof token != "string" || !token) return false;
	return token.toLowerCase() == createCSRF(userid, kclass);
}

function normalize_ipv6(ip) {
	ip = ip.replace(/^:|:$/g, "");
	ip = ip.split(":");
	
	for(var i = 0; i < ip.length; i++) {
		var seg = ip[i];
		if(seg) {
			ip[i] = seg.padStart(4, "0");
		} else {
			seg = [];
			for(var a = ip.length; a <= 8; a++) {
				seg.push("0000");
			}
			ip[i] = seg.join(":");
		}
	}
	return ip.join(":");
}

var cloudflare_ipv4_txt,
	cloudflare_ipv6_txt;
function loadCloudflareIpRanges() {
	cloudflare_ipv4_txt = fs.readFileSync("./backend/cloudflare_ipv4.txt").toString();
	cloudflare_ipv6_txt = fs.readFileSync("./backend/cloudflare_ipv6.txt").toString();
}
loadCloudflareIpRanges();

var cloudflare_ipv4_int = [];
var cloudflare_ipv6_int = [];

function ipv4_to_int(str) {
	str = str.split(".").map(function(e) {
		return parseInt(e, 10);
	});
	return str[0] * 16777216 + str[1] * 65536 + str[2] * 256 + str[3];
}

// ipv6 must be normalized
function ipv6_to_int(str) {
	str = str.split(":").map(function(e) {
		return BigInt(parseInt(e, 16));
	});
	return str[7] | str[6] << 16n | str[5] << 32n | str[4] << 48n | str[3] << 64n | str[2] << 80n | str[1] << 96n | str[0] << 112n;
}

function ipv4_txt_to_int() {
	var txt = cloudflare_ipv4_txt;
	txt = txt.replace(/\r\n/g, "\n");
	txt = txt.split("\n");
	for(var i = 0; i < txt.length; i++) {
		var ip = txt[i];
		if(!ip) continue;
		ip = ip.trim();
		if(ip == "") continue;
		ip = ip.split("/");
		var addr = ip[0];
		var sub = parseInt(ip[1]);
		var num = ipv4_to_int(addr);

		var ip_start = unsigned_u32_and(num, subnetMask_ipv4(sub));
		var ip_end = unsigned_u32_or(num, subnetOr_ipv4(sub));

		cloudflare_ipv4_int.push([ip_start, ip_end]);
	}
}

function ipv6_txt_to_int() {
	var txt = cloudflare_ipv6_txt;
	txt = txt.replace(/\r\n/g, "\n");
	txt = txt.split("\n");
	for(var i = 0; i < txt.length; i++) {
		var ip = txt[i];
		if(!ip) continue;
		ip = ip.trim();
		if(ip == "") continue;
		ip = ip.split("/");
		var addr = ip[0];
		var sub = parseInt(ip[1]);
		addr = normalize_ipv6(addr);
		var num = ipv6_to_int(addr);

		var ip_start = num & subnetMask_ipv6(sub);
		var ip_end = num | subnetOr_ipv6(sub);

		cloudflare_ipv6_int.push([ip_start, ip_end]);
	}
}

function ipv4_to_range(ip) {
	ip = ip.trim();
	ip = ip.split("/");
	var addr = ip[0];
	var sub = parseInt(ip[1]);
	if(isNaN(sub)) sub = 32;
	var num = ipv4_to_int(addr);
	var ip_start = unsigned_u32_and(num, subnetMask_ipv4(sub));
	var ip_end = unsigned_u32_or(num, subnetOr_ipv4(sub));
	return [ip_start, ip_end];
}
function ipv6_to_range(ip) {
	ip = ip.split("/");
	var addr = ip[0];
	var sub = parseInt(ip[1]);
	if(isNaN(sub)) sub = 128;
	addr = normalize_ipv6(addr);
	var num = ipv6_to_int(addr);
	var ip_start = num & subnetMask_ipv6(sub);
	var ip_end = num | subnetOr_ipv6(sub);
	return [ip_start, ip_end];
}

var u32Byte = new Uint32Array(1);
function unsigned_u32_and(x, y) {
	u32Byte[0] = x;
	u32Byte[0] &= y;
	return u32Byte[0];
}

function unsigned_u32_or(x, y) {
	u32Byte[0] = x;
	u32Byte[0] |= y;
	return u32Byte[0];
}

function subnetMask_ipv4(num) {
	return ((1 << 32) - 2 >>> 0) - (2 ** (32 - num) - 1);
}

function subnetOr_ipv4(num) {
	return 2 ** (32 - num) - 1;
}

function subnetMask_ipv6(num) {
	return ((1n << 128n) - 1n) - (1n << (128n - BigInt(num))) + 1n;
}

function subnetOr_ipv6(num) {
	return ((1n << (128n - BigInt(num))) - 1n);
}

function is_cf_ipv4_int(num) {
	for(var i = 0; i < cloudflare_ipv4_int.length; i++) {
		var ip = cloudflare_ipv4_int[i];
		if(num >= ip[0] && num <= ip[1]) return true;
	}
	return false;
}

function is_cf_ipv6_int(num) {
	for(var i = 0; i < cloudflare_ipv6_int.length; i++) {
		var ip = cloudflare_ipv6_int[i];
		if(num >= ip[0] && num <= ip[1]) return true;
	}
	return false;
}

ipv4_txt_to_int();
ipv6_txt_to_int();

function handle_error(e, doLog) {
	var str = JSON.stringify(process_error_arg(e));
	log_error(str);
	if(isTestServer || doLog) {
		console.log("Error:", str);
	}
}

var isTestServer = false;
var debugLogging = false;
var testServerMainDirs = false;
var testUviasIds = false;

var acme = {
	enabled: false,
	pass: null
};

function processArgs() {
	var args = process.argv;
	args.forEach(function(a) {
		if(a == "--test-server") {
			if(!isTestServer) console.log("\x1b[31;1mThis is a test server\x1b[0m");
			isTestServer = true;
		}
		if(a == "--log") {
			if(!debugLogging) console.log("\x1b[31;1mDebug logging enabled\x1b[0m");
			debugLogging = true;
		}
		if(a == "--main-dirs") {
			testServerMainDirs = true;
		}
		if(a == "--uvias-test-info") {
			testUviasIds = true;
		}
		if(a == "--lt") {
			if(!isTestServer) console.log("\x1b[31;1mThis is a test server\x1b[0m");
			isTestServer = true;
			if(!debugLogging) console.log("\x1b[31;1mDebug logging enabled\x1b[0m");
			debugLogging = true;
			testServerMainDirs = true;
			testUviasIds = true;
		}
	});
}
processArgs();

// console function
function run(path) {
	eval(fs.readFileSync(path).toString("utf8"));
}

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

const settings = require(SETTINGS_PATH);

var serverPort     = settings.port;
var serverDB       = settings.DATABASE_PATH;
var editsDB        = settings.EDITS_PATH;
var chatDB         = settings.CHAT_HISTORY_PATH;
var imageDB        = settings.IMAGES_PATH;
var miscDB         = settings.MISC_PATH;
var filesPath      = settings.FILES_PATH;
var staticFilesRaw = settings.STATIC_FILES_RAW;
var staticFilesIdx = settings.STATIC_FILES_IDX;
var accountSystem  = settings.accountSystem; // "uvias" or "local"

var loginPath = "/accounts/login/";
var logoutPath = "/accounts/logout/";
var registerPath = "/accounts/register/";
var profilePath = "/accounts/profile/";

if(accountSystem != "uvias" && accountSystem != "local") {
	console.log("ERROR: Invalid account system: " + accountSystem);
	sendProcMsg("EXIT");
	process.exit();
}

var pgClient = pg.Client;
var pgConn;
function makePgClient() {
	pgConn = new pgClient({
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
	uvias.domain = "testserver1.ourworldoftext.com";
	uvias.private = true;
	uvias.only_verified = false;
	uvias.custom_css_file_path = settings.uvias_custom_css_file_path;
} else {
	uvias.id = "owot";
	uvias.name = "Our World Of Text";
	uvias.domain = "ourworldoftext.com";
	uvias.private = false;
	uvias.only_verified = false;
	uvias.custom_css_file_path = settings.uvias_custom_css_file_path;
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

Error.stackTraceLimit = 1024;

var intv = {}; // intervals and timeouts

if(isTestServer) {
	serverPort = settings.test_port;
	if(!testServerMainDirs) {
		serverDB = settings.TEST_DATABASE_PATH;
		chatDB = settings.TEST_CHAT_HISTORY_PATH;
		imageDB = settings.TEST_IMAGES_PATH;
		miscDB = settings.TEST_MISC_PATH;
		editsDB = settings.TEST_EDITS_PATH;
		settings.LOG_PATH = settings.TEST_LOG_PATH;
		settings.ZIP_LOG_PATH = settings.TEST_ZIP_LOG_PATH;
		settings.UNCAUGHT_PATH = settings.TEST_UNCAUGHT_PATH;
		settings.REQ_LOG_PATH = settings.TEST_REQ_LOG_PATH;
	}
}

const log_error = function(err) {
	if(settings.error_log) {
		try {
			err = JSON.stringify(err);
			err = "TIME: " + Date.now() + "\r\n" + err + "\r\n" + "-".repeat(20) + "\r\n\r\n\r\n";
			fs.appendFileSync(settings.LOG_PATH, err);
		} catch(e) {
			console.log("Error logging error:", e);
		}
	}
}

var read_staticRaw,
	write_staticRaw,
	read_staticIdx,
	write_staticIdx,
	staticRaw_size,
	staticIdx_size;
function initializeStaticSys() {
	if(!fs.existsSync(settings.bypass_key)) {
		var rand = "";
		var key = "0123456789ABCDEF";
		for(var i = 0; i < 50; i++) {
			rand += key[Math.floor(Math.random() * 16)];
		}
		fs.writeFileSync(settings.bypass_key, rand);
	}
	
	if(!fs.existsSync(filesPath)) fs.mkdirSync(filesPath, 0o777);
	if(!fs.existsSync(staticFilesRaw)) fs.writeFileSync(staticFilesRaw, "");
	if(!fs.existsSync(staticFilesIdx)) fs.writeFileSync(staticFilesIdx, "");
	
	read_staticRaw = fs.openSync(staticFilesRaw, "r");
	write_staticRaw = fs.createWriteStream(staticFilesRaw, { flags: "a" });
	read_staticIdx = fs.openSync(staticFilesIdx, "r");
	write_staticIdx = fs.createWriteStream(staticFilesIdx, { flags: "a" });
	
	staticRaw_size = fs.statSync(staticFilesRaw).size;
	staticIdx_size = fs.statSync(staticFilesIdx).size;
}
initializeStaticSys();

async function staticRaw_append(data) {
	return new Promise(function(res) {
		write_staticRaw.write(data, function() {
			var start = staticRaw_size;
			staticRaw_size += data.length;
			res(start);
		});
	});
}

async function staticIdx_append(data) {
	return new Promise(function(res) {
		write_staticIdx.write(data, function() {
			var index = staticIdx_size / 9;
			staticIdx_size += 9;
			res(index + 1);
		});
	});
}

async function static_retrieve(id, range) {
	id--;
	if(id < 0 || id >= staticIdx_size / 9) return null;
	
	var pos = Buffer.alloc(9);
	await asyncFsRead(read_staticIdx, pos, 0, 9, id * 9);

	var accessible = pos[8];
	if(!accessible) return 0;
	var start = pos[0] + pos[1] * 256 + pos[2] * 65536 + pos[3] * 16777216;
	var len = pos[4] + pos[5] * 256 + pos[6] * 65536 + pos[7] * 16777216;
	var totalLen = len;
	var headerPrepend = null;
	if(range) {
		var headLenBuff = Buffer.alloc(2);
		// get the size of the header
		await asyncFsRead(read_staticRaw, headLenBuff, 0, 2, start);
		var headLen = headLenBuff[0] + headLenBuff[1] * 256;
		var dataLen = len - headLen;
		var headerPrepend = Buffer.alloc(headLen);
		headerPrepend[0] = headLenBuff[0];
		headerPrepend[1] = headLenBuff[1];
		// read the header data to prepend later
		await asyncFsRead(read_staticRaw, headerPrepend, 2, headLen - 2, start + 2);

		var rangeLen, rangeOffset;
		// validate and change the range
		if(range[0] < 0) range[0] = 0;
		if(range[1] == "") {
			range[1] = dataLen - 1;
		} else {
			if(range[1] >= dataLen) range[1] = dataLen - 1;
		}
		if(range[0] > range[1]) {
			var tmp = range[0];
			range[0] = range[1];
			range[1] = tmp;
		}
		rangeLen = range[1] - range[0] + 1;
		rangeOffset = range[0];

		len = rangeLen;
		start = start + headLen + rangeOffset;
	}
	var data = Buffer.alloc(len);
	await asyncFsRead(read_staticRaw, data, 0, len, start);
	if(headerPrepend) {
		data = Buffer.concat([headerPrepend, data]);
	}

	return {
		data,
		len: totalLen
	};
}

function asyncFsRead(fd, buff, offset, len, start) {
	return new Promise(function(res, rej) {
		fs.read(fd, buff, offset, len, start, function(err) {
			if(err) return rej(err);
			res();
		});
	});
}

function static_retrieve_raw_header(startOffset) {
	return new Promise(function(res) {
		var size = Buffer.alloc(2);
		fs.read(read_staticRaw, size, 0, size.length, startOffset, function() {
			var headLen = (size[0] + size[1] * 256) - 2;
			var head = Buffer.alloc(headLen);
			fs.read(read_staticRaw, head, 0, headLen, startOffset + size.length, function() {
				res(head);
			});
		});
	});
}

function staticIdx_full_buffer() {
	return new Promise(function(res, rej) {
		var file = Buffer.alloc(staticIdx_size);
		fs.read(read_staticIdx, file, 0, file.length, 0, function(err) {
			if(err) return rej(err);
			res(file);
		});
	});
}

var static_fileData_queue = [];
var static_fileData_busy = false;
function static_fileData_flush(forced) {
	if(static_fileData_busy && !forced) return;
	static_fileData_busy = true;
	(async function() {
		var queueSize = static_fileData_queue.length;
		try {
			for(var i = 0; i < queueSize; i++) {
				var ar = static_fileData_queue[0];
				static_fileData_queue.shift();
				var data = ar[0];
				var res = ar[1];

				var fdLen = data.length;
				var ptr = await staticRaw_append(data);

				var index = await staticIdx_append(Buffer.from([
					ptr & 255,
					ptr >> 8 & 255,
					ptr >> 16 & 255,
					ptr >> 24 & 255,
					fdLen & 255,
					fdLen >> 8 & 255,
					fdLen >> 16 & 255,
					fdLen >> 24 & 255,
					1]));
				// [uint32, uint32, uint8] -> [offset, size, publicly accessible]
				res(index);
			}
		} catch(e) {
			handle_error(e);
		}
		if(static_fileData_queue.length) {
			static_fileData_flush(true);
		} else {
			static_fileData_busy = false;
		}
	}());
}

function static_fileData_append(data) {
	return new Promise(function(res) {
		static_fileData_queue.push([data, res]);
		static_fileData_flush();
	});
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
setupDatabases();

var static_path = "./frontend/static/";
var static_path_web = "static/";

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
	dump_dir(static_data, static_path, static_path_web, false, null, true);

	console.log("Loading HTML templates...");
	dump_dir(template_data, templates_path, "", true, null, true);

	// clear swig's cache
	swig.invalidateCache();

	console.log("Compiling HTML templates...");
	for(var i in template_data) {
		template_data[i] = swig.compileFile(template_data[i]);
	}
}
load_static();

var sql_table_init = "./backend/default.sql";
var sql_indexes_init = "./backend/indexes.sql";
var sql_edits_init = "./backend/edits.sql";

var zip_file;
function setupZipLog() {
	if(!fs.existsSync(settings.ZIP_LOG_PATH)) {
		zip_file = new zip();
	} else {
		zip_file = new zip(settings.ZIP_LOG_PATH);
	}
	console.log("Handling previous error logs (if any)");
	if(fs.existsSync(settings.LOG_PATH)) {
		var file = fs.readFileSync(settings.LOG_PATH);
		if(file.length > 0) {
			var log_data = fs.readFileSync(settings.LOG_PATH);
			zip_file.addFile("NWOT_LOG_" + Date.now() + ".txt", log_data, "", 0644);
			fs.truncateSync(settings.LOG_PATH);
		}
	}
	zip_file.writeZip(settings.ZIP_LOG_PATH);
}
setupZipLog();

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
		file_list: require("./backend/pages/admin/file_list.js"),
		files: require("./backend/pages/admin/files.js"),
		manage_ranks: require("./backend/pages/admin/manage_ranks.js"),
		monitor: require("./backend/pages/admin/monitor.js"),
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
	well_known: require("./backend/pages/well_known.js"),
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
	paste: require("./backend/websockets/paste.js"),
	protect: require("./backend/websockets/protect.js"),
	write: require("./backend/websockets/write.js"),
	config: require("./backend/websockets/config.js")
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
			if(args == void 0 || args == null) args = []
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
loadDbSystems();

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

var testEmailAddress = "test@local";

async function send_email(destination, subject, text) {
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

var announcement_cache = "";
var bypass_key_cache = "";

async function initialize_server() {
	console.log("Starting server...");

	await initialize_misc_db();
	await initialize_ranks_db();
	await initialize_edits_db();
	
	if(accountSystem == "uvias") {
		await uvias_init();
	}

	if(accountSystem == "local") {
		await loadEmail();
	}
	await initialize_image_db();
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
			account_prompt_uvias();
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

var ranks_cache = {
	users: {}
};
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

prompt.message = ""; // do not display "prompt" before each question
prompt.delimiter = ""; // do not display ":" after "prompt"
prompt.colors = false; // disable dark gray color in a black console

var pw_encryption = "sha512WithRSAEncryption";
const encryptHash = function(pass, salt) {
	if(!salt) {
		var salt = crypto.randomBytes(10).toString("hex");
	}
	var hsh = crypto.createHmac(pw_encryption, salt).update(pass).digest("hex");
	var hash = pw_encryption + "$" + salt + "$" + hsh;
	return hash;
}

const checkHash = function(hash, pass) {
	if(typeof pass !== "string") return false;
	if(typeof hash !== "string") return false;
	hash = hash.split("$");
	if(hash.length !== 3) return false;
	return encryptHash(pass, hash[1]) === hash.join("$");
}

// console function
function add(username, level) {
	level = parseInt(level);
	if(!level) level = 0;
	level = Math.trunc(level);
	if(level < 0) level = 0;
	if(level >= 3) level = 3;
	if(accountSystem != "local") {
		console.log("Cannot register " + username + ":" + level + " because the account system is not local");
		return;
	}
	var Date_ = Date.now();
	ask_password = true;
	account_to_create = username;
	(async function() {
		try {
			await db.run("INSERT INTO auth_user VALUES(null, ?, '', ?, 1, ?, ?, ?)",
				[username, "", level, Date_, Date_]);
		} catch(e) {
			console.log(e);
		}
	})();
}

var prompt_account_yesno = {
	properties: {
		yes_no_account: {
			message: "You just installed the server,\nwhich means you don\'t have any superusers defined.\nWould you like to create one now? (yes/no):"
		}
	}
};

function account_prompt() {
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

	var passFunc = function(err, result) {
		var err = false;
		if(result["password"] !== result["confirmpw"]) {
			console.log("Error: Your passwords didn't match.");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		} else if(result.password.length > 128) {
			console.log("The password is too long. It must be 128 characters or less.");
			err = true;
			prompt.get(prompt_account_properties, passFunc);
		}
		
		if(!err) {
			var Date_ = Date.now();
			var passHash = encryptHash(result["password"]);

			db.run("INSERT INTO auth_user VALUES(null, ?, '', ?, 1, 3, ?, ?)",
				[result["username"], passHash, Date_, Date_]);

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
			start_server();
		}
		if(toUpper(re) !== "YES" && toUpper(re) !== "NO") {
			console.log("Please enter either \"yes\" or \"no\" (not case sensitive):");
			prompt.get(prompt_account_yesno, yesNoAccount);
		}
	}
	prompt.start();
	prompt.get(prompt_account_yesno, yesNoAccount);
}

function account_prompt_uvias() {
	var prompt_account_properties = {
		properties: {
			username: {
				message: "Uvias Display Name: "
			}
		}
	};
	var uvAccountFunc = async function(err, result) {
		var username = result["username"];
		var db_user = await uvias.get("SELECT to_hex(uid) AS uid, username from accounts.users WHERE lower(username)=lower($1::text)", username);
		if(!db_user) {
			console.log("User not found.");
			prompt.get(prompt_account_properties, uvAccountFunc);
			return;
		}
		var uid = "x" + db_user.uid;
		await db_misc.run("INSERT INTO admin_ranks VALUES(?, ?)", [uid, 3]);

		console.log("Account successfully set as superuser.\n");
		start_server();
	}
	yesNoAccount = function(err, result) {
		var re = result["yes_no_account"];
		if(toUpper(re) === "YES") {
			prompt.get(prompt_account_properties, uvAccountFunc);
		}
		if(toUpper(re) === "NO") {
			start_server();
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
var prompt_await = false;

function command_prompt() {
	async function on_input(err, input) {
		if(err) return console.log(err);
		var code = input.input;
		if(code == "stop") {
			return stopServer();
		}
		if(code == "res") {
			return stopServer(true);
		}
		if(code == "maint") {
			return stopServer(false, true);
		}
		if(code == "sta") {
			load_static();
			command_prompt();
			return;
		}
		if(code == "help") {
			console.log("stop: close server\nres: restart\nmaint: maintenance mode\nsta: reload templates and static files");
			command_prompt();
			return;
		}
		if(code.startsWith("acme")) {
			var args = code.split(" ");
			var action = args[1];
			var pass = args[2];
			if(action == "on") {
				var goodPass = true;
				if(!pass || pass.length < 8) goodPass = false;
				if(goodPass) {
					acme.pass = pass;
					acme.enabled = true;
					console.log("Enabled acme with password: " + acmePass);
				} else {
					console.log("Bad acme password");
				}
			} else if(action == "off") {
				acme.enabled = false;
				acme.pass = null;
				console.log("Disabled acme");
			} else {
				console.log("acme command usage:\nacme on <password>: enable acme challenge\nacme off: disable acme challenge");
			}
			command_prompt();
			return;
		}
		// REPL
		try {
			if(prompt_await) {
				eval("var afnc = async function() {return " + code + "};");
				console.dir(await afnc(), { colors: true });
			} else {
				console.dir(eval(code), { colors: true });
			}
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
			[encryptHash(pass), account_to_create]);
		account_to_create = void 0;
		command_prompt();
	}
	if(prompt_stopped) return;
	prompt.start();
	if(!ask_password) {
		prompt.get(prompt_command_input, on_input);
	} else {
		ask_password = false;
		prompt.get(prompt_password_new_account, on_password_input);
	}
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
	[pages.protect, 128],
	[pages.unprotect, 128],
	[pages.protect_char, 512],
	[pages.unprotect_char, 512],
	[pages.coordlink, 512],
	[pages.urllink, 512],
	[pages.yourworld, 512, "POST"]
];

var http_req_holds = {}; // ip/identifier -> {"<index>": {holds: <number>, resp: [<promises>,...]},...}

async function check_http_rate_limit(ip, func, method) {
	var idx = -1;
	var max = 0;
	for(var i = 0; i < http_rate_limits.length; i++) {
		var line = http_rate_limits[i];
		var lf = line[0];
		var lc = line[1];
		var lm = line[2];
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
		func(rate_id);
		lim.resp.splice(0, 1);
	}
	if(!lim.holds && !lim.resp.length) {
		delete obj[rate_id];
	}
}

var url_regexp = [ // regexp ; function/redirection ; options
	[/^favicon\.ico[\/]?$/g, "/static/favicon.png", { no_login: true }],
	[/^robots\.txt[\/]?$/g, "/static/robots.txt", { no_login: true }],
	[/^home[\/]?$/g, pages.home],
	[/^\.well-known\/(.*)/g, pages.well_known, { no_login: true, binary_post_data: true }],

	[/^accounts\/login[\/]?$/g, pages.accounts.login],
	[/^accounts\/logout[\/]?$/g, pages.accounts.logout],
	[/^accounts\/register[\/]?$/g, pages.accounts.register],
	[/^accounts\/profile$/g, "/accounts/profile/"], // ensure there is always an ending slash
	[/^accounts\/profile[\/]?$/g, pages.accounts.profile],
	[/^accounts\/private[\/]?$/g, pages.accounts.private],
	[/^accounts\/configure\/$/g, pages.accounts.configure], // for front page configuring
	[/^accounts\/configure\/(.*)\/$/g, pages.accounts.configure],
	[/^accounts\/member_autocomplete[\/]?$/g, pages.accounts.member_autocomplete],
	[/^accounts\/register\/complete[\/]?$/g, pages.accounts.register_complete],
	[/^accounts\/verify\/(.*)\/$/g, pages.accounts.verify],
	[/^accounts\/download\/$/g, pages.accounts.download], // for front page downloading
	[/^accounts\/download\/(.*)\/$/g, pages.accounts.download],
	[/^accounts\/password_change[\/]?$/g, pages.accounts.password_change],
	[/^accounts\/password_change\/done[\/]?$/g, pages.accounts.password_change_done],
	[/^accounts\/nsfw\/(.*)[\/]?$/g, pages.accounts.nsfw],
	[/^accounts\/tabular[\/]?$/g, pages.accounts.tabular],
	[/^accounts\/verify_email\/(.*)[\/]?$/g, pages.accounts.verify_email],
	[/^accounts\/sso[\/]?$/g, pages.accounts.sso],

	[/^ajax\/protect[\/]?$/g, pages.protect],
	[/^ajax\/unprotect[\/]?$/g, pages.unprotect],
	[/^ajax\/protect\/char[\/]?$/g, pages.protect_char],
	[/^ajax\/unprotect\/char[\/]?$/g, pages.unprotect_char],
	[/^ajax\/coordlink[\/]?$/g, pages.coordlink],
	[/^ajax\/urllink[\/]?$/g, pages.urllink],
	
	[/^administrator\/$/g, pages.admin.administrator],
	[/^administrator\/user\/(.*)\/$/g, pages.admin.user],
	[/^administrator\/users\/by_username\/(.*)[\/]?$/g, pages.admin.users_by_username],
	[/^administrator\/users\/by_id\/(.*)[\/]?$/g, pages.admin.users_by_id],
	[/^administrator\/backgrounds[\/]?$/g, pages.admin.backgrounds, { binary_post_data: true }],
	[/^administrator\/files[\/]?$/g, pages.admin.files, { binary_post_data: true }],
	[/^administrator\/manage_ranks[\/]?$/g, pages.admin.manage_ranks],
	[/^administrator\/set_custom_rank\/(.*)\/$/g, pages.admin.set_custom_rank],
	[/^administrator\/user_list[\/]?$/g, pages.admin.user_list],
	[/^administrator\/file_list[\/]?$/g, pages.admin.file_list],
	[/^administrator\/monitor[\/]?$/g, pages.admin.monitor],
	[/^administrator\/shell[\/]?$/g, pages.admin.shell],
	[/^administrator\/restrictions[\/]?$/g, pages.admin.restrictions, { binary_post_data: true }],

	[/^script_manager\/$/g, pages.script_manager],
	[/^script_manager\/edit\/(.*)\/$/g, pages.script_edit],
	[/^script_manager\/view\/(.*)\/$/g, pages.script_view],
	
	[/^world_style[\/]?$/g, pages.world_style],
	[/^world_props[\/]?$/g, pages.world_props],

	[/^other\/random_color[\/]?$/g, pages.other.random_color, { no_login: true }],
	[/^other\/backgrounds\/(.*)[\/]?$/g, pages.other.load_backgrounds, { no_login: true }],
	[/^other\/test\/(.*)[\/]?$/g, pages.other.test, { no_login: true }],
	[/^other\/ipaddress[\/]?$/g, pages.other.ipaddress],

	[/^static\/(.*)[\/]?$/g, pages.static, { no_login: true }],
	[/^static[\/]?$/g, pages.static, { no_login: true }],

	[/^([\w\/\.\-\~]*)$/g, pages.yourworld, { remove_end_slash: true }],

	[/./gs, pages["404"]]
];

/*
	dispatch page
	usage: this is to be used in the page modules when
	the module wants to dispatch a different page module.
	EG: return dispage("404", { extra parameters for page }, req, serve, vars, evars, "POST")
	EG: return dispage("accounts/login", { extra parameters for page }, req, serve, vars, evars)
	(req, serve, and vars should already be defined by the parameters)
*/
async function dispage(page, params, req, serve, vars, evars, method) {
	if(!method || !valid_method(method)) {
		method = "GET";
	}
	method = method.toUpperCase();
	if(!params) {
		params = {};
	}
	if(!vars) {
		vars = {};
	}
	var pageObj = pages;
	page = page.split("/");
	for(var i = 0; i < page.length; i++) {
		pageObj = pageObj[page[i]];
	}
	await pageObj[method](req, serve, vars, evars, params);
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

var restrictions = {};
var coalition = {
	v4: [],
	v6: []
};
function setRestrictions(obj) {
	restrictions = obj;
}
function getRestrictions() {
	return restrictions;
}
function setCoalition(list) {
	coalition = list;
}
function checkCoalition(val, fam) {
	var list = null;
	if(fam == 4) {
		list = coalition.v4;
	} else if(fam == 6) {
		list = coalition.v6;
	} else {
		return false;
	}
	if(!list.length) return false;
	var posa = 0;
	var posb = list.length - 1;
	// binary search through the list
	for(var i = 0; i < list.length; i++) {
		var pos = Math.floor((posa + posb) / 2);
		var item = list[pos];
		var a = item[0];
		var b = item[1];
		if(a <= val && b >= val) return true;
		if(posb - posa == 1) {
			var ra = list[posa];
			var rb = list[posb];
			if(ra[0] <= val && ra[1] >= val) return true;
			if(rb[0] <= val && rb[1] >= val) return true;
			return false;
		}
		if(a > val) {
			if(posb - posa == 0) return false;
			posb = pos - 1;
			continue;
		}
		if(b < val) {
			if(posb - posa == 0) return false;
			posa = pos + 1;
			continue;
		}
	}
	return false;
}

function new_token(len) {
	var token = crypto.randomBytes(len).toString("hex");
	return token;
}

var https_reference = https;
var prev_cS = http.createServer; // previous reference to http.createServer
var https_disabled;

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
			return prev_cS(func);
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
manage_https();

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

// return "s" or not depending on the quantity
function plural(int, plEnding) {
	var p = "";
	if(int != 1) {
		p = !plEnding ? "s" : plEnding;
	}
	return p;
}

process.on("uncaughtException", function(e) {
	try {
		err = JSON.stringify(process_error_arg(e));
		err = "TIME: " + Date.now() + "\r\n" + err + "\r\n" + "-".repeat(20) + "\r\n\r\n\r\n";
		fs.appendFileSync(settings.UNCAUGHT_PATH, err);
	} catch(e) {
		console.log("Error while recording uncaught error", e);
	}
	console.log("Uncaught error:", e);
	process.exit(-1);
});

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
				err500Temp = template_data["500.html"]();
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
setupHTTPServer();

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
	var cookiesToReturn = [];
	function dispatch(data, status_code, params) {
		if(requestResolved) return; // if request response is already sent
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
		if(requestResolved) return;
		requestResolved = true;
		res.end();
	}
	dispatch.writeStream = function(data) {
		if(requestResolved) return;
		if(!requestStreaming) return;
		return new Promise(function(resolve) {
			res.write(data, resolve);
			periodHTTPOutboundBytes += data.length;
		});
	}
	return dispatch;
}

var valid_subdomains = ["test"];

async function process_request(req, res, compCallbacks) {
	if(!serverLoaded) await waitForServerLoad();
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

	var dispatch = createDispatcher(res, {
		encoding: acceptEncoding,
		gzip: gzipEnabled
	});

	var page_resolved = false;
	for(var i in url_regexp) {
		var pattern = url_regexp[i];
		var urlReg = pattern[0];
		var pageRes = pattern[1];
		var options = pattern[2];
		if(!options) options = {};

		var no_login = options.no_login;
		var binary_post_data = options.binary_post_data;
		var remove_end_slash = options.remove_end_slash;

		/*
		TODO: refactor
		possible options: no_login; binary_post_data; remove_end_slash
		*/
		if(URL.match(urlReg)) {
			page_resolved = true;
			if(typeof pageRes == "object") {
				var method = req.method.toUpperCase();
				var rate_id = await check_http_rate_limit(ipAddress, pageRes, method);
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
				function HTML(path, data) {
					if(!template_data[path]) { // template not found
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
					return template_data[path](data);
				}
				var evars = { // request-specific variables
					cookies,
					post_data,
					query_data,
					path: URL_mod,
					user,
					referer: req.headers.referer,
					broadcast: global_data.ws_broadcast,
					HTML,
					ipAddress,
					ipAddressFam,
					ipAddressVal,
					setCallback: function(cb) {
						compCallbacks.push(cb);
					}
				};
				var pageStat;
				if(pageRes[method] && valid_method(method)) {
					// Return the page
					pageStat = await pageRes[method](req, dispatch, global_data, evars, {});
				} else {
					dispatch("Method " + method + " not allowed.", 405);
				}
				if(rate_id != -1) {
					release_http_rate_limit(ipAddress, rate_id);
				}
				if(pageStat === -1) continue;
			} else if(typeof pageRes == "string") { // redirection
				dispatch(null, null, { redirect: pageRes });
			} else {
				page_resolved = false; // 404 not found
			}
			break;
		}
	}

	if(!page_resolved || !dispatch.isResolved()) {
		return dispatch("HTTP 404: The resource cannot be found", 404);
	}

	res.writeHead(404);
	res.end();
}

async function MODIFY_ANNOUNCEMENT(text) {
	if(!text) text = "";
	text += "";
	announcement_cache = text;

	var element = await db.get("SELECT value FROM server_info WHERE name='announcement'");
	if(!element) {
		await db.run("INSERT INTO server_info values('announcement', ?)", text);
	} else {
		await db.run("UPDATE server_info SET value=? WHERE name='announcement'", text);
	}
	global_data.ws_broadcast({
		kind: "announcement",
		text: text
	});
}

function modify_bypass_key(key) {
	key += "";
	if(bypass_key_cache === key) return false;
	fs.writeFileSync(settings.bypass_key, key);
	bypass_key_cache = key;
	return true;
}

// command-line only
function announce(text) {
	(async function() {
		await MODIFY_ANNOUNCEMENT(text);
		console.log("Updated announcement");
	})();
}

var worldData = {};
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
	if(!global_data.ws_broadcast) return;
	for(var id in worldData) {
		var worldObj = worldData[id];
		var current_count = worldObj.display_user_count;
		var new_count = worldObj.user_count;
		if(current_count != new_count) {
			worldObj.display_user_count = new_count;
			global_data.ws_broadcast({
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
	// clear expires sessions
	await db.run("DELETE FROM auth_session WHERE expire_date <= ?", Date.now());
	// clear expired registration keys
	await db.each("SELECT id FROM auth_user WHERE is_active=0 AND ? - date_joined >= ? AND (SELECT COUNT(*) FROM registration_registrationprofile WHERE user_id=auth_user.id) > 0",
		[Date.now(), ms.day * settings.activation_key_days_expire], async function(data) {
		var id = data.id;
		await db.run("DELETE FROM registration_registrationprofile WHERE user_id=?", id);
	});

	if(!no_timeout) intv.clearExpiredSessions = setTimeout(clear_expired_sessions, ms.minute);
}

var client_cursor_pos = {};
var client_ips = {};
var closed_client_limit = 1000 * 60 * 20; // 20 min
function setupClearClosedClientsInterval() {
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

async function uviasSendIdentifier() {
	await uvias.run("SELECT accounts.set_service_info($1::text, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::boolean, $8::boolean, $9::text);",
		[uvias.id, uvias.name, uvias.domain, uvias.sso, uvias.logout, process.pid, uvias.private, uvias.only_verified, uvias.custom_css_file_path]);
	console.log("Sent service identifier");
}

async function uvias_init() {
	makePgClient();

	console.log("Connecting to account database...");
	await pgConn.connect();
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

async function loadAnnouncement() {
	announcement_cache = await db.get("SELECT value FROM server_info WHERE name='announcement'");
	if(!announcement_cache) {
		announcement_cache = "";
	} else {
		announcement_cache = announcement_cache.value;
	}
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

var wss;
async function initialize_server_components() {
	await loadAnnouncement();

	bypass_key_cache = fs.readFileSync(settings.bypass_key).toString("utf8");

	intv.userCount = setInterval(function() {
		broadcastUserCount();
	}, 2000);

	intv.traff_mon_net_interval = setInterval(function() {
		if(!monitorEventSockets.length) {
			periodHTTPOutboundBytes = 0;
			periodHTTPInboundBytes = 0;
			periodWSOutboundBytes = 0;
			periodWSInboundBytes = 0;
			return;
		}
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
				if(!ws.sdata.userClient) return;
				if(ws.sdata.messageBackpressure > 1) {
					broadcastMonitorEvent("Backpressure", "Warning - backpressure of " + ws.sdata.messageBackpressure + " (" + ws.sdata.ipAddress + ")");
				}
			});
		}
	}, 1000);

	setupClearClosedClientsInterval();

	if(accountSystem == "local") {
		await clear_expired_sessions();
	}

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
		perMessageDeflate: true
	});
	global_data.wss = wss;

	var ws_broadcast = function(data, world_id, opts) {
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
						if(client.sdata.chat_blocks && (client.sdata.chat_blocks.indexOf(opts.clientId) > -1 ||
							((client.sdata.chat_blocks.indexOf("*") > -1) && opts.clientId != 0))) return;
					}
					wsSend(client, data);
				}
			} catch(e) {
				handle_error(e);
			}
		});
	}

	global_data.ws_broadcast = ws_broadcast;

	wss.on("connection", async function(ws, req) {
		try {
			manageWebsocketConnection(ws, req);
		} catch(e) {
			// failed to initialize
			handle_error(e);
		}
	});

	// initialize the subsystems (tile database; chat manager)
	await sysLoad();

	// initialize variables in page handlers
	await sintLoad(pages);

	serverLoaded = true;
	for(var i = 0; i < serverLoadWaitQueue.length; i++) {
		serverLoadWaitQueue[i]();
	}
}

var serverLoadWaitQueue = [];
function waitForServerLoad() {
	return new Promise(function(res) {
		serverLoadWaitQueue.push(res);
	});
}

var monitorEventSockets = [];
function sendMonitorEvents(ws) {
	monitorEventSockets.push(ws);
}
function removeMonitorEvents(ws) {
	var idx = monitorEventSockets.indexOf(ws);
	if(idx > -1) {
		monitorEventSockets.splice(idx, 1);
	}
}
function broadcastMonitorEvent(type, data) {
	if(!monitorEventSockets.length) return;
	for(var i = 0; i < monitorEventSockets.length; i++) {
		var sock = monitorEventSockets[i];
		var str = "[" + type + "] " + data;
		wsSend(sock, str);
	}
}

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
				} else {
					ipAddressFam = 6;
					ipAddress = normalize_ipv6(ipAddress);
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
				} else {
					ipAddressFam = 6;
					ipAddress = normalize_ipv6(ipAddress);
				}
			}
		}
	}
	return [ipAddress, ipAddressFam, ipAddressVal];
}

// {ip: count}
var ip_address_conn_limit = {};
// {ip: ws_limits}
var ip_address_req_limit = {}; // TODO: Cleanup objects

var ws_req_per_second = 1000;
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
	paste:			[10, 500, 0],
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

var connections_per_ip = 32;
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
		if(ws.sdata.monitorSocket) return;
		if(ws.sdata.terminated) return;
		if(!ws.sdata.session_key) return; // safety layer: don't process unauthenticated clients
		if(ws.sdata.session_key != session_token) return;
		ws.sdata.terminated = true;
		ws.close();
	});
}

async function manageWebsocketConnection(ws, req) {
	if(!serverLoaded) await waitForServerLoad();
	if(isStopping) return;
	ws.sdata = {
		userClient: false,
		monitorSocket: false,
		terminated: false,
		hasBroadcastedCursorPosition: false,
		cursorPositionHidden: false,
		messageBackpressure: 0,
		receiveContentUpdates: true,
		origin: req.headers["origin"]
	};

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
	// TODO: querystring is deprecated?

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
	var parsedURL = url.parse(req.url);
	var location = parsedURL.pathname;
	var search = querystring.parse(parsedURL.query);
	if(location == "/administrator/monitor/ws/") {
		var cookies = parseCookie(req.headers.cookie);
		var user = await get_user_info(cookies, true);
		if(!user.superuser) {
			return ws.close();
		}
		sendMonitorEvents(ws);
		ws.on("close", function() {
			remove_ip_address_connection(ws.sdata.ipAddress);
			removeMonitorEvents(ws);
		});
		ws.sdata.monitorSocket = true;
		var msCount = 0;
		wss.clients.forEach(function(msock) {
			if(!msock.sdata) return;
			if(msock.sdata.monitorSocket) {
				msCount++;
			}
		});
		broadcastMonitorEvent("Server", msCount + " listening sockets, " + monitorEventSockets.length + " listeners");
		return;
	}
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
			global_data.ws_broadcast({
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

	var world_name = "";
	if(location.match(/(\/ws\/$)/)) {
		world_name = location.replace(/(^\/)|(\/ws\/)|(ws\/$)/g, "");
	} else {
		return error_ws("INVALID_ADDR", "Invalid address");
	}

	var cookies = parseCookie(req.headers.cookie);
	var user = await get_user_info(cookies, true);
	if(ws.sdata.terminated) return;
	var channel = new_token(7);
	ws.sdata.channel = channel;

	var vars = global_data;
	var evars = {
		user, channel,
		keyQuery: search.key
	};

	if(search.hide == "1") {
		ws.sdata.hide_user_count = true;
	}

	world = await getOrCreateWorld(world_name);
	if(ws.sdata.terminated) return;
	if(!world) {
		return error_ws("NO_EXIST", "World does not exist");
	}

	var memkeyAccess = search.key && search.key == world.opts.memKey;

	var permission = await canViewWorld(world, user, { memkeyAccess });
	if(ws.sdata.terminated) return;
	if(!permission) {
		return error_ws("NO_PERM", "No permission");
	}

	ws.sdata.userClient = true; // client connection is now initialized
	ws.sdata.keyQuery = search.key;
	
	evars.world = world;

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
	ws.sdata.chat_blocks = [];

	if(monitorEventSockets.length) {
		broadcastMonitorEvent("Connect", ws.sdata.ipAddress + ", [" + clientId + ", '" + channel + "'] connected to world ['" + world.name + "', " + world.id + "]");
	}

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
	// Log all ws and http requests (incl. duration) to analyze attacks
	ws.off("message", pre_message);
	ws.on("message", handle_message);
	async function handle_message(msg) {
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
		if(msg.startsWith("2::")) { // TODO: remove this (obsolete ping)
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
		// Parse request
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
		if(websockets.hasOwnProperty(kind)) {
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
				global_data.ws_broadcast(data, world.id, opts);
			}
			var res;
			var resError = false;
			try {
				res = await websockets[kind](ws, msg, send, vars, objIncludes(evars, {
					broadcast,
					clientId: ws.sdata.clientId, // TODO: does all this need to be joined in with evars?
					ws // to be passed on to modules
				}));
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

function start_server() {
	initialize_server_components().catch(function(e) {
		console.log("An error occurred during component initialization");
		console.log(e);
	});
}

var global_data = {
	wsSend,
	createCSRF,
	checkCSRF,
	memTileCache,
	isTestServer,
	shellEnabled,
	announcement: function() { return announcement_cache },
	get_bypass_key: function() { return bypass_key_cache },
	add_background_cache: pages.other.load_backgrounds.add_cache, // TODO: move 'add_cache' somewhere else
	template_data,
	uvias,
	accountSystem,
	db,
	db_img,
	db_misc,
	db_edits,
	db_ch,
	dispage,
	ms,
	http_time,
	checkHash,
	encryptHash,
	new_token,
	querystring,
	url,
	split_limit,
	website: settings.website,
	send_email,
	filename_sanitize,
	checkURLParam,
	create_date,
	get_user_info,
	getOrCreateWorld,
	canViewWorld,
	san_nbr,
	san_dp,
	tile_coord,
	modules,
	plural,
	announce: MODIFY_ANNOUNCEMENT,
	uptime,
	encodeCharProt,
	decodeCharProt,
	advancedSplit,
	change_char_in_array,
	html_tag_esc,
	wss, // this is undefined by default, but will get a value once wss is initialized
	topActiveWorlds,
	NCaseCompare,
	handle_error,
	client_ips,
	modify_bypass_key,
	trimHTML,
	tile_database: subsystems.tile_database,
	tile_fetcher: subsystems.tile_fetcher,
	chat_mgr: subsystems.chat_mgr,
	intv,
	WebSocket,
	fixColors,
	sanitize_color,
	ranks_cache,
	static_data,
	staticRaw_append,
	staticIdx_append,
	static_retrieve,
	static_fileData_append,
	stopServer,
	testEmailAddress,
	staticIdx_full_buffer,
	static_retrieve_raw_header,
	broadcastMonitorEvent,
	monitorEventSockets,
	arrayIsEntirely,
	normalizeCacheTile,
	parseTextcode,
	acme,
	uviasSendIdentifier,
	client_cursor_pos,
	setRestrictions,
	getRestrictions,
	setCoalition,
	checkCoalition,
	modifyWorldProp,
	sanitizeWorldname,
	fetchWorldMembershipsByUserId,
	claimWorldByName,
	revokeMembershipByWorldName,
	fetchOwnedWorldsByUserId,
	promoteMembershipByWorldName,
	renameWorld,
	ipv4_to_range,
	ipv6_to_range,
	checkDuplicateCookie,
	releaseWorld,
	loadShellFile,
	process_error_arg,
	runShellScript,
	rate_limiter,
	getClientVersion,
	setClientVersion
};

async function sysLoad() {
	// initialize variables in the subsystems
	for(var i in subsystems) {
		var sys = subsystems[i];
		await sys.main(global_data);
	}
}

async function sintLoad(obj) {
	// if page modules contain a startup function, run it
	for(var i in obj) {
		var mod = obj[i];
		var isPage = mod.GET || mod.POST; // XXX
		if(isPage) {
			if(mod.startup_internal) {
				await mod.startup_internal(global_data);
			}
		} else {
			await sintLoad(mod);
		}
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
			sendProcMsg("MAINT");
		}
	})();
}

// start the server
initialize_server().catch(function(e) {
	console.log("An error occurred during the initialization process:");
	console.log(e);
});