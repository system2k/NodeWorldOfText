var mime = require("../../utils/mime.js");

module.exports.GET = async function(req, serve, vars, evars) {
	var HTML = evars.HTML;
	var user = evars.user;

	var dispage = vars.dispage;
	var createCSRF = vars.createCSRF;

	if(!user.superuser) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var csrftoken = createCSRF(user.id.toString(), 0);

	var data = {
		csrftoken
	};

	serve(HTML("administrator_files.html", data));
}

module.exports.POST = async function(req, serve, vars, evars) {
	var post_data = evars.post_data;
	var user = evars.user;

	var static_fileData_append = vars.static_fileData_append;
	var checkCSRF = vars.checkCSRF;

	if(!user.superuser) return;

	if(!post_data.length) return;

	var csrftoken = req.headers["x-csrf-token"];
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return serve("CSRF verification failed");
	}

	var len = post_data[0];
	var name = "";
	for(var i = 0; i < len; i++) {
		var byte = post_data[1 + i];
		if(!byte) continue;
		name += String.fromCharCode(byte);
	}
	if(!name) name = "Untitled.bin";

	var data = post_data.slice(1 + name.length);

	var unixtime = Date.now().toString();
	var mimetype = mime(name.replace(/.*[\.\/\\]/, "").toLowerCase());

	var headerData = Buffer.alloc(2 + 1 + name.length + 1 + unixtime.length + 1 + mimetype.length);
	var headPtr = 2;

	headerData[headPtr++] = name.length;
	for(var i = 0; i < name.length; i++) headerData[headPtr++] = name.charCodeAt(i);

	headerData[headPtr++] = unixtime.length;
	for(var i = 0; i < unixtime.length; i++) headerData[headPtr++] = unixtime.charCodeAt(i);

	headerData[headPtr++] = mimetype.length;
	for(var i = 0; i < mimetype.length; i++) headerData[headPtr++] = mimetype.charCodeAt(i);

	var headerLen = headerData.length;
	headerData[0] = headerLen & 255;
	headerData[1] = headerLen >> 8 & 255;

	var fileData = Buffer.concat([headerData, data]);

	var index = await static_fileData_append(fileData);

	serve(index.toString());
}