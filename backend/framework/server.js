const http = require("http");
const https = require("https");
const url = require("url");
const crypto = require("crypto");
const querystring = require("querystring");
const isIP = require("net").isIP;

const templates = require("./templates.js");
const utils = require("../utils/utils.js");
const frameUtils = require("../framework/utils.js");
const ipaddress = require("../framework/ipaddress.js");
const restrictions = require("../utils/restrictions.js");

var parseCookie = frameUtils.parseCookie;

var removeLastSlash = utils.removeLastSlash;
var http_time = utils.http_time;

var evaluateIpAddress = ipaddress.evaluateIpAddress;

class RequestHandler {
	server = null;
	dispatcher = null;
	req = null;
	ipAddress = null;
	ipAddressFam = null;
	ipAddressVal = null;
	compCallbacks = null;
	cookies = {};
	user = {};
	post_data = {};
	query_data = {};
	path = null;
	referer = null;
	
	templateData = {};

	static RESOLVED = 1;
	static CONTINUE = 2;
	static ABORTED = 3;

	parseHostname(hostname) {
		if(!hostname) hostname = "example.com";
		hostname = hostname.slice(0, 1000);
		var subdomains = !isIP(hostname) ? hostname.split(".").reverse() : [hostname];
		var sub = subdomains.slice(2);
		for(var i = 0; i < sub.length; i++) sub[i] = sub[i].toLowerCase();
		return sub;
	}

	isValidMethod(mtd) {
		const valid_methods = ["GET", "POST", "HEAD", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"];
		return valid_methods.indexOf(mtd) > -1;
	}

	constructor(server, dispatcher, req, compCallbacks) {
		this.server = server;
		this.dispatcher = dispatcher;
		this.req = req;
		this.compCallbacks = compCallbacks;
	}

	setCallback = (callback) => {
		this.compCallbacks.push(callback);
	}

	setTemplateData(key, value) {
		this.templateData[key] = value;
	}

	// wait for the client to upload form data to the server
	loadPostData(binary_post_data, raise_limit) {
		var self = this;
		var sizeLimit = 1000000;
		if(raise_limit) sizeLimit = 100000000;
		var queryData;
		if(binary_post_data) {
			queryData = Buffer.from([]);
		} else {
			queryData = "";
		}
		var error = false;
		if(this.req.aborted) { // request aborted before we could insert our listeners
			return null;
		}
		return new Promise(function(resolve) {
			self.req.on("data", function(data) {
				if(error) return;
				try {
					if(binary_post_data) {
						queryData = Buffer.concat([queryData, data]);
						self.server.periodHTTPInboundBytes += data.length;
					} else {
						queryData += data;
						self.server.periodHTTPInboundBytes += Buffer.byteLength(data);
					}
					if (queryData.length > sizeLimit) { // hard limit
						if(binary_post_data) {
							queryData = Buffer.from([]);
						} else {
							queryData = "";
						}
						self.dispatcher.dispatch("Payload too large", 413);
						error = true;
						resolve(null);
					}
				} catch(e) {
					self.server.globals.handle_error(e);
				}
			});
			self.req.on("end", function() {
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

	async handleRequest() {
		var hostname = this.parseHostname(this.req.headers.host);
	
		var URLparse = url.parse(this.req.url);
		var URL = URLparse.pathname;
		if(URL.charAt(0) == "/") { URL = URL.slice(1); }
		try {
			URL = decodeURIComponent(URL);
		} catch (e) {};
	
		if(hostname.length == 1 && this.server.validSubdomains.indexOf(hostname[0]) > -1) {
			URL = "other/" + hostname[0] + "/" + URL;
		}
	
		var realIp = this.req.headers["X-Real-IP"] || this.req.headers["x-real-ip"];
		var cfIp = this.req.headers["CF-Connecting-IP"] || this.req.headers["cf-connecting-ip"];
		var remIp = this.req.socket.remoteAddress;
		var evalIp = evaluateIpAddress(remIp, realIp, cfIp);
		this.ipAddress = evalIp[0];
		this.ipAddressFam = evalIp[1];
		this.ipAddressVal = evalIp[2];
	
		var restr = restrictions.getRestrictions();
		var deniedPages = this.server.checkHTTPRestr(restr, this.ipAddressVal, this.ipAddressFam);
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

		this.cookies = parseCookie(this.req.headers.cookie);
	
		var page_aborted = false;
		var page_resolved = false;
		for(var i in this.server.urlPatterns) {
			var pattern = this.server.urlPatterns[i];
			var urlReg = pattern[0];
			var pageRes = pattern[1];
			var options = pattern[2];
	
			if(!URL.match(urlReg)) {
				continue;
			}
	
			var status = await this.processPage(pageRes, options, URL);
			if(status == RequestHandler.RESOLVED) {
				page_resolved = true;
			} else if(status == RequestHandler.ABORTED) {
				page_aborted = true;
			}
			break;
		}
	
		if(page_aborted) {
			return;
		}
	
		if(!this.dispatcher.isResolved()) {
			var endpoint = this.server.urlErrorEndpoints["404"];
			if(endpoint) {
				var status = await this.processPage(endpoint, {}, URL);
				if(status == RequestHandler.RESOLVED) {
					page_resolved = true;
				}
			}
		}
	
		// the error page failed to render somehow
		if(!page_resolved) {
			return this.dispatcher.dispatch("HTTP 404: The resource cannot be found", 404);
		}
	}

	async processPage(handler, options, URL) {
		var self = this;

		if(!options) options = {};
		var no_login = options.no_login;
		var binary_post_data = options.binary_post_data;
		var remove_end_slash = options.remove_end_slash;

		if(handler == null) {
			this.dispatcher.dispatch("No route is available for this page", 404);
			return RequestHandler.RESOLVED;
		}
		if(typeof handler == "string") { // redirection
			this.dispatcher.dispatch(null, null, { redirect: handler });
			return RequestHandler.RESOLVED;
		}
		if(typeof handler != "object") { // not a valid page type
			return RequestHandler.CONTINUE;
		}
		if(this.req.aborted) {
			return RequestHandler.ABORTED;
		}
		var method = this.req.method.toUpperCase();
		var rate_id = await this.server.checkHTTPRateLimit(this.ipAddress, handler, method);
		if(rate_id !== -1) { // release handle when this request finishes
			this.compCallbacks.push(function() {
				self.server.releaseHTTPRateLimit(self.ipAddress, rate_id[0], rate_id[1]);
			});
		}
		this.query_data = querystring.parse(url.parse(this.req.url).query);

		if(!no_login) {
			this.user = await this.server.globals.getUserInfo(this.cookies, false, this.dispatcher.dispatch.bind(this.dispatcher));
			this.setTemplateData("user", this.user);
			// check if user is logged in
			if(!this.cookies.csrftoken) {
				var token = this.server.globals.new_token(32);
				var date = Date.now();
				// TODO: introduce only for forms
				this.dispatcher.addCookie("csrftoken=" + token + "; expires=" + http_time(date + this.server.globals.ms.year) + "; path=/;");
				this.user.csrftoken = token;
			} else {
				this.user.csrftoken = this.cookies.csrftoken;
			}
		}
		if(method == "POST") {
			var dat = await this.loadPostData(binary_post_data, this.user.superuser);
			if(dat) {
				this.post_data = dat;
			}
		}
		var URL_mod = URL; // modified url
		// remove end slash if enabled
		if(remove_end_slash) {
			URL_mod = removeLastSlash(URL_mod);
		}
		this.path = URL_mod;
		this.referer = this.req.headers.referer;
		
		var pageStat;
		if(handler[method] && this.isValidMethod(method)) {
			// Return the page
			pageStat = await handler[method](this.req, this.dispatcher.dispatch.bind(this.dispatcher), this.server.globals, this, {});
		} else {
			this.dispatcher.dispatch("Method " + method + " not allowed.", 405);
		}
		if(!this.dispatcher.isResolved()) return RequestHandler.CONTINUE;
		return RequestHandler.RESOLVED;
	}

	/*
		redirect the page's processing to that of another page
		EG: return callPage("404", { extra parameters for page }, "POST")
		EG: return callPage("accounts/login", { extra parameters for page })
	*/
	callPage = async (page, params, method) => {
		if(!method || !this.isValidMethod(method)) {
			method = "GET";
		}
		method = method.toUpperCase();
		if(!params) {
			params = {};
		}
		var pageObj = this.server.pageTree;
		page = page.split("/");
		for(var i = 0; i < page.length; i++) {
			pageObj = pageObj[page[i]];
		}
		await pageObj[method](this.req, this.dispatcher.dispatch, this.server.globals, this, params);
	}

	// return compiled HTML pages
	render = (path, data) => {
		var template = templates.getFile(path);
		if(!template) { // template not found
			return "An unexpected error occurred while generating this page";
		}
		if(!data) {
			data = {};
		}
		for(var key in this.server.defaultTemplateData) {
			data[key] = this.server.defaultTemplateData[key];
		}
		for(var key in this.templateData) {
			data[key] = this.templateData[key];
		}
		return templates.execute(template, data);
	}
}

class HTTPServer {
	serverPort = 0;
	globals = null;

	isStopping = false;
	gzipEnabled = false;
	validSubdomains = []; // e.g. ["test"]
	reqHolds = {}; // // ip/identifier -> {"<index>": {holds: <number>, resp: [<promises>,...]},...}
	defaultTemplateData = {};
	csrfkeys = [Math.floor(Date.now() / 86400000).toString(), crypto.randomBytes(8)]; // temporary solution

	periodHTTPOutboundBytes = 0;
	periodHTTPInboundBytes = 0;

	sslEnabled = false;
	sslOptions = {
		key: null,
		cert: null,
		ca: null
	};

	server = null;
	pageTree = {};

	HTTPSockets = {};
	HTTPSocketID = 0;

	urlPatterns = [];
	urlErrorEndpoints = {};

	httpReqHolds = {};
	httpRateLimits = [];

	parseAcceptEncoding(str) {
		if(!str) return [];
		var res = [];
		str = str.split(",");
		for(var i = 0; i < str.length; i++) {
			var encoding = str[i];
			encoding = encoding.split(";")[0];
			encoding = encoding.trim();
			res.push(encoding);
		}
		return res;
	}

	constructor(port, globals) {
		this.serverPort = port;
		this.globals = globals;
	}

	consumeByteTransferStats() {
		var byteOut = this.periodHTTPOutboundBytes;
		var byteIn = this.periodHTTPInboundBytes;
		this.periodHTTPOutboundBytes = 0;
		this.periodHTTPInboundBytes = 0;
		return {
			out: byteOut,
			in: byteIn
		};
	}

	setPageTree(pageTree) {
		this.pageTree = pageTree;
	}

	setDefaultTemplateData(key, value) {
		this.defaultTemplateData[key] = value;
	}

	releaseStuckRequests() {
		var currentTime = Date.now();
		for(var ip in this.httpReqHolds) {
			for(var http_idx in this.httpReqHolds[ip]) {
				var rateLimData = this.httpReqHolds[ip][http_idx];
				var startTimes = rateLimData.startTimeById;
				for(var id in startTimes) {
					var start = startTimes[id];
					if(start == -1) continue;
					if(currentTime - start >= 1000 * 60) {
						this.releaseHTTPRateLimit(ip, parseInt(http_idx), parseInt(id));
					}
				}
			}
		}
	}

	setHTTPRateLimit(func, holdLimit, method) {
		this.httpRateLimits.push([func, holdLimit, method || null]);
	}

	checkHTTPRateLimit(ip, func, method) {
		var idx = -1;
		var max = 0;
		for(var i = 0; i < this.httpRateLimits.length; i++) {
			var line = this.httpRateLimits[i];
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
		if(!this.httpReqHolds[ip]) {
			this.httpReqHolds[ip] = {};
		}
		var holdObj = this.httpReqHolds[ip];
		if(!holdObj[idx]) {
			holdObj[idx] = {
				holds: 1,
				max,
				resp: [],
				maxId: 1,
				startTimeById: {}
			};
			var id = holdObj[idx].maxId++;
			holdObj[idx].startTimeById[id] = Date.now();
			return [idx, id];
		}
		var obj = holdObj[idx];
		if(obj.holds >= max) {
			// there are too many requests in queue.
			// we want this request to wait for those requests to finish first.
			// since this request hasn't executed yet, we do not increment 'holds'
			// until this request is ready to be executed.
			var id = obj.maxId++;
			obj.startTimeById[id] = -1;
			return new Promise(function(res) {
				obj.resp.push([res, idx, id]);
			});
		}
		obj.holds++;
		var id = obj.maxId++;
		obj.startTimeById[id] = Date.now();
		return [idx, id];
	}

	releaseHTTPRateLimit(ip, http_idx, id) {
		var obj = this.httpReqHolds[ip];
		if(!obj) return;
		var lim = obj[http_idx];
		if(!lim) return;
		if(!lim.startTimeById[id]) return; // already released
		delete lim.startTimeById[id];
		lim.holds--;
		var diff = lim.max - lim.holds;
		if(lim.holds <= 0) { // failsafe
			diff = lim.resp.length;
			lim.holds = 0;
		}
		for(var i = 0; i < diff; i++) {
			var funcData = lim.resp[0];
			if(!funcData) continue;
			var func = funcData[0];
			var funcIdx = funcData[1];
			var funcId = funcData[2];
			if(lim.holds < lim.max) {
				lim.holds++;
				lim.startTimeById[funcId] = Date.now();
				func([funcIdx, funcId]);
				lim.resp.splice(0, 1);
			}
		}
		// no holds for this particular HTTP route
		if(!lim.holds && !lim.resp.length) {
			delete obj[http_idx];
		}
		// no holds for this IP
		if(Object.keys(obj).length == 0) {
			delete this.httpReqHolds[ip];
		}
	}

	registerEndpoint(pattern, router, opts) {
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
	
		this.urlPatterns.push([pattern, router, opts]);
	}
	registerErrorEndpoint(code, router) {
		this.urlErrorEndpoints[code] = router;
	}

	setSSLConfig(isEnabled, privkeyPath, certPath, chainPath) {
		this.sslEnabled = !!isEnabled;
		if(!isEnabled) return;
		if(!fs.existsSync(private_key) || !fs.existsSync(cert) || !fs.existsSync(chain)) {
			this.sslEnabled = false;
			return;
		}
		this.sslOptions.key = fs.readFileSync(privkeyPath);
		this.sslOptions.cert = fs.readFileSync(certPath);
		this.sslOptions.ca = fs.readFileSync(chainPath);
	}
	isSSLEnabled() {
		return this.sslEnabled;
	}

	// temporary solution - TODO: make more secure
	createCSRF = (userid, kclass) => {
		var csrftoken = crypto.createHmac("sha1", this.csrfkeys[kclass]).update(userid.toString()).digest("hex").toLowerCase();
		return csrftoken;
	}
	checkCSRF = (token, userid, kclass) => {
		if(typeof token != "string" || !token) return false;
		return token.toLowerCase() == this.createCSRF(userid, kclass);
	}

	checkHTTPRestr(list, ipVal, ipFam) {
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

	async processRequest(req, res, compCallbacks) {
		if(this.isStopping) return;

		var acceptEncoding = this.parseAcceptEncoding(req.headers["accept-encoding"]);

		var dispatcher = new HTTPDispatcher(res, {
			encoding: acceptEncoding,
			gzip: this.gzipEnabled
		});
		var handler = new RequestHandler(this, dispatcher, req, compCallbacks);
		await handler.handleRequest();
	}

	serverRequestCallback(req, res) {
		var compCallbacks = [];
		var cbExecuted = false;
		var self = this;
		this.processRequest(req, res, compCallbacks).then(function() {
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
				self.globals.handle_error(e);
			}
			res.end(err500Temp);
			self.globals.handle_error(e); // writes error to error log
		});
	}

	listen(ip, callback) {
		if(this.sslEnabled) {
			this.server = https.createServer(this.sslOptions, this.serverRequestCallback.bind(this));
		} else {
			this.server = http.createServer(this.serverRequestCallback.bind(this));
		}
		var self = this;
		this.server.on("connection", function(socket) {
			var sockID = self.HTTPSocketID++;
			self.HTTPSockets[sockID] = socket;
			socket.on("close", function() {
				delete self.HTTPSockets[sockID];
			});
		});

		this.server.listen(this.serverPort, ip, callback);
	}

	close() {
		this.isStopping = true;
		if(this.server) {
			this.server.close();
		}
		for(var id in this.HTTPSockets) {
			this.HTTPSockets[id].destroy();
		}
	}
}

class HTTPDispatcher {
	encoding = null;
	gzip = false;
	res = null;

	requestResolved = false;
	requestStreaming = false;
	requestEnded = false;
	requestPromises = [];
	cookiesToReturn = [];

	constructor(res, opts) {
		this.res = res;
		this.encoding = opts.encoding;
		if(!this.encoding) {
			this.encoding = [];
		}
		this.gzip = !!opts.gzip;
		var self = this;
		res.on("close", function() {
			self.requestEnded = true;
			for(var i = 0; i < self.requestPromises.length; i++) {
				var prom = self.requestPromises[i];
				prom();
			}
		});
	}

	dispatch = (data, status_code, params) => {
		if(this.requestResolved || this.requestEnded) return; // if request response is already sent
		if(!this.requestStreaming) {
			this.requestResolved = true;
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
			this.cookiesToReturn.push(params.cookie);
		} else if(typeof params.cookie == "object") {
			this.cookiesToReturn = this.cookiesToReturn.concat(params.cookie);
		}
		if(this.cookiesToReturn.length == 1) {
			this.cookiesToReturn = this.cookiesToReturn[0];
		}
		if(this.cookiesToReturn.length > 0) {
			info["Set-Cookie"] = this.cookiesToReturn;
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
		if(this.gzip && (this.encoding.includes("gzip") || this.encoding.includes("*") && !this.requestStreaming)) {
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
		if(!this.requestStreaming) info["Content-Length"] = Buffer.byteLength(data);
		this.res.writeHead(status_code, info);
		if(!this.requestStreaming) {
			this.res.write(data);
			this.res.end();
			this.periodHTTPOutboundBytes += data.length;
		}
	}


	isResolved() {
		return this.requestResolved;
	}
	addCookie(cookie) {
		this.cookiesToReturn.push(cookie);
	}
	startStream() {
		this.requestStreaming = true;
	}
	endStream() {
		if(this.requestResolved || this.requestEnded) return;
		this.requestResolved = true;
		this.res.end();
	}
	writeStream(data) {
		if(this.requestResolved || this.requestEnded) return true;
		if(!this.requestStreaming) return false;
		var self = this;
		return new Promise(function(resolve) {
			self.requestPromises.push(resolve);
			self.res.write(data, function() {
				var loc = self.requestPromises.indexOf(resolve);
				if(loc > -1) {
					self.requestPromises.splice(loc, 1);
				} else {
					return; // already resolved
				}
				resolve(self.requestResolved || self.requestEnded);
			});
			self.periodHTTPOutboundBytes += data.length;
		});
	}
}

module.exports = {
	RequestHandler,
	HTTPServer,
	HTTPDispatcher
};