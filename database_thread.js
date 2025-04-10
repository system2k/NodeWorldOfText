var sqlite3 = require("better-sqlite3");
var worker = require("node:worker_threads");
var utils = require("./backend/utils/utils.js");

var parentPort = worker.parentPort;
var db = null;

parentPort.on("message", function(data) {
	var sql = data.sql;
	var param = data.param;
	var id = data.id;
	var method = data.method;
	
	var res = null;
	var error = null;
	if(sql == "*INIT*") {
		db = sqlite3(param);
		db.pragma("foreign_keys = OFF");
		db.pragma("journal_mode = WAL");
	} else {
		try {
			if(method == "exec") {
				res = db.exec(sql);
			} else {
				let stmt = db.prepare(sql);
				if(param == void 0) param = [];
				if(!Array.isArray(param) && typeof param !== "object") {
					param = [param];
				}
				if(method == "run") {
					res = stmt.run(param);
				} else if(method == "get") {
					res = stmt.get(param);
				} else if(method == "all") {
					res = stmt.all(param);
				} else if(method == "each") {
					for(let res of stmt.iterate(param)) {
						parentPort.postMessage({
							id: id,
							data: res,
							isIteratorItem: true
						});
					}
				}
			}
		} catch(e) {
			error = utils.process_error_arg(e);
		}
	}
	parentPort.postMessage({
		id: id,
		data: res,
		error
	});
});