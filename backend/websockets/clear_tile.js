module.exports = async function(ws, data, send, vars) {
    var db = vars.db;
    var user = vars.user;
    var san_nbr = vars.san_nbr;
    var broadcast = vars.broadcast;
    var world = vars.world;

    if(!user.superuser) return;

    var tileX = san_nbr(data.tileX);
    var tileY = san_nbr(data.tileY);

    var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
        [world.id, tileY, tileX]);

    if(!tile) return; // tile does not exist

    var tile_data = " ".repeat(128);
    await db.run("UPDATE tile SET (content, properties)=(?, ?) WHERE world_id=? AND tileY=? AND tileX=?",
        [tile_data, "{}", world.id, tileY, tileX]);
    
    await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)",
        [user.id, world.id, tileY, tileX, Date.now(), "@" + JSON.stringify({
            kind: "tile_clear"
        })]);

    broadcast({
        kind: "tile_clear",
        tileX,
        tileY
    }, world.name)
}