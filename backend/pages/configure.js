module.exports = {};

// 0 = false, 1 = true
function bint(x) {
    return !!parseInt(x);
}

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;
    var url = vars.url;
    var path = vars.path;
    var get_third = vars.get_third;
    var db = vars.db;
    var dispage = vars.dispage;

    if(!user.authenticated) {
        return serve(null, null, {
            redirect: "/accounts/login/?next=" + url.parse(req.url).pathname
        })
    }

    // gets world name from /accounts/configure/{world}/
    var world_name = get_third(path, "accounts", "configure")

    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", world_name);

    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    if(world.owner_id != user.id && !user.superuser) {
        return serve("Access denied", 403)
    }

    var members = await db.all("SELECT * FROM whitelist WHERE world_id=?", world.id)
    var member_list = []; // processed list of members
    for(var i = 0; i < members.length; i++) {
        var username = await db.get("SELECT username from auth_user where id=?", members[i].user_id)
        member_list.push({
            member_name: username.username
        });
    }

    var selected_text = " selected";
    var public_perm = "none";
    if(world.public_writable) {
        public_perm = "write"
    } else if(world.public_readable) {
        public_perm = "read"
    }
    var properties = JSON.parse(world.properties)
    var go_to_coord = false;
    var coordLink = false;
    var urlLink = false;
    if(properties.features) {
        if(properties.features.go_to_coord) go_to_coord = properties.features.go_to_coord
        if(properties.features.coordLink) coordLink = properties.features.coordLink
        if(properties.features.urlLink) urlLink = properties.features.urlLink
    }
    // add a " selected" after each option depending on the permissions
    var op1 = "";
    var op2 = "";
    var op3 = "";
    if(public_perm === "none") op1 = selected_text;
    if(public_perm === "read") op2 = selected_text;
    if(public_perm === "write") op3 = selected_text;

    // if empty, make sure server knows it's empty
    // ([] is considered to not be empty through boolean conversion)
    if(member_list.length === 0) member_list = null;

    var data = {
        user,

        world: world_name,
        csrftoken: user.csrftoken,
        members: member_list,
        go_to_coord,
        coordLink,
        urlLink,
        add_member_message: params.message,
        op1,
        op2,
        op3
    };

    serve(template_data["configure.html"](data))
}

module.exports.POST = async function(req, serve, vars) {
    var db = vars.db;
    var post_data = vars.post_data;
    var user = vars.user;
    var get_third = vars.get_third;
    var path = vars.path;
    var dispage = vars.dispage;
    var url = vars.url;

    if(!user.authenticated) {
        serve();
    }

    var world_name = get_third(path, "accounts", "configure")

    var world = await db.get("SELECT * FROM world WHERE name=? COLLATE NOCASE", world_name);

    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    world_name = world.name;

    if(world.owner_id != user.id && !user.superuser) {
        return serve("Access denied", 403)
    }

    if(post_data.form == "add_member") {
        var username = post_data.add_member;
        var date = Date.now();
        var adduser = await db.get("SELECT * from auth_user WHERE username=? COLLATE NOCASE", username);
        if(!adduser) {
            return await dispage("configure", { message: "User not found" }, req, serve, vars)
        }
        if(adduser.id == user.id) {
            return await dispage("configure", {
                message: "User is already the owner of \"" + world_name + "\""
            }, req, serve, vars)
        }
        var whitelist = await db.get("SELECT * FROM whitelist WHERE user_id=? AND world_id=?",
            [adduser.id, world.id])
        if(whitelist) {
            return await dispage("configure", {
                message: "User is already part of this world"
            }, req, serve, vars)
        }

        await db.run("INSERT into whitelist VALUES(null, (SELECT id FROM auth_user WHERE username=? COLLATE NOCASE), ?, ?, ?)", [username, world.id, date, date])

        return await dispage("configure", {
            message: adduser.username + " is now a member of the \"" + world_name + "\" world"
        }, req, serve, vars)
    } else if(post_data.form == "public_perm") {
        var read = 0;
        var write = 0;

        if(post_data.public_perm === "read") {
            read = 1;
            write = 0;
        }
        if(post_data.public_perm === "write") {
            read = 1
            write = 1;
        }
        if(post_data.public_perm === "none") {
            read = 0;
            write = 0;
        }

        await db.run("UPDATE world SET (updated_at,public_readable,public_writable)=(?, ?, ?) WHERE id=?",
            [Date.now(), read, write, world.id])
    } else if(post_data.form == "remove_member") {
        var to_remove;
        for(key in post_data) {
            if(key.startsWith("remove_")) to_remove = key;
        }
        var username_to_remove = to_remove.substr("remove_".length)
        await db.run("DELETE FROM whitelist WHERE user_id=(SELECT id FROM auth_user WHERE username=? COLLATE NOCASE) AND world_id=?", [username_to_remove, world.id])
    } else if(post_data.form == "features") {
        var features = {
            features: {}
        };
        if(post_data.go_to_coord)
            features.features.go_to_coord = bint(post_data.go_to_coord);
        if(post_data.coordLink)
            features.features.coordLink = bint(post_data.coordLink);
        if(post_data.urlLink)
            features.features.urlLink = bint(post_data.urlLink);
        
        await db.run("UPDATE world SET (updated_at,properties)=(?, ?) WHERE id=?",
            [Date.now(), JSON.stringify(features), world.id])
    }

    serve(null, null, {
        redirect: url.parse(req.url).pathname
    });
}