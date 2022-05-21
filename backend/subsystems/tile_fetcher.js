var db;
var intv;
module.exports.main = function(vars) {
	db = vars.db;
	intv = vars.intv;

	fetchTimer();
}

var ipAddrQueue = [];
var fetchesByIp = {};

async function fetchTimer() {
	while(true) {
		var fetchStat;
		try {
			fetchStat = await fetchNext();
		} catch(e) {
			console.log("Critical error", e);
		}
		if(!fetchStat) {
			break;
		}
	}
	intv.fetch_timer = setTimeout(fetchTimer, 1000 / 60);
}

async function fetchNext() {
	var nextIp = ipAddrQueue[0];
	if(!nextIp) {
		return false;
	}

	var ipQueue = fetchesByIp[nextIp];
	if(!ipQueue) {
		ipAddrQueue.shift();
		return false;
	}
	var queue = ipQueue.queue;

	var rangesPeriod = [];

	ipAddrQueue.shift();
	if(!queue.length) {
		delete fetchesByIp[nextIp];
	} else {
		var current = queue[0];
		var range = current.range;
		var worldID = current.worldID;
		var resolve = current.promise;
		var x1 = range[0];
		var y1 = range[1];
		var x2 = range[2];
		var y2 = range[3];
		var area = (y2 - y1 + 1) * (x2 - x1 + 1);
		if(ipQueue.tilesInPeriod + area > 100) {
			ipAddrQueue.push(nextIp);
			return false;
		}
		ipQueue.tilesInPeriod += area;
		rangesPeriod.push(current);
		queue.shift();
		if(queue.length) {
			ipAddrQueue.push(nextIp);
		}
	}

	for(var i = 0; i < rangesPeriod.length; i++) {
		var queueObj = rangesPeriod[i];
		var range = queueObj.range;
		var worldID = queueObj.worldID;
		var resolve = queueObj.promise;
		var x1 = range[0];
		var y1 = range[1];
		var x2 = range[2];
		var y2 = range[3];
		var area = (y2 - y1 + 1) * (x2 - x1 + 1);

		var data = await db.all("SELECT * FROM tile WHERE world_id=? AND tileY >= ? AND tileX >= ? AND tileY <= ? AND tileX <= ?", [worldID, y1, x1, y2, x2]);

		ipQueue.tilesInPeriod -= area;

		resolve(data);
	}

	return true;
}

function queueFetch(ip, worldID, range) { // TODO: what if client closes in the middle of fetching multiple ranges?
	if(!ipAddrQueue.includes(ip)) {
		ipAddrQueue.push(ip);
		if(!fetchesByIp[ip]) {
			fetchesByIp[ip] = {
				tilesInPeriod: 0,
				queue: []
			};
		}
	}
	var queue = fetchesByIp[ip].queue;
	if(queue.length > 10000) throw "Queue overflow";
	return new Promise(function(res) {
		queue.push({
			range,
			worldID,
			promise: res
		});
	});
}

module.exports.fetch = queueFetch;