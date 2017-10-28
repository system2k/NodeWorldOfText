module.exports = {};

// 0 = false, 1 = true
function bint(x) {
    return !!parseInt(x);
}

function validateCSS(c) {
    c += "";
    if(c == "default") return "";
    if(typeof c !== "string") return "";
    if(c.length > 100) c = c.slice(0, 100);
    c = c.replace(/{/g, "");
    c = c.replace(/}/g, "");
    c = c.replace(/;/g, "");
    c = c.replace(/\r/g, "");
    c = c.replace(/\n/g, "");
    return c.slice(0, 20);
}

function validatePerms(p) {
    if(p == 0) return 0;
    if(p == 1) return 1;
    if(p == 2) return 2;
    return 0;
}

module.exports.GET = async function(req, serve, vars, params) {
    var template_data = vars.template_data;
    var user = vars.user;
    var url = vars.url;
    var path = vars.path;
    var get_third = vars.get_third;
    var db = vars.db;
    var dispage = vars.dispage;
    var world_get_or_create = vars.world_get_or_create;

    if(!user.authenticated) {
        return serve(null, null, {
            redirect: "/accounts/login/?next=" + url.parse(req.url).pathname
        })
    }

    // gets world name from /accounts/configure/{world}/
    var world_name = get_third(path, "accounts", "configure")

    var world = await world_get_or_create(world_name)
    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    if(world.owner_id != user.id && !user.superuser) {
        return serve("Access denied", 403)
    }

    world_name = world.name;

    var members = await db.all("SELECT * FROM whitelist WHERE world_id=?", world.id)
    var member_list = []; // processed list of members
    for(var i = 0; i < members.length; i++) {
        var username = await db.get("SELECT username from auth_user where id=?", members[i].user_id)
        member_list.push({
            member_name: username.username
        });
    }

    var properties = JSON.parse(world.properties);

    // if empty, make sure server knows it's empty
    // ([] is considered to not be empty through boolean conversion)
    if(member_list.length === 0) member_list = null;

    var color = world.custom_color || "default";
    var cursor_color = world.custom_cursor || "default";
    var cursor_guest_color = world.custom_guest_cursor || "default";
    var bg = world.custom_bg || "default";
    var owner_color = world.custom_tile_owner || "default";
    var member_color = world.custom_tile_member || "default";
    var menu_color = properties.custom_menu_color || "default";

    var data = {
        user,

        world: world_name,
        csrftoken: user.csrftoken,
        members: member_list,
        add_member_message: params.message,
        misc_message: params.misc_message,

        readability: world.readability,
        writability: world.writability,

        go_to_coord: world.feature_go_to_coord,
        coord_link: world.feature_coord_link,
        url_link: world.feature_url_link,
        paste: world.feature_paste,
        membertiles_addremove: world.feature_membertiles_addremove,
	  //animate: world.feature_animate,

        color,
        cursor_color,
        cursor_guest_color,
        bg,
        owner_color,
        member_color,
        menu_color,

        pumpkin_background: properties.background == "/static/misc/images/halloween/pumpkin.png"
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
    var world_get_or_create = vars.world_get_or_create;
    var ws_broadcast = vars.ws_broadcast;

    if(!user.authenticated) {
        serve();
    }

    var world_name = get_third(path, "accounts", "configure")

    var world = await world_get_or_create(world_name)
    if(!world) {
        return await dispage("404", null, req, serve, vars)
    }

    world_name = world.name;

    if(world.owner_id != user.id && !user.superuser) {
        return serve("Access denied", 403)
    }

    var properties = JSON.parse(world.properties);
    var new_world_name = null;

    if(post_data.form == "add_member") {
        var username = post_data.add_member;
        var date = Date.now();
        var adduser = await db.get("SELECT * from auth_user WHERE username=? COLLATE NOCASE", username);
        if(!adduser) {
            return await dispage("configure", { message: "User not found" }, req, serve, vars)
        }
        if(adduser.id == world.owner_id) {
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

        await db.run("INSERT into whitelist VALUES(null, (SELECT id FROM auth_user WHERE username=? COLLATE NOCASE), ?, ?)", [username, world.id, date])

        return await dispage("configure", {
            message: adduser.username + " is now a member of the \"" + world_name + "\" world"
        }, req, serve, vars)
    } else if(post_data.form == "access_perm") { // access_perm
        var readability = validatePerms(post_data.readability);
        var writability = validatePerms(post_data.writability);

        await db.run("UPDATE world SET (readability,writability)=(?,?) WHERE id=?",
            [readability, writability, world.id])
    } else if(post_data.form == "remove_member") {
        var to_remove;
        for(var key in post_data) {
            if(key.startsWith("remove_")) to_remove = key;
        }
        var username_to_remove = to_remove.substr("remove_".length)
        await db.run("DELETE FROM whitelist WHERE user_id=(SELECT id FROM auth_user WHERE username=? COLLATE NOCASE) AND world_id=?", [username_to_remove, world.id])
    } else if(post_data.form == "features") {
        var go_to_coord = validatePerms(post_data.go_to_coord);
        var coord_link = validatePerms(post_data.coord_link);
        var url_link = validatePerms(post_data.url_link);
		var animate = validatePerms(post_data.animate);
        var paste = validatePerms(post_data.paste);
        var membertiles_addremove = post_data.membertiles_addremove;
        if(membertiles_addremove == "false") {
            membertiles_addremove = 0;
        } else if(membertiles_addremove == "true") {
            membertiles_addremove = 1;
        } else {
            membertiles_addremove = 0;
        }

        await db.run("UPDATE world SET (feature_go_to_coord,feature_membertiles_addremove,feature_paste,feature_coord_link,feature_url_link)=(?,?,?,?,?) WHERE id=?",
            [go_to_coord, membertiles_addremove, paste, coord_link, url_link/*, animate*/, world.id])
    } else if(post_data.form == "style") {
        var color = validateCSS(post_data.color);
        var cursor_color = validateCSS(post_data.cursor_color);
        var cursor_guest_color = validateCSS(post_data.cursor_guest_color);
        var bg = validateCSS(post_data.bg);
        var owner_color = validateCSS(post_data.owner_color);
        var member_color = validateCSS(post_data.member_color);
        var menu_color = validateCSS(post_data.menu_color);
        properties.custom_menu_color = menu_color;

        await db.run("UPDATE world SET (custom_bg,custom_cursor,custom_guest_cursor,custom_color,custom_tile_owner,custom_tile_member,properties)=(?,?,?,?,?,?,?) WHERE id=?",
            [bg, cursor_color, cursor_guest_color, color, owner_color, member_color, JSON.stringify(properties), world.id])
        
        ws_broadcast({
            kind: "colors",
            colors: {
                cursor: cursor_color || "#ff0",
                text: color || "#000",
                member_area: member_color || "#eee",
                background: bg || "#fff",
                owner_area: owner_color || "#ddd",
                menu: menu_color || "#e5e5ff"
            }
        }, world.name)
    } else if(post_data.form == "misc") {
        var properties_updated = false;
        if(!("pumpkin_background" in post_data)) {
            properties_updated = true;
            delete properties.background;
        }
        var new_name = post_data.new_world_name + "";
        if(new_name && new_name != world.name) { // changing world name
            var exists = await world_get_or_create(new_name, true);
            // world name exists (skip if user is just changing casing of the name)
            if(exists && exists.id != world.id) {
                return await dispage("configure", {
                    misc_message: "World name is already taken"
                }, req, serve, vars)
            }
            if((new_name == "" || !new_name.match(/^(\w*)$/g)) && !user.superuser) {
                return await dispage("configure", {
                    misc_message: "Cannot change world name to this"
                }, req, serve, vars)
            }
            await db.run("UPDATE world SET name=? WHERE id=?", [new_name, world.id]);
            new_world_name = new_name;
        } else if("pumpkin_background" in post_data) {
            properties.background = "/static/misc/images/halloween/pumpkin.png";
            properties_updated = true;
        }
        if(properties_updated) {
            await db.run("UPDATE world SET properties=? WHERE id=?",
                [JSON.stringify(properties), world.id])
        }
    } else if(post_data.form == "action") {
        // the special features (unclaim, clear worlds)

        var mode = post_data.mode;
        if(post_data.unclaim == "") {
            await db.run("UPDATE world SET owner_id=null WHERE id=?", world.id);
            return serve(null, null, {
                redirect: "/accounts/profile/"
            });
        } else if(post_data.clear_public == "") {
            await db.run("UPDATE tile SET (content,properties)=(?,?) WHERE world_id=? AND writability=0",
                [" ".repeat(128), "{}", world.id]);
            var writability = world.writability;
            if(writability == 0) {
                // delete default tiles that are public too (null = default protection)
                await db.run("UPDATE tile SET (content,properties)=(?,?) WHERE world_id=? AND writability IS NULL", [" ".repeat(128), "{}", world.id]);
                // apparently, it's not "=null" but "IS NULL"
            }
        } else if(post_data.clear_all == "") {
            await db.run("DELETE FROM tile WHERE world_id=?", world.id);
        }
    }

    if(new_world_name == null) {
        serve(null, null, {
            redirect: url.parse(req.url).pathname
        });
    } else { // world name changed, redirect to new name
        serve(null, null, {
            redirect: "/accounts/configure/" + new_world_name + "/"
        });
    }
}