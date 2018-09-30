module.exports = {};

module.exports.GET = async function(req, serve, vars, params) {
    var HTML = vars.HTML;
    var user = vars.user;
    var dispage = vars.dispage;
    var db = vars.db;
    var announcement = vars.announcement;
    var uptime = vars.uptime;
    var wss = vars.wss;
    var get_bypass_key = vars.get_bypass_key;

    // not a superuser...
    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    var client_num = 0;
    wss.clients.forEach(function() {
        client_num++;
    })

    var data = {
        user_ranks: await db.all("SELECT * FROM auth_user WHERE level > 0 ORDER BY level DESC"),
        announcement: announcement(),
        announcement_update_msg: params.announcement_update_msg,
        cons_update_msg: params.cons_update_msg,
        uptime: uptime(),
        machine_uptime: uptime(process.hrtime()[0] * 1000),
        client_num,
        bypass_key: get_bypass_key()
    }

    serve(HTML("administrator.html", data));
}

module.exports.POST = async function(req, serve, vars) {
    var user = vars.user;
    var dispage = vars.dispage;
    var post_data = vars.post_data;
    var announce = vars.announce;
    var db = vars.db;
    var modify_bypass_key = vars.modify_bypass_key;

    if(!user.superuser) {
        return await dispage("404", null, req, serve, vars)
    }

    if("set_bypass_key" in post_data) {
        var new_bypass_key = post_data.set_bypass_key;
        modify_bypass_key(new_bypass_key);
        return await dispage("administrator", {
            cons_update_msg: "Bypass key updated successfully"
        }, req, serve, vars)
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
        }, req, serve, vars)
    }
}