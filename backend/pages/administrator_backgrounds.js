module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;
    var dispage = vars.dispage;
    var db_img = vars.db_img;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars);
    }

    var images = await db_img.all("SELECT id, name, date_created, mime, LENGTH(data) AS len FROM images");

    var data = {
        images
    };

    serve(HTML("administrator_backgrounds.html", data));
}

module.exports.POST = async function(req, serve, vars) {
    var db_img = vars.db_img;
    var post_data = vars.post_data;
    var user = vars.user;
    var add_background_cache = vars.add_background_cache;

    if(!user.superuser) return;

    if(!post_data.length) return;

    var len = post_data[0];
    var name = "";
    for(var i = 0; i < len; i++) {
        var byte = post_data[1 + i];
        if(!byte) continue;
        name += String.fromCharCode(byte);
    }
    if(!name) return serve("NO_NAME");

    var ex = await db_img.get("SELECT id FROM images WHERE name=?", name);
    if(ex) return serve("NAME");

    var is_png = post_data[1 + len];
    var is_jpg = post_data[2 + len];
    var data = post_data.slice(3 + len);
    var mime = "application/octet-stream";
    if(is_png) {
        mime = "image/png";
    } else if(is_jpg) {
        mime = "image/jpeg";
    }
    
    add_background_cache(name, data, mime);
    await db_img.run("INSERT INTO images VALUES(null, ?, ?, ?, ?)", [name, Date.now(), mime, data]);

    serve("DONE");
}