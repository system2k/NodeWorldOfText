var sqlite3 = require("better-sqlite3");
var worker = require("node:worker_threads");
var utils = require("./utils/utils.js");

const coopTimesliceMs = 100;
const parentPort = worker.parentPort;

var db = null;
var coopIterators = [];
var coopPos = 0;
var isIterating = false;

function iterateCoop(coop) {
	let iter = coop[0];
	let id = coop[1];

	let start = performance.now();
	let dataList = [];
	let isDone = false;
	while(true) {
		let data = iter.next();
		if(data.done) {
			isDone = true;
			break;
		}
		let value = data.value;
		dataList.push(value);
		if(performance.now() - start >= coopTimesliceMs) {
			break;
		}
	}
	parentPort.postMessage({
		id: id,
		data: dataList,
		isIteratorItem: true
	});
	if(isDone) {
		parentPort.postMessage({
			id: id,
			data: null
		});
	}
	return isDone;
}

function iterateNextCoop() {
	isIterating = true;
	let res = iterateCoop(coopIterators[coopPos]);
	if(res) {
		coopIterators.splice(coopPos, 1);
	}
	if(coopIterators.length == 0) {
		// Don't loop
		isIterating = false;
		coopPos = 0;
		return;
	}
	coopPos--;
	if(coopPos < 0) {
		coopPos = coopIterators.length - 1;
	}
	setImmediate(iterateNextCoop);
}

parentPort.on("message", function(data) {
	var sql = data.sql;
	var param = data.param;
	var id = data.id;
	var method = data.method;
	
	var res = null;
	var error = null;
	var isCoop = false;
	if(sql == "*INIT*") {
		db = new sqlite3(param.path, {
			readonly: Boolean(param.readonly)
		});
		db.pragma("foreign_keys = OFF");
		if(param.WALEnabled) {
			db.pragma("journal_mode = WAL");
		}
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
				} else if(method == "each_coop") {
					isCoop = true;
					let iter = stmt.iterate(param);
					coopIterators.push([iter, id]);
					if(!isIterating) {
						iterateNextCoop();
					}
				}
			}
		} catch(e) {
			error = utils.process_error_arg(e);
		}
	}
	// If cooperative, it doesn't immediately complete execution at this point
	if(!isCoop) {
		parentPort.postMessage({
			id: id,
			data: res,
			error
		});
	}
});