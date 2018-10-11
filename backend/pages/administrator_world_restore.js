module.exports.GET = async function(req, serve, vars) {
    var user = vars.user;
    var dispage = vars.dispage;
    var get_third = vars.get_third;
    var path = vars.path;
    var db = vars.db;
    var filename_sanitize = vars.filename_sanitize;
    var world_get_or_create = vars.world_get_or_create;
    var HTML = vars.HTML;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    serve(HTML("administrator_world_restore.html"));
}

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;
    var get_third = vars.get_third;
    var path = vars.path;
    var dispage = vars.dispage;
    var url = vars.url;
    var query_data = vars.query_data;
    var san_nbr = vars.san_nbr;
    var advancedSplit = vars.advancedSplit;
    var transaction = vars.transaction;

    if(!user.superuser) {
        return;
    }

    var r_world = post_data.world;
    var r_time = post_data.time;

    r_world = r_world.trim();
    
    if(!r_world) return serve("NO_WORLD");

    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", r_world);

    if(!world) {
        return serve("NO_WORLD")
    }

    await db.run("DELETE FROM tile WHERE world_id=?", world.id);

    var dataTable = {};

    // validate count of edits
    var count = await db.get("SELECT count(*) AS cnt FROM edit WHERE world_id=?", world.id);
    if(!count) return serve("NO_EDITS");
    count = count.cnt;
    if(count > 100000) return serve("MANY_EDITS");

    // calculate time
    var dr1 = await db.get("SELECT time FROM edit WHERE world_id=? LIMIT 1", world.id);
    var dr2 = await db.get("SELECT time FROM edit WHERE world_id=? ORDER BY id DESC LIMIT 1", world.id);
    if(!dr1 || !dr2) return serve("NO_EDITS");
    dr1 = dr1.time;
    dr2 = dr2.time;
    var time = 0;
    if(!r_time) { // no time, abort
        return;
    } else { // convert fraction to unix time
        var range = dr2 - dr1;
        var div = range / 1000000;
        time = Math.floor(div * r_time) + dr1
    }

    var editData = await db.all("SELECT content, tileX, tileY FROM edit WHERE world_id=? AND time <= ?",
        [world.id, time]);
    // iterate through the database of edit packets
    for(var i = 0; i < editData.length; i++) {
        var edit = editData[i];
        var content = edit.content;
        // for now skip special edits
        if(content.charAt(0) == "@") continue;
        content = JSON.parse(edit.content);
        var tileX = edit.tileX;
        var tileY = edit.tileY;
        var tile;
        if(!dataTable[tileY + "," + tileX]) {
            dataTable[tileY + "," + tileX] = [new Array(128).fill(" "), null];
        }
        tile = dataTable[tileY + "," + tileX];

        // iterate through edit packet
        for(var s = 0; s < content.length; s++) {
            // a single edit array
            var segment = content[s];

            // sanitize input types
            var charX = san_nbr(segment[3]);
            var charY = san_nbr(segment[2]);
            if(typeof segment[5] != "string") segment[5] = "";
            var char = advancedSplit(segment[5]);
            var color = san_nbr(segment[7]);
    
            // sanitize input values
            if(charX < 0 || charX >= 16 || charY < 0 || charY >= 8) continue;
            char = char[0];
            if(!char) char = " ";
            if(char == "\n" || char == "\r" || char == "\x1b") char = " ";
            if(color < 0) color = 0;
            if(color >= 16777216) color = 16777215;
    
            // apply data to an in-memory database
            tile[0][charY * 16 + charX] = char;
            if(color && !tile[1]) tile[1] = new Array(128).fill(0);
            if(color) tile[1][charY * 16 + charX] = color;
        }
    }

    await transaction.begin();
    for(var i in dataTable) {
        var tile = dataTable[i];
        var coord = i.split(",");
        var tileX = san_nbr(coord[1]);
        var tileY = san_nbr(coord[0]);
        var content = tile[0].join("");
        var color = tile[1];
        var properties = {};
        if(color) properties.color = color;
        await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
            [world.id, content, tileY, tileX, JSON.stringify(properties), Date.now()]);
    }
    await transaction.end();

    serve("COMPLETED");
}