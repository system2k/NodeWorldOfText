// recursive directory dumper

var fs = require("fs");
function listDir(addr, MP, dsu, po, opt) { // object, file path, web path, path only, options
	if(!opt) opt = {};
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
			// Omitted folder? Cancel scanning folder
			if(con[i] == opt.omit_folder) {
				return;
			}
			listDir(addr, MP + con[i] + "/", dsu + con[i] + "/", po)
		}
	}
}
module.exports = listDir