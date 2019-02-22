module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;
    var dispage = vars.dispage;
    var db = vars.db;
    var announcement = vars.announcement;
    var uptime = vars.uptime;
    var wss = vars.wss;
    var get_bypass_key = vars.get_bypass_key;
    var ranks_cache = vars.ranks_cache;

    // not a superuser...
    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars);
    }

    var client_num = 0;
    wss.clients.forEach(function() {
        client_num++;
    })

    var custom_ranks = [
        { level: 0, name: "Default" },
        { level: 1, name: "Staff" },
        { level: 2, name: "Superuser" },
        { level: 3, name: "Operator" }
    ];
    var custom_count = ranks_cache.count;
    var custom_ids = ranks_cache.ids;
    for(var i = 0; i < custom_count; i++) {
        var level = i + 4;
        for(var x = 0; x < custom_ids.length; x++) {
            var cid = custom_ids[x];
            if(ranks_cache[cid].level == level) {
                custom_ranks.push({ level, name: ranks_cache[cid].name });
                break;
            }
        }
    }

    var data = {
        user_ranks: await db.all("SELECT * FROM auth_user WHERE level > 0 ORDER BY level DESC"),
        announcement: announcement(),
        announcement_update_msg: params.announcement_update_msg,
        cons_update_msg: params.cons_update_msg,
        uptime: uptime(),
        machine_uptime: uptime(process.hrtime()[0] * 1000),
        client_num,
        bypass_key: get_bypass_key(),
        custom_ranks
    }

    serve(HTML("administrator.html", data));
}

module.exports.POST = async function(req, serve, vars) {
    var user = vars.user;
    var dispage = vars.dispage;
    var post_data = vars.post_data;
    var announce = vars.announce;
    var db = vars.db;
    var db_misc = vars.db_misc;
    var modify_bypass_key = vars.modify_bypass_key;
    var stopServer = vars.stopServer;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    if("set_bypass_key" in post_data) {
        var new_bypass_key = post_data.set_bypass_key;
        modify_bypass_key(new_bypass_key);
        return await dispage("administrator", {
            cons_update_msg: "Bypass key updated successfully"
        }, req, serve, vars);
    }
    if("announcement" in post_data) {
        var new_announcement = post_data.announcement;
        await announce(new_announcement);
    
        await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)",
            [user.id, 0, 0, 0, Date.now(), "@" + JSON.stringify({
                kind: "administrator_announce",
                post_data: {
                    announcement: post_data.announcement,
                },
                user: {
                    id: user.id,
                    username: user.username
                }
            })]);
    
        return await dispage("administrator", {
            announcement_update_msg: "Announcement updated"
        }, req, serve, vars);
    }
    if("manage_server" in post_data) {
        if(!user.operator) return;
        var cmd = post_data.manage_server;
        if(cmd == "restart") {
            serve("SUCCESS");
            stopServer(true);
        }
        if(cmd == "close") {
            serve("SUCCESS");
            stopServer();
        }
        if(cmd == "maintenance") {
            serve("SUCCESS");
            stopServer(false, true);
        }
        return;
    }
}