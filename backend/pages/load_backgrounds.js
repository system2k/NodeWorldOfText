module.exports.GET = async function(req, serve, vars) {
    var get_third = vars.get_third;
    var db_img = vars.db_img;
    var path = vars.path;

    var img_name = get_third(path, "other", "backgrounds");

    var data = await db_img.get("SELECT data, mime FROM images WHERE name=?", img_name);

    if(!data) return serve("Image not found", 404);

    serve(data.data, 200, { mime: data.mime_type });
}