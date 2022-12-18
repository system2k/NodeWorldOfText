var utils = require("../../utils/utils.js");
var create_date = utils.create_date;

module.exports.GET = async function(req, serve, vars, evars, params) {
	var HTML = evars.HTML;
	var user = evars.user;

	var dispage = vars.dispage;
	var staticIdx_full_buffer = vars.staticIdx_full_buffer;
	var static_retrieve_raw_header = vars.static_retrieve_raw_header;

	if(!user.superuser) {
		return await dispage("404", null, req, serve, vars, evars);
	}

	var buf = await staticIdx_full_buffer();
	var total = buf.length / 9;

	var fileData = [];

	for(var i = 0; i < total; i++) {
		var idx = i * 9;
		var start = buf[idx + 0] + buf[idx + 1] * 256 + buf[idx + 2] * 65536 + buf[idx + 3] * 16777216;
		var len = buf[idx + 4] + buf[idx + 5] * 256 + buf[idx + 6] * 65536 + buf[idx + 7] * 16777216;
		var accessible = buf[idx + 8];
		var header = await static_retrieve_raw_header(start);

		var lenIdx = 0;
		var filename = header.slice(1, header[lenIdx] + 1).toString();
		lenIdx += 1 + header[lenIdx];
		var unixtime = header.slice(1 + lenIdx, lenIdx + header[lenIdx] + 1).toString();
		lenIdx += 1 + header[lenIdx];
		var mimetype = header.slice(1 + lenIdx, lenIdx + header[lenIdx] + 1).toString();

		unixtime = parseInt(unixtime);

		fileData.push({
			offset: i,
			index: i + 1,
			start,
			len,
			filename,
			unixtime: create_date(unixtime).replace(/ /g, "&nbsp"),
			mimetype,
			accessible: !!accessible
		});
	}

	var data = {
		files: fileData
	};

	serve(HTML("administrator_file_list.html", data));
}