// Runs after establishing a websocket handshake

module.exports = async function(ws, worldname, vars) {
    var db = vars.db;
    var get_user_info = vars.get_user_info;
    var world_get_or_create = vars.world_get_or_create;
    var can_view_world = vars.can_view_world;
    var user = vars.user;
    var san_nbr = vars.san_nbr;

    var timemachine = {
        active: false
    }

    var tm_check = worldname.split("/")
    if(tm_check[0] == "accounts" && tm_check[1] == "timemachine" && tm_check[3]) {
        worldname = tm_check[2];
        timemachine.active = true;
    }

    var world = await world_get_or_create(worldname)
    if(!world) {
        return "World does not exist"
    }

    if(timemachine.active && world.owner_id != user.id && !user.superuser) {
        return "No permission to view the timemachine"
    }

    var permission = await can_view_world(world, user)
    if(!permission && !user.superuser) {
        return "No permission to view this world"
    }

    if(timemachine.active) {
        timemachine.time = san_nbr(tm_check[3]);

        if(timemachine.time < 0) timemachine.time = 0;
        if(timemachine.time > 1000000) timemachine.time = 1000000;
    }

    return { permission, world, timemachine };
}