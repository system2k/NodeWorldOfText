// recursive directory dumper

var fs = require("fs");
function listDir(addr, MP, dsu, po) { // object, file path, web path, path only
	var con = fs.readdirSync(MP)
	for(var i in con) {
		var currentPath = MP + con[i]
		if(!fs.lstatSync(currentPath).isDirectory()) {
			if(!po) {
				addr[dsu + con[i]] = fs.readFileSync(currentPath)
			} else {
				addr[dsu + con[i]] = currentPath;
			}
		} else {
			listDir(addr, MP + con[i] + "/", dsu + con[i] + "/", po)
		}
	}
}
module.exports = listDir