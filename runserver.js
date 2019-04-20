/*
**  Our World of Text
**  Est. November 19, 2016
**  Reprogrammed September 17, 2017
**  Released and renamed October 10, 2017
**  This is the main file
*/

console.log("\x1b[36;1mStarting up...\x1b[0m");

const chat_mgr    = require("./backend/utils/chat_mgr.js");
const crypto      = require("crypto");
const dump_dir    = require("./backend/dump_dir");
const fs          = require("fs");
const http        = require("http");
const https       = require("https");
const isIP        = require("net").isIP;
const nodemailer  = require("nodemailer");
const path        = require("path");
const pg          = require("pg");
const prompt      = require("./lib/prompt/prompt");
const querystring = require("querystring");
const sql         = require("sqlite3");
const swig        = require("swig");
const url         = require("url");
const utils       = require("./backend/utils/utils.js");
const WebSocket   = require("ws");
const zip         = require("adm-zip");
const zlib        = require("zlib");

var trimHTML             = utils.trimHTML;
var create_date          = utils.create_date;
var san_nbr              = utils.san_nbr;
var toUpper              = utils.toUpper;
var NCaseCompare         = utils.NCaseCompare;
var split_limit          = utils.split_limit;
var get_third            = utils.get_third;
var get_fourth           = utils.get_fourth;
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
var insert_char_at_index = utils.insert_char_at_index;
var html_tag_esc         = utils.html_tag_esc;
var sanitize_color       = utils.sanitize_color;
var fixColors            = utils.fixColors;
var parseAcceptEncoding  = utils.parseAcceptEncoding;

var prepare_chat_db     = chat_mgr.prepare_chat_db;
var init_chat_history   = chat_mgr.init_chat_history;
var retrieveChatHistory = chat_mgr.retrieveChatHistory;
var add_to_chatlog      = chat_mgr.add_to_chatlog;
var clearChatlog        = chat_mgr.clearChatlog;
var updateChatLogData   = chat_mgr.updateChatLogData;

var gzipEnabled = true;

// Global
CONST = {};
CONST.tileCols = 16;
CONST.tileRows = 8;
CONST.tileArea = CONST.tileCols * CONST.tileRows;

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
    sendProcMsg("EXIT");
    process.exit();
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

var cloudflare_ipv4_txt = fs.readFileSync("./backend/cloudflare_ipv4.txt").toString();
var cloudflare_ipv6_txt = fs.readFileSync("./backend/cloudflare_ipv6.txt").toString();

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

function handle_error(e) {
    var str = JSON.stringify(process_error_arg(e));
    log_error(str);
    if(isTestServer) {
        console.log("Error:", str);
    }
}

// console function
function run(path) {
    eval(fs.readFileSync(path).toString("utf8"));
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

if(accountSystem != "uvias" && accountSystem != "local") {
    console.log("ERROR: Invalid account system: " + accountSystem);
    sendProcMsg("EXIT");
    process.exit();
}

var pgClient = pg.Client;
var pgConn;
if(accountSystem == "uvias") {
    pg.defaults.user = "fp";
    pg.defaults.host = "/var/run/postgresql";
    pg.defaults.database = "uvias";
    pgConn = new pgClient({
        connectionString: "pg://"
    });
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

uvias.id = "owottest";
uvias.name = "Our World Of Text Test Server";
uvias.domain = "testserver1.ourworldoftext.com";
uvias.sso = "/accounts/sso";
uvias.logout = "/home/";
uvias.loginPath = "https://uvias.com/api/loginto/" + uvias.id;
uvias.logoutPath = "https://uvias.com/logoff?service=" + uvias.id;
uvias.registerPath = "https://uvias.com/api/loginto/" + uvias.id;
if(accountSystem == "uvias") {
    loginPath = uvias.loginPath;
    logoutPath = uvias.logoutPath;
    registerPath = uvias.registerPath;
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

Error.stackTraceLimit = Infinity;
if(!global.AsyncFunction) var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

var isTestServer = false;

var intv = {}; // intervals and timeouts

var args = process.argv;
args.forEach(function(a) {
    if(a == "--test-server") {
        console.log("\x1b[32;1mThis is a test server\x1b[0m");
        isTestServer = true;
        serverPort = settings.test_port;
        serverDB = settings.TEST_DATABASE_PATH;
        chatDB = settings.TEST_CHAT_HISTORY_PATH;
        imageDB = settings.TEST_IMAGES_PATH;
        miscDB = settings.TEST_MISC_PATH;
        editsDB = settings.TEST_EDITS_PATH;
        settings.LOG_PATH = settings.TEST_LOG_PATH;
        settings.ZIP_LOG_PATH = settings.TEST_ZIP_LOG_PATH;
        settings.UNCAUGHT_PATH = settings.TEST_UNCAUGHT_PATH;
        settings.REQ_LOG_PATH = settings.TEST_REQ_LOG_PATH;
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
            console.log("Error logging error:", e);
        }
    }
}

var write_reqLog;
var reqLogBuffer = [];
function flushReqLogBuffer(stop) {
    if(isStopping && !stop) return;
    if(!reqLogBuffer.length) {
        if(!stop) intv.flushReqLogBuffer = setTimeout(flushReqLogBuffer, 1000 * 5);
        return;
    }
    var bdata = reqLogBuffer.join("\n") + "\n";
    reqLogBuffer.splice(0);
    write_reqLog.write(bdata, function() {
        if(!stop) intv.flushReqLogBuffer = setTimeout(flushReqLogBuffer, 1000 * 5);
    });
}
function beginReqLog() {
    write_reqLog = fs.createWriteStream(settings.REQ_LOG_PATH, { flags: "a" });
    flushReqLogBuffer();
}
function doLogReq(data) {
    reqLogBuffer.push(data);
}

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

var read_staticRaw = fs.openSync(staticFilesRaw, "r");
var write_staticRaw = fs.createWriteStream(staticFilesRaw, { flags: "a" });
var read_staticIdx = fs.openSync(staticFilesIdx, "r");
var write_staticIdx = fs.createWriteStream(staticFilesIdx, { flags: "a" });

var staticRaw_size = fs.statSync(staticFilesRaw).size;
var staticIdx_size = fs.statSync(staticFilesIdx).size;

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
    if(!accessible) return res(null);
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

const database = new sql.Database(serverDB);
const edits_db = new sql.Database(editsDB);
const chat_history = new sql.Database(chatDB);
const image_db = new sql.Database(imageDB);
const misc_db = new sql.Database(miscDB);

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
    dump_dir(static_data, static_path, static_path_web, null);

    console.log("Loading HTML templates...");
    dump_dir(template_data, templates_path, "", true);

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

// load all modules from directory. EG: "test.js" -> "test"
function load_modules(default_dir) {
    var pages = fs.readdirSync(default_dir);
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
                    r(res);
                })
            })
        },
        // runs a command (insert, update, etc...) and might return "lastID" if needed
        run: async function(command, params) {
            if(params == void 0 || params == null) params = [];
            var err = false;
            return new Promise(function(r, rej) {
                database.run(command, params, function(err, res) {
                    if(err) {
                        return rej({
                            sqlite_error: process_error_arg(err),
                            input: { command, params }
                        });
                    }
                    var info = {
                        lastID: this.lastID
                    }
                    r(info);
                })
            })
        },
        // gets multiple rows in one command
        all: async function(command, params) {
            if(params == void 0 || params == null) params = [];
            return new Promise(function(r, rej) {
                database.all(command, params, function(err, res) {
                    if(err) {
                        return rej({
                            sqlite_error: process_error_arg(err),
                            input: { command, params }
                        });
                    }
                    r(res);
                })
            })
        },
        // get multiple rows but execute a function for every row
        each: async function(command, params, callbacks) {
            if(typeof params == "function") {
                callbacks = params;
                params = [];
            }
            var def = callbacks;
            var callback_error = false;
            var cb_err_desc = "callback_error...";
            callbacks = function(e, data) {
                try {
                    def(data);
                } catch(e) {
                    callback_error = true;
                    cb_err_desc = e;
                }
            }
            return new Promise(function(r, rej) {
                database.each(command, params, callbacks, function(err, res) {
                    if(err) return rej({
                        sqlite_error: process_error_arg(err),
                        input: { command, params }
                    });
                    if(callback_error) return rej(cb_err_desc);
                    r(res);
                })
            })
        },
        // like run, but executes the command as a SQL file
        // (no comments allowed, and must be semicolon separated)
        exec: async function(command) {
            return new Promise(function(r, rej) {
                database.exec(command, function(err) {
                    if(err) {
                        return rej({
                            sqlite_error: process_error_arg(err),
                            input: { command }
                        });
                    }
                    r(true);
                })
            })
        }
    };
    return db;
}

const db = asyncDbSystem(database);
const db_edits = asyncDbSystem(edits_db);
const db_ch = asyncDbSystem(chat_history);
const db_img = asyncDbSystem(image_db);
const db_misc = asyncDbSystem(misc_db);

prepare_chat_db({ db, db_ch, intv, handle_error });

var transporter;
var email_available = true;

async function loadEmail() {
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
    })
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
    if(accountSystem == "local") {
        await loadEmail();
    }
    await init_chat_history();
    await init_image_database();
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
        account_prompt();
    }
    if(!init) {
        start_server();
    }
};

function sendProcMsg(msg) {
    if(process.send) {
        process.send(msg);
    }
};

(async function() {
    try {
        await initialize_server();
    } catch(e) {
        console.log("An error occurred during the initialization process:");
        console.log(e);
    }
})();

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

var ranks_cache = {
    users: {}
}
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
        }
        ranks_cache.ids.push(id);
    }
    ranks_cache.count = ranks.length;
    for(var i = 0; i < user_ranks.length; i++) {
        var ur = user_ranks[i];
        ranks_cache.users[ur.userid] = ur.rank;
    }
}

prompt.message   = ""; // do not display "prompt" before each question
prompt.delimiter = ""; // do not display ":" after "prompt"
prompt.colors    = false; // disable dark gray color in a black console

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
}

var prompt_account_yesno = {
    properties: {
        yes_no_account: {
            message: "You just installed the server,\nwhich means you don\'t have any superusers defined.\nWould you like to create one now? (yes/no):"
        }
    }
}

var pw_encryption = "sha512WithRSAEncryption";
const encryptHash = function(pass, salt) {
    if(!salt) {
        var salt = crypto.randomBytes(10).toString("hex");
    }
    var hsh = crypto.createHmac(pw_encryption, salt).update(pass).digest("hex");
    var hash = pw_encryption + "$" + salt + "$" + hsh;
    return hash;
};

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

function account_prompt() {
    passFunc = function(err, result) {
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

var prompt_command_input = {
    properties: {
        input: {
            message: ">>"
        }
    }
}

var prompt_password_new_account = {
    properties: {
        password: {
            message: "Enter password for this account: ",
            replace: "*",
            hidden: true
        }
    }
}

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
    ["^favicon\.ico[\\/]?$", "/static/favicon.png", { no_login: true }],
    ["^robots.txt[\\/]?$", "/static/robots.txt", { no_login: true }],
    ["^home[\\/]?$", pages.home],

    ["^accounts/login[\\/]?", pages.login],
    ["^accounts/logout[\\/]?", pages.logout],
    ["^accounts/register[\\/]?$", pages.register],
    ["^accounts/profile[\\/]?$", pages.profile],
    ["^accounts/private[\\/]?$", pages.private],
    ["^accounts/configure[\\/]?$", pages.configure], // for front page configuring
    ["^accounts/configure/(.*)/$", pages.configure],
    ["^accounts/configure/(beta/\\w+)/$", pages.configure],
    ["^accounts/member_autocomplete[\\/]?$", pages.member_autocomplete],
    ["^accounts/timemachine/(.*)/$", pages.timemachine],
    ["^accounts/register/complete[\\/]?$", pages.register_complete],
    ["^accounts/verify/(.*)/$", pages.verify],
    ["^accounts/download/$", pages.accounts_download], // for front page downloading
    ["^accounts/download/(.*)/$", pages.accounts_download],
    ["^accounts/password_change[\\/]?$", pages.password_change],
    ["^accounts/password_change/done[\\/]?$", pages.password_change_done],
    ["^accounts/nsfw/(.*)[\\/]?$", pages.accounts_nsfw],
    ["^accounts/tabular[\\/]?$", pages.accounts_tabular],
    ["^accounts/verify_email/(.*)[\\/]?$", pages.accounts_verify_email],
    ["^accounts/sso[\\/]?$", pages.sso],

    ["^ajax/protect[\\/]?$", pages.protect],
    ["^ajax/unprotect[\\/]?$", pages.unprotect],
    ["^ajax/protect/char[\\/]?$", pages.protect_char],
    ["^ajax/unprotect/char[\\/]?$", pages.unprotect_char],
    ["^ajax/coordlink[\\/]?$", pages.coordlink],
    ["^ajax/urllink[\\/]?$", pages.urllink],
    
    ["^administrator/$", pages.administrator],
    ["^administrator/edits/$", pages.administrator_edits], // for front page downloading
    ["^administrator/edits/(.*)/$", pages.administrator_edits],
    ["^administrator/user/(.*)/$", pages.administrator_user],
    ["^administrator/users/by_username/(.*)[\\/]?$", pages.administrator_users_by_username],
    ["^administrator/users/by_id/(.*)[\\/]?$", pages.administrator_users_by_id],
    ["^administrator/world_restore[\\/]?$", pages.administrator_world_restore],
    ["^administrator/backgrounds[\\/]?$", pages.administrator_backgrounds, { binary_post_data: true }],
    ["^administrator/files[\\/]?$", pages.administrator_files, { binary_post_data: true }],
    ["^administrator/manage_ranks[\\/]?$", pages.administrator_manage_ranks],
    ["^administrator/set_custom_rank/(.*)/$", pages.administrator_set_custom_rank],
    ["^administrator/user_list[\\/]?$", pages.administrator_user_list],
    ["^administrator/file_list[\\/]?$", pages.administrator_file_list],
    ["^administrator/monitor[\\/]?$", pages.monitor],

    ["^script_manager/$", pages.script_manager],
    ["^script_manager/edit/(.*)/$", pages.script_edit],
    ["^script_manager/view/(.*)/$", pages.script_view],
    
    ["^world_style[\\/]?$", pages.world_style],

    ["^other/random_color[\\/]?$", pages.random_color, { no_login: true }],
    ["^other/backgrounds/(.*)[\\/]?$", pages.load_backgrounds, { no_login: true }],
    ["^other/chat/(.*)[\\/]?$", pages.other_chat],
    ["^other/test/(.*)[\\/]?$", pages.other_test, { no_login: true }],
    ["^other/forums/(.*)[\\/]?$", pages.other_forums, { no_login: true }],
    ["^other/serverrequeststatus/(.*)[\\/]?$", pages.other_serverrequeststatus, { no_login: true }],
    ["^other/info/(.*)[\\/]?$", pages.other_info, { no_login: true }],
    ["^other/cd/(.*)[\\/]?$", pages.other_cd, { no_login: true }],
    ["^other/ipaddress[\\/]?$", pages.ipaddress],

    ["^static/(.*)[\\/]?$", pages.static, { no_login: true }],
    ["^static\\?file=(.*)[\\/]?$", pages.static, { no_login: true, check_query: true }],

    ["^([\\w\\/\\.\\-\\~]*)$", pages.yourworld, { remove_end_slash: true }]
];

/*
    dispatch page
    usage: this is to be used in the page modules when
    the module wants to dispatch a different page module.
    EG: return dispage("404", { extra parameters for page }, req, serve, vars, "POST")
    (req, serve, and vars should already be defined by the parameters)
    ("POST" is only needed if you need to post something. otherwise, don't include anything)
*/
async function dispage(page, params, req, serve, vars, method) {
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
    await pages[page][method](req, serve, vars, params);
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
                if(data.length <= 250000) { // limit of individual packets
                    if(binary_post_data) {
                        queryData = Buffer.concat([queryData, data]);
                    } else {
                        queryData += data;
                    }
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
    })
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
        var s_data = await db.get("SELECT * FROM auth_session WHERE session_key=?", 
            cookies.sessionid);
        if(s_data) {
            user = JSON.parse(s_data.session_data);
            if(cookies.csrftoken == user.csrftoken) { // verify csrftoken
                user.authenticated = true;
                var userauth = (await db.get("SELECT level, is_active, email FROM auth_user WHERE id=?", user.id));
                var level = userauth.level;
                user.is_active = !!userauth.is_active;
                user.email = userauth.email;

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

    if(accountSystem == "uvias" && cookies.token) {
        var parsed = await uvias.get("SELECT * FROM accounts.parse_token($1::VARCHAR(41))", cookies.token);
        var uid = parsed.uid;
        var session_id = parsed.session_id;
        var session = await uvias.get("SELECT * FROM accounts.get_session($1::bigint, $2::bytea)", [uid, session_id]);
        if(session) {
            var user_account = await uvias.get("SELECT to_hex(uid) as uid, username, rank_id FROM accounts.users WHERE uid=$1::bigint", uid);
            if(user_account) {
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
                
                var rank_data = await db_misc.get("SELECT level FROM admin_ranks WHERE id=?", [user.id]);
                if(rank_data) {
                    var level = rank_data.level;

                    var operator = level == 3;
                    var superuser = level == 2;
                    var staff = level == 1;

                    user.operator = operator;
                    user.superuser = superuser || operator;
                    user.staff = staff || superuser || operator;
                }

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

function is_unclaimable_worldname(world) {
    if(!world) return false;
    world = world.split("/");
    if(world.length < 2) return false;
    if(!(world[0] == "w" || world[0] == "W")) return false;
    for(var i = 0; i < world.length; i++) {
        var seg = world[i];
        if(!seg.match(/^([\w\.\-]*)$/g) || !seg) return false;
    }
    return true;
}

async function world_get_or_create(name, do_not_create, force_create) {
    name += "";
    if(typeof name != "string") name = "";
    if(name.length > 10000) {
        do_not_create = true;
    }
    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", name);
    if(!world) { // world doesn't exist, create it
        if(((name.match(/^([\w\.\-]*)$/g) || is_unclaimable_worldname(name)) && !do_not_create) || force_create) {
            var date = Date.now();
            var rw = await db.run("INSERT INTO world VALUES(null, ?, null, ?, 2, 0, 0, 0, 0, '', '', '', '', '', '', 0, 0, '{}')",
                [name, date]);
            world = await db.get("SELECT * FROM world WHERE id=?", rw.lastID);
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
        [world.id, user.id]);

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
    try {
        err = JSON.stringify(process_error_arg(e));
        err = "TIME: " + Date.now() + "\r\n" + err + "\r\n" + "-".repeat(20) + "\r\n\r\n\r\n";
        fs.appendFileSync(settings.UNCAUGHT_PATH, err);
    } catch(e) {};
    console.log("Uncaught error:", e);
    process.exit(-1);
});

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
            err500Temp = template_data["500.html"]();
        } catch(e) {
            err500Temp = "An error has occurred while displaying the 500 internal server error page";
            handle_error(e);
        }
        res.end(err500Temp);
        handle_error(e); // writes error to error log
    }
});

var HTTPSockets = {};
var HTTPSockketID = 0;
server.on("connection", function(socket) {
    var sockID = HTTPSockketID++;
    HTTPSockets[sockID] = socket;
    socket.on("close", function() {
        delete HTTPSockets[sockID];
    });
});

var csrf_tokens = {}; // all the csrf tokens that were returned to the clients

var valid_subdomains = ["test", "forums", "serverrequeststatus", "info", "chat", "cd", "random_color", "backgrounds"];

async function process_request(req, res, current_req_id) {
    if(isStopping) return;
    var hostname = req.headers.host;
    if(!hostname) hostname = "www.ourworldoftext.com";
    hostname = hostname.slice(0, 1000);
    var offset = 2;
    var subdomains = !isIP(hostname) ? hostname.split(".").reverse() : [hostname];
    var sub = subdomains.slice(offset);
    for(var i = 0; i < sub.length; i++) sub[i]= sub[i].toLowerCase();

    var URLparse = url.parse(req.url);
    var URL = URLparse.pathname;
    if(URL.charAt(0) == "/") { URL = URL.substr(1); }
    try { URL = decodeURIComponent(URL); } catch (e) {};

    if(sub.length == 1 && valid_subdomains.indexOf(sub[0]) > -1) {
        URL = "other/" + sub[0] + "/" + URL;
    }

    var fullPath = URLparse.path;
    if(fullPath.charAt(0) == "/") { fullPath = fullPath.substr(1); }
    try { fullPath = decodeURIComponent(fullPath); } catch (e) {};

    var request_resolved = false;

    // server will return cookies to the client if it needs to
    var include_cookies = [];

    var transaction = transaction_obj(current_req_id);

    var acceptEncoding = parseAcceptEncoding(req.headers["accept-encoding"]);

    var realIp = req.headers["X-Real-IP"] || req.headers["x-real-ip"];
    var cfIp = req.headers["CF-Connecting-IP"] || req.headers["cf-connecting-ip"];
    var remIp = req.socket.remoteAddress;
    var ipAddress = evaluateIpAddress(remIp, realIp, cfIp)[0];

    doLogReq("http;" + JSON.stringify(req.method) + ";" + ipAddress + ";" + JSON.stringify(req.url) + ";" + JSON.stringify(req.headers["user-agent"]) + ";" + Date.now());

    function dispatch(data, status_code, params) {
        if(request_resolved) return; // if request is already sent
        request_resolved = true;
        /* params: {
            cookie: the cookie data
            mime: mime type (ex: text/plain)
            redirect: url to redirect to
            download_file: force browser to download this file as .txt. specifies its name
            headers: header data
            streamed_length: don't set content length because it's streamed
        } (all optional)*/
        var info = {};
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
        if(gzipEnabled && (acceptEncoding.includes("gzip") || acceptEncoding.includes("*") && !params.streamed_length)) {
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
        if(!params.streamed_length) info["Content-Length"] = Buffer.byteLength(data);
        res.writeHead(status_code, info);
        if(!params.streamed_length) {
            res.write(data, "utf8");
            res.end();
        }
    }
    dispatch.res = res;
    dispatch.write = function(data) {
        return new Promise(function(resolve) {
            res.write(data, "utf8", resolve);
        })
    }

    var vars = {};
    var vars_joined = false; // is already joined with global_data?

    var found_url = false;
    for(var i in url_regexp) {
        var row = url_regexp[i];
        var options = row[2];
        if(!options) options = {};
        var matchCheck;
        if(options.check_query) {
            matchCheck = fullPath.match(row[0]);
        } else {
            matchCheck = URL.match(row[0]);
        }
        if(matchCheck) {
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
                        include_cookies.push("csrftoken=" + token + "; expires=" + http_time(date + Year) + "; path=/;");
                        user.csrftoken = token;
                    } else {
                        user.csrftoken = cookies.csrftoken;
                    }
                }
                var redirected = false;
                function redirect(path) {
                    dispatch(null, null, {
                        redirect: path
                    });
                    redirected = true;
                }
                if(redirected) {
                    return;
                }
                if(method == "POST") {
                    var dat = await wait_response_data(req, dispatch, options.binary_post_data, user.superuser);
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
                        return "An unexpected error occurred while generating this page"
                    }
                    if(!data) {
                        data = {};
                    }
                    data.user = user;
                    data.loginPath = loginPath;
                    data.logoutPath = logoutPath;
                    data.registerPath = registerPath;
                    data.accountSystem = accountSystem;
                    // if(data.csrftoken) {
                    //     csrf_tokens[data.csrftoken] = 1;
                    // }
                    return template_data[path](data);
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
                    HTML,
                    ipAddress
                })
                vars_joined = true;
                if(row[1][method] && valid_method(method)) {
                    // Return the page
                    await row[1][method](req, dispatch, vars, {});
                } else {
                    dispatch("Method " + method + " not allowed.", 405);
                }
            } else if(typeof row[1] == "string") { // it's a path and must be redirected to
                dispatch(null, null, { redirect: row[1] })
            } else {
                found_url = false; // it's not found because the type is invalid
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
                return "An unexpected error occurred while generating this page";
            }
            if(!data) {
                data = {};
            }
            data.user = vars.user;
            return template_data[path](data);
        }
    }

    if(!vars_joined) {
        vars = objIncludes(global_data, vars);
        vars_joined = true;
    }

    if(!found_url || !request_resolved) {
        return dispage("404", null, req, dispatch, vars);
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
        await db.run("UPDATE server_info SET value=? WHERE name='announcement'", text);
    }
    ws_broadcast({
        kind: "announcement",
        text: text
    });
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
        };
    }
    if(worldname.length > 10000) {
        return {
            error: true,
            message: "An error occurred while claiming this world"
        };
    }
    worldname = worldname.split("/");
    for(var i in worldname) {
        // make sure there is no blank segment
        if(worldname[i] == "" && !user.superuser) {
            return {
                error: true,
                message: "Segments cannot be blank (make sure name does not end in /)"
            };
        }
        // make sure segment is valid
        var claimMainPage = (worldname[i] == "" && worldname.length == 1 && user.superuser); // if superusers claim the front page
        if(!(worldname[i].match(/^([\w\.\-]*)$/g) && (worldname[i].length > 0 || claimMainPage))) {
            return {
                error: true,
                message: "Invalid world name. Contains invalid characters. Must contain either letters, numbers, or _. It can be separated by /"
            };
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
                    };
                } else {
                    return {
                        error: true,
                        message: "World already exists, cannot rename to it"
                    };
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
            };
        }
    } else { // world with /'s
        // make sure first segment is a world owned by the user
        var base_worldname = worldname[0];
        if(base_worldname == "w" || base_worldname == "W") {
            return {
                error: true,
                message: "You do not own the base world in the path"
            };
        }
        var base_world = await world_get_or_create(base_worldname, true);
        // world does not exist nor is owned by the user
        if(!base_world || (base_world && base_world.owner_id != user.id)) {
            return {
                error: true,
                message: "You do not own the base world in the path"
            };
        }
        worldname = worldname.join("/");
        // create world, except if user is trying to rename
        var claimedSubworld = await world_get_or_create(worldname, rename_casing, !rename_casing);
        // only renaming the casing
        if(rename_casing && claimedSubworld) {
            if(claimedSubworld.id == world_id) {
                return {
                    rename: true,
                    new_name: valid_world_name
                };
            }
        }
        // does not exist
        if(!claimedSubworld) {
            return {
                rename: true,
                new_name: valid_world_name
            };
        }
        // already owned (Unless owner renames it)
        if(claimedSubworld.owner_id != null && !(rename_casing && claimedSubworld.id == world_id)) {
            return {
                error: true,
                message: "You already own this subdirectory world"
            };
        }
        // subworld is created, now claim it
        return {
            world_id: claimedSubworld.id,
            message: "Successfully claimed the subdirectory world"
        };
    }
}

async function init_image_database() {
    if(!await db_img.get("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")) {
        await db_img.run("CREATE TABLE 'images' (id INTEGER NOT NULL PRIMARY KEY, name TEXT, date_created INTEGER, mime TEXT, data BLOB)");
    }
}

var worldData = {};
function getWorldData(world) {
    var ref = world.toLowerCase();

    if(worldData[ref]) return worldData[ref];

    worldData[ref] = {
        id_overflow_int: 10000,
        display_user_count: 0,
        user_count: 0
    }

    return worldData[ref];
}
function generateClientId(world, world_id) {
    var worldObj = getWorldData(world);

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

function getUserCountFromWorld(world) {
    var counter = 0;
    wss.clients.forEach(function(ws) {
        if(!ws.userClient) return;
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
        clientNumbers.push([cnt, i]);
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
        var current_count = worldObj.display_user_count;
        var new_count = worldObj.user_count;
        if(current_count != new_count) {
            worldObj.display_user_count = new_count;
            global_data.ws_broadcast({
                source: "signal",
                kind: "user_count",
                count: new_count
            }, user_world, {
                isChat: true,
                clientId: 0,
                chat_perm: -1 // cached
            });
        }
    }
}

async function clear_expired_sessions(no_timeout) {
    // clear expires sessions
    await db.run("DELETE FROM auth_session WHERE expire_date <= ?", Date.now());
    // clear expired registration keys
    await db.each("SELECT id FROM auth_user WHERE is_active=0 AND ? - date_joined >= ? AND (SELECT COUNT(*) FROM registration_registrationprofile WHERE user_id=auth_user.id) > 0",
        [Date.now(), Day * settings.activation_key_days_expire], async function(data) {
        var id = data.id;
        await db.run("DELETE FROM registration_registrationprofile WHERE user_id=?", id);
    })

    if(!no_timeout) intv.clearExpiredSessions = setTimeout(clear_expired_sessions, Minute);
}

var client_ips = {};
var closed_client_limit = 1000 * 60 * 60; // 1 hour
// TODO: some leftover disconnected clients (although rare)
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
}, 1000 * 60 * 10); // 10 minutes

// ping clients every 30 seconds
function initPingAuto() {
    intv.ping_clients = setInterval(function() {
        if(!wss) return;
        wss.clients.forEach(function(ws) {
            if(ws.readyState != WebSocket.OPEN) return;
            try {
                ws.ping();
            } catch(e) {
                handle_error(e);
            };
        })
    }, 1000 * 30);
}

async function uvias_init() {
    console.log("Connecting to account database...");
    await pgConn.connect();
    await uvias.run("SELECT accounts.set_service_info($1::text, $2::text, $3::text, $4::text, $5::text, $6::integer);",
        [uvias.id, uvias.name, uvias.domain, uvias.sso, uvias.logout, process.pid]);
    console.log("Sent service identifier");

    await uvias.run("LISTEN uv_kick");
    await uvias.run("LISTEN uv_sess_renew");
    await uvias.run("LISTEN uv_rep_upd");
    await uvias.run("LISTEN uv_user_upd");
    await uvias.run("LISTEN uv_user_del");
    await uvias.run("LISTEN uv_service");
    await uvias.run("LISTEN uv_rank_upd");

    pgConn.on("notification", function(notif) {
        var channel = notif.channel;
        doLogReq("uvSignal;" + channel + ";" + JSON.stringify(notif.payload) + ";" + Date.now());
        var data;
        try {
            data = JSON.parse(notif.payload);
        } catch(e) {
            console.log("Malformed data:", notif.payload);
            return;
        }
        switch(channel) {
            case "uv_kick":
                console.log("Signal uv_kick. Session '" + data.session + "', Reason '" + data.reason + "'");
                break;
            case "uv_sess_renew":
                console.log("Signal uv_sess_renew. Session '" + data.session + "'");
                break;
            case "uv_rep_upd":
                console.log("Signal uv_rep_upd. UID 'x" + toHex64(toInt64(data.uid)) + "'");
                break;
            case "uv_user_upd":
                console.log("Signal uv_user_upd. UID 'x" + toHex64(toInt64(data.uid)) + "'");
                break;
            case "uv_user_del":
                console.log("Signal uv_user_del. UID 'x" + toHex64(toInt64(data.uid)) + "'");
                break;
            case "uv_service":
                console.log("Signal uv_service. ID '" + data.id + "'");
                break;
            case "uv_rank_upd":
                console.log("Signal uv_rank_upd. ID '" + data.id + "'");
                break;
        }
    });
}

var wss;
async function initialize_server_components() {
    if(accountSystem == "uvias") {
        await uvias_init();
    }
    beginReqLog();

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

    if(accountSystem == "local") {
        await clear_expired_sessions();
    }

    server.listen(serverPort, function() {
        var addr = server.address();

        var cWidth = 50;
        var cHeight = 7;

        var tmg = new TerminalMessage(cWidth, cHeight);

        tmg.setSquare(0, 0, 25, cHeight - 1, "bright_cyan");
        tmg.setText("OWOT Server is running", 2, 1, "bright_white");
        tmg.setText("Address:", 2, 2, "bright_white");
        tmg.setText(addr.address + "", 4, 3, "cyan");
        tmg.setText("Port:", 2, 4, "bright_white");
        tmg.setText(addr.port + "", 4, 5, "cyan");

        console.log(tmg.render());

        // start listening for commands
        command_prompt();
    });

    wss = new WebSocket.Server({ server });
    global_data.wss = wss;

    await sysLoad();
    await sintLoad();

    await initialize_misc_db();
    await initialize_ranks_db();
    await initialize_edits_db();

    initPingAuto();

    ws_broadcast = function(data, world, opts) {
        if(!opts) opts = {};
        data = JSON.stringify(data);
        wss.clients.forEach(function each(client) {
            if(!client.userClient) return;
            try {
                if(client.readyState == WebSocket.OPEN &&
                world == void 0 || NCaseCompare(client.world_name, world)) {
                    if(opts.isChat) {
                        if(opts.chat_perm == -1) opts.chat_perm = client.chat_permission;
                        if(opts.chat_perm == 1) if(!(client.is_member || client.is_owner)) return;
                        if(opts.chat_perm == 2) if(!client.is_owner) return;
                        if(client.chat_blocks && (client.chat_blocks.indexOf(opts.clientId) > -1 ||
                            ((client.chat_blocks.indexOf("*") > -1) && opts.clientId != 0))) return;
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
        }, world);
    };

    global_data.ws_broadcast = ws_broadcast;
    global_data.tile_signal_update = tile_signal_update;

    wss.on("connection", manageWebsocketConnection);
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
function broadcastMonitorEvent(data) {
    if(!monitorEventSockets.length) return;
    for(var i = 0; i < monitorEventSockets.length; i++) {
        var sock = monitorEventSockets[i];
        try {
            sock.send(data);
        } catch(e) {
            continue;
        }
    }
}

function evaluateIpAddress(remIp, realIp, cfIp) {
    var ipAddress = remIp;
    var ipAddressFam = 4;
    if(!ipAddress) { // ipv4
        ipAddress = "0.0.0.0";
    } else {
        if(ipAddress.indexOf(".") > -1) { // ipv4
            ipAddress = ipAddress.split(":").slice(-1);
            ipAddress = ipAddress[0];
        } else { // ipv6
            ipAddressFam = 6;
            ipAddress = normalize_ipv6(ipAddress);
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
            if(is_cf_ipv4_int(ipv4_to_int(ipAddress))) {
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
            if(is_cf_ipv6_int(ipv6_to_int(ipAddress))) {
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
    return [ipAddress, ipAddressFam];
}

async function manageWebsocketConnection(ws, req) {
    if(isStopping) return;
    var socketTerminated = false;
    var ipHeaderAddr = "Unknown";
    try {
        var rnd = Math.floor(Math.random() * 1E4);
        var forwd = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];
        var realIp = req.headers["X-Real-IP"] || req.headers["x-real-ip"];
        var cfIp = req.headers["CF-Connecting-IP"] || req.headers["cf-connecting-ip"];
        var remIp = req.socket.remoteAddress;

        var ipAddress = evaluateIpAddress(remIp, realIp, cfIp)[0];

        var compIp = forwd || realIp || remIp || "Err" + rnd;
        if(!forwd) forwd = "None;" + rnd;
        if(!realIp) realIp = "None;" + rnd;
        if(!remIp) remIp = "None;" + rnd;
        if(!cfIp) cfIp = "None;" + rnd;
        ipHeaderAddr = forwd + " & " + realIp + " & " + remIp;
        ws.ipHeaderAddr = ipHeaderAddr;
        ws.ipReal = realIp;
        ws.ipRem = remIp;
        ws.ipComp = compIp;
        ws.ipCF = cfIp;

        ws.ipAddress = ipAddress;
    } catch(e) {
        var error_ip = "ErrC" + Math.floor(Math.random() * 1E4);
        ws.ipHeaderAddr = error_ip;
        ws.ipReal = error_ip;
        ws.ipComp = error_ip;
        ws.ipCF = error_ip;
        ws.ipAddress = "0.0.0.0";
        handle_error(e);
    }
    /*
        TODO: Limit requests based on packet type.
    */
    var req_per_second = 256;
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
        var location = url.parse(req.url).pathname;
        // must be at the top before any async calls (errors would occur before this event declaration)
        ws.on("error", function(err) {
            handle_error(JSON.stringify(process_error_arg(err)));
        });
        if(location == "/administrator/monitor/ws/") {
            var cookies = parseCookie(req.headers.cookie);
            var user = await get_user_info(cookies, true);
            if(!user.superuser) {
                return ws.close();
            }
            sendMonitorEvents(ws);
            ws.on("close", function() {
                removeMonitorEvents(ws);
            });
            ws.monitorSocket = true;
            var msCount = 0;
            wss.clients.forEach(function(ms) {
                if(ms.monitorSocket) {
                    msCount++;
                }
            });
            broadcastMonitorEvent("[Server] " + msCount + " listening sockets, " + monitorEventSockets.length + " listeners");
            return;
        }
        ws.userClient = true;
        var pre_queue = [];
        // adds data to a queue. this must be before any async calls and the message event
        function onMessage(msg) {
            pre_queue.push(msg);
        }
        ws.on("message", function(msg) {
            if(!can_process_req()) return;
            onMessage(msg);
        });
        var status, clientId = void 0, worldObj;
        ws.on("close", function() {
            socketTerminated = true;
            if(status && clientId != void 0) {
                if(client_ips[status.world.id] && client_ips[status.world.id][clientId]) {
                    client_ips[status.world.id][clientId][2] = true;
                    client_ips[status.world.id][clientId][1] = Date.now();
                }
            }
            if(worldObj && !ws.hide_user_count) {
                worldObj.user_count--;
            }
        });
        var world_name;
        function send_ws(data) {
            if(ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(data); // not protected by callbacks
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
            }
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
        var user = await get_user_info(cookies, true);
        var channel = new_token(7);
        var vars = objIncludes(global_data, {
            user,
            channel
        });

        if(cookies.hide_user_count == "1") {
            ws.hide_user_count = true;
        }

        status = await websockets.Main(ws, world_name, vars);

        if(typeof status == "string") { // error
            return ws.close();
        }

        ws.world_id = status.world.id;

        if(typeof status == "string") {
            send_ws(JSON.stringify({
                kind: "error",
                message: status
            }));
            return ws.close();
        }
        vars.world = status.world;
        vars.timemachine = status.timemachine;

        var properties = JSON.parse(status.world.properties);
        var chat_permission = properties.chat_permission;
        if(!chat_permission) chat_permission = 0;
        ws.chat_permission = chat_permission;

        var can_chat = chat_permission == 0 || (chat_permission == 1 && status.permission.member) || (chat_permission == 2 && status.permission.owner);

        worldObj = getWorldData(world_name);
        if(!socketTerminated && !ws.hide_user_count) {
            worldObj.user_count++;
        }

        var initial_user_count;
        if(can_chat) {
            initial_user_count = worldObj.user_count;
        }

        user.stats = status.permission;

        ws.is_member = user.stats.member;
        ws.is_owner = user.stats.owner;

        clientId = generateClientId(world_name, status.world.id);

        if(!client_ips[status.world.id]) {
            client_ips[status.world.id] = {};
        }
        client_ips[status.world.id][clientId] = [ws.ipAddress, -1, false];

        ws.clientId = clientId;
        ws.chat_blocks = [];

        if(monitorEventSockets.length) {
            broadcastMonitorEvent(ws.ipAddress + ", [" + clientId + ", '" + channel + "'] connected to world ['" + vars.world.name + "', " + vars.world.id + "]");
        }

        var sentClientId = clientId;
        if(!can_chat) sentClientId = -1;
        send_ws(JSON.stringify({
            kind: "channel",
            sender: channel,
            id: sentClientId,
            initial_user_count
        }));

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
                    }));
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
                    }));
                    return ws.close();
                }
                if(!msg || msg.constructor != Object) {
                    send_ws(JSON.stringify({
                        kind: "error",
                        message: "Invalid_Type"
                    }));
                    return;
                }
                var kind = msg.kind;
                var requestID = null;
                if(typeof msg.request == "string" || typeof msg.request == "number") {
                    requestID = msg.request;
                    if(typeof requestID == "string" && requestID.length > 256) {
                        requestID = requestID.slice(0, 256);
                    }
                }
                // Begin calling a websocket function for the necessary request
                if(websockets[kind]) {
                    function send(msg) {
                        msg.kind = kind;
                        if(requestID !== null) msg.request = requestID;
                        send_ws(JSON.stringify(msg));
                    }
                    function broadcast(data, opts) {
                        data.source = kind;
                        ws_broadcast(data, world_name, opts);
                    }
                    var res = await websockets[kind](ws, msg, send, vars, {
                        transaction: transaction_obj(current_req_id),
                        broadcast,
                        clientId,
                        ws
                    });
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
                pre_queue.splice(p, 1);
                p--;
            }
        }
    } catch(e) {
        handle_error(e);
    }
}

function start_server() {
    (async function() {
        try {
            await initialize_server_components();
        } catch(e) {
            console.log("An error occurred during component initialization");
            console.log(e);
        }
    })();
}

var worldViews = {};

var global_data = {
    announcement: function() { return announcement_cache },
    get_bypass_key: function() { return bypass_key_cache },
    add_background_cache: pages.load_backgrounds.add_cache,
    template_data,
    uvias,
    accountSystem,
    db,
    db_img,
    db_misc,
    db_edits,
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
    trimHTML,
    tile_database: systems.tile_database,
    g_transaction: transaction_obj(-1),
    intv,
    WebSocket,
    fixColors,
    sanitize_color,
    worldViews,
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
    monitorEventSockets
}

async function sysLoad() {
    // initialize variables in the systems
    for(var i in systems) {
        var sys = systems[i];
        await sys.main(global_data);
    }
}

async function sintLoad() {
    // if page modules contain a startup function, run it
    for(var i in pages) {
        var mod = pages[i];
        if(mod.startup_internal) {
            await mod.startup_internal(global_data);
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

// stops server (for upgrades/maintenance) without crashing everything
// This lets node terminate the program when all handles are complete
var isStopping = false;
function stopServer(restart, maintenance) {
    if(isStopping) return;
    isStopping = true;
    console.log("\x1b[32mStopping server...\x1b[0m");
    (async function() {
        stopPrompt();
        for(var i in intv) {
            clearInterval(intv[i]);
            clearTimeout(intv[i]);
            delete intv[i];
        }

        try {
            await updateChatLogData(true);
            //await clear_expired_sessions(true);

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

            for(var id in HTTPSockets) {
                HTTPSockets[id].destroy();
            }

            if(accountSystem == "uvias") {
                pgConn.end();
            }

            flushReqLogBuffer(true);
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
        } else {
            sendProcMsg("EXIT");
        }
    })();
}