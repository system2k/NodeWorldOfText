var wkTree = {
	"acme-challenge": {
		"test.txt": "0123456789ABCDEF"
	}
};

function processPath(path) {
	// path validation and normalization
	if(path[0] == "/") path = path.substr(1);
	if(path[path.length - 1] == "/") path = path.slice(0, -1);
	path = path.replace(/\\/g, "/");
	path = path.split("/");
	for(var i = 0; i < path.length; i++) {
		path[i] = path[i].trim();
		if(path[i] == "") return write("Invalid pathname", 400);
	}
	path.shift(); // remove ".well-known"

	return path;
}

module.exports.GET = async function(req, write, server, ctx) {
	var path = ctx.path;
	var acme = server.acme;

	if(!acme.enabled) return -1;

	var procPath = processPath(path);

	// follow the path
	var currentObject = wkTree; // this is the end directory/file
	for(var i = 0; i < procPath.length; i++) {
		var exist = currentObject.hasOwnProperty(procPath[i]);
		if(!exist) {
			return write("File cannot be found", 404);
		}
		currentObject = currentObject[procPath[i]];
	}

	if(typeof currentObject != "string") {
		return write("Unknown object type", 400);
	}

	return write(currentObject);
}

module.exports.POST = async function(req, write, server, ctx) {
	var cookies = ctx.cookies;
	var post_data = ctx.post_data;
	var path = ctx.path;

	var acme = server.acme;

	if(!acme.enabled) return;

	var token = cookies.token;
	if(token !== acme.pass) {
		return;
	}

	var procPath = processPath(path);
	var newFileName = procPath.pop();

	var currentObject = wkTree;
	for(var i = 0; i < procPath.length; i++) {
		var part = procPath[i];
		if(currentObject[part] != void 0 && !currentObject.hasOwnProperty(part)) {
			return write("Invalid pathname", 400);
		}
		var exist = currentObject.hasOwnProperty(part);
		if(exist) {
			if(typeof currentObject[part] != "object") {
				// path segment is a file
				return write("Invalid pathname", 400);
			}
			currentObject = currentObject[part];
		} else {
			currentObject[part] = {};
		}
	}

	if(typeof currentObject != "object") {
		return write("Unknown object type", 400);
	}
	if(typeof currentObject[newFileName] == "object") {
		return write("Cannot overwrite directory", 400);
	}

	// add or overwrite file
	currentObject[newFileName] = post_data.toString();

	return write("Added");
}