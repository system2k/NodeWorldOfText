module.exports = async function(ws, data, send, vars, evars) {
    return; // Under Construction
    
    var db = vars.db;
    var user = vars.user;
    var world = vars.world;
    var san_nbr = vars.san_nbr;
    var tile_coord = vars.tile_coord;
    var modules = vars.modules;
    var tile_database = vars.tile_database;

    if(!user.superuser) {
        return;
    }

    var tiles = data.data;
    if(!Array.isArray(tiles)) return;

    var call_id = tile_database.newCallId();

    tile_database.reserveCallId(call_id);

    tile_database.write(call_id, tile_database.types.settile, {
        tiles
    });

    var resp = await tile_database.editResponse(call_id);
}