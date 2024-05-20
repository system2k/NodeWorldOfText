module.exports.GET = async function(req, write, server, ctx, params) {
	var render = ctx.render;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var db_img = server.db_img;
	var createCSRF = server.createCSRF;

	if(!user.superuser) {
		return await callPage("404");
	}

	var images = await db_img.all("SELECT id, name, date_created, mime, LENGTH(data) AS len FROM images");

	var csrftoken = createCSRF(user.id, 0);

	var data = {
		images,
		csrftoken
	};

	write(render("administrator_backgrounds.html", data));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;

	var db_img = server.db_img;
	var checkCSRF = server.checkCSRF;

	if(!user.superuser) return;

	if(!post_data.length) return;

	var csrftoken = req.headers["x-csrf-token"];
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed");
	}

	var len = post_data[0];
	var name = "";
	for(var i = 0; i < len; i++) {
		var byte = post_data[1 + i];
		if(!byte) continue;
		name += String.fromCharCode(byte);
	}
	if(!name) return write("NO_NAME");
	var namelen = name.length;

	var ex = await db_img.get("SELECT id FROM images WHERE name=?", name);
	if(ex) return write("NAME");

	var is_png = post_data[1 + namelen];
	var is_jpg = post_data[2 + namelen];
	var data = post_data.slice(3 + namelen);
	var mime = "application/octet-stream";
	if(is_png) {
		mime = "image/png";
	} else if(is_jpg) {
		mime = "image/jpeg";
	}
	
	await db_img.run("INSERT INTO images VALUES(null, ?, ?, ?, ?)", [name, Date.now(), mime, data]);

	write("DONE");
}