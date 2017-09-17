// recursive directory dumper

var fs = require("fs");
function listDir(addr, MP, dsu) {
	var con = fs.readdirSync(MP)
	for(i in con) {
		var currentPath = MP + con[i]
		if(!fs.lstatSync(currentPath).isDirectory()) {
			addr[dsu + con[i]] = fs.readFileSync(currentPath, undefined)
		} else {
			listDir(addr, MP + con[i] + "/", dsu + con[i] + "/")
		}
	}
}
module.exports = listDir