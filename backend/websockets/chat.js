function sanitizeColor(col) {
    var masks = ["#XXXXXX", "#XXX"];

    var hex_set = "0123456789abcdefABCDEF";
    
    for(var m = 0; m < masks.length; m++) {
        var mask = masks[m];
        var fail = false;
        for(var c = 0; c < mask.length; c++) {
            var mask_char = mask[c];
            var cmp_char = col[c];
            if(mask.length != col.length) {
                fail = true;
                break;
            }
            if(mask_char == "#" && cmp_char == "#") continue;
            if(mask_char == "X" && hex_set.indexOf(cmp_char) > -1) continue;
            fail = true;
            break;
        }
        if(!fail) {
            return col;
        }
    }

    return "#00FF00"; // checking did not pass
}

var chat_ip_limits = {};

module.exports = async function(ws, data, send, vars, evars) {
    var broadcast = evars.broadcast; // broadcast to current world
    var clientId = evars.clientId;

    var db = vars.db;
    var user = vars.user;
    var world = vars.world;
    var san_nbr = vars.san_nbr;
    var tile_coord = vars.tile_coord;
    var modules = vars.modules;
    var ws_broadcast = vars.ws_broadcast; // site-wide broadcast
    var add_to_chatlog = vars.add_to_chatlog;
    var html_tag_esc = vars.html_tag_esc;
    var topActiveWorlds = vars.topActiveWorlds;
    var wss = vars.wss;
    var NCaseCompare = vars.NCaseCompare;
    var client_ips = vars.client_ips;
    var uptime = vars.uptime;
    var ranks_cache = vars.ranks_cache;
    var accountSystem = vars.accountSystem;

    var ipHeaderAddr = ws.ipAddress;

    var props = JSON.parse(world.properties);
    var chat_perm = props.chat_permission;
    var is_member = user.stats.member;
    var is_owner = user.stats.owner;

    // sends `[ Server ]: <message>` in chat.
    function serverChatResponse(message, location) {
        send({
            nickname: "[ Server ]",
            realUsername: "[ Server ]",
            id: 0,
            message: message,
            registered: true,
            location: location,
            op: true,
            admin: true,
            staff: true,
            color: "",
            kind: "chat"
        });
    }
    
    var can_chat = false;
    if(chat_perm == 0 || chat_perm == undefined) can_chat = true;
    if(chat_perm === 1 && (is_member || is_owner)) can_chat = true;
    if(chat_perm === 2 && is_owner) can_chat = true;

    if(!(data.location == "global" || data.location == "page")) data.location = "page";

    if(data.location == "page" && !can_chat) {
        serverChatResponse("You do not have permission to chat here", "page");
        return;
    }

    var nick = "";
    if(data.nickname) {
        nick = data.nickname + "";
    }
    if(!user.staff) {
        nick = nick.slice(0, 40);
    } else {
        nick = nick.slice(0, 3030);
    }

    var msg = "";
    if(data.message) {
        msg = data.message + "";
    }
    msg = msg.trim();

    if(!msg) return;

    data.color += "";
    data.color = sanitizeColor(data.color);
    if(!data.color) data.color = "#000000";
    data.color = data.color.slice(0, 20);
    data.color = data.color.trim();

    var msNow = Date.now();

    var second = Math.floor(msNow / 1000);
    var chatsEverySecond = 2;

    // chat limiter
    if(!chat_ip_limits[ipHeaderAddr]) {
        chat_ip_limits[ipHeaderAddr] = {};
    }
    var cil = chat_ip_limits[ipHeaderAddr];
    if(cil.lastChatSecond != second) {
        cil.lastChatSecond = second;
        cil.chatsSentInSecond = 0;
    } else {
        if(cil.chatsSentInSecond >= chatsEverySecond - 1) {
            if(!user.staff) {
                serverChatResponse("You are chatting too fast.", data.location);
                return;
            }
        } else {
            cil.chatsSentInSecond++;
        }
    }

    if(!user.staff) {
        msg = msg.slice(0, 400);
    } else {
        msg = msg.slice(0, 3030);
    }

    var chatIdBlockLimit = 1280;

    // [rank, name, args, description, example]
    var command_list = [
        [3, "uptime", null, "get uptime of server", null],

        [2, "worlds", null, "list all worlds", null],
        [2, "getip", ["id"], "retrieve the IP address", "1024"],
        [2, "getclients", null, "get list of all connected clients", null],

        [0, "help", null, "list all commands", null],
        [0, "nick", ["nickname"], "change your nickname", "JohnDoe"], // client-side
        [0, "ping", null, "check the latency", null],
        [0, "warp", ["world"], "go to another world", "forexample"], // client-side
        [0, "warpserver", ["server"], "use a different server", "wss://www.yourworldoftext.com/~help/ws/"], // client-side
        [0, "gridsize", ["WxH"], "change the size of cells", "10x20"], // client-side
        [0, "block", ["id"], "mute a user", "1024"],
        [0, "color", ["color code"], "change your text color", "#FF00FF"], // client-side
        [0, "chatcolor", ["color code"], "change your chat color", "#FF00FF"], // client-side
        [0, "night", null, "enable night mode", null] // client-side
    ];

    function generate_command_list() {
        var list = [];
        for(var i = 0; i < command_list.length; i++) {
            var command = command_list[i];
            var rank = command[0];
            if(rank == 3 && user.operator) list.push(command);
            if(rank == 2 && user.superuser) list.push(command);
            if(rank == 1 && user.staff) list.push(command);
            if(rank == 0) list.push(command);
        }

        // sort the command list
        list.sort(function(v1, v2) {
            return v1[1].localeCompare(v2[1], "en", { sensitivity: "base" });
        });

        var html = "";
        html += "Command list:<br>";
        html += "<div style=\"background-color: #DADADA; font-family: monospace; font-size: 13px;\">";
        for(var i = 0; i < list.length; i++) {
            var row = list[i];
            var command = row[1];
            var args = row[2];
            var desc = row[3];
            var example = row[4];

            // display arguments for this command
            var arg_desc = "";
            if(args) {
                arg_desc += html_tag_esc("<");
                for(var v = 0; v < args.length; v++) {
                    var arg = args[v];
                    arg_desc += "<span style=\"font-style: italic\">" + html_tag_esc(arg) + "</span>";
                    if(v != args.length - 1) {
                        arg_desc += ", ";
                    }
                }
                arg_desc += html_tag_esc(">");
            }

            var exampleElm = "";
            if(example && args) {
                exampleElm = "title=\"" + html_tag_esc("Example: /" + command + " " + example) +"\"";
            }

            command = "<span " + exampleElm + "style=\"color: #00006F\">" + html_tag_esc(command) + "</span>";

            var help_row = html_tag_esc("-> /") + command + " " + arg_desc + " :: " + html_tag_esc(desc);

            // alternating stripes
            if(i % 2 == 1) {
                help_row = "<div style=\"background-color: #C3C3C3\">" + help_row + "</div>";
            }

            html += help_row;
        }

        html += "</div>";

        return html;
    }

    var com = {
        worlds: function() {
            var topCount = 1000;
            var lst = topActiveWorlds(topCount);
            var worldList = "";
            for(var i = 0; i < lst.length; i++) {
                var row = lst[i];
                if(row[1] == "") {
                    row[1] = "(main)"
                } else {
                    row[1] = "/" + html_tag_esc(row[1]);
                }
                worldList += "-> " + row[1] + " [" + row[0] + "]";
                if(i != lst.length - 1) worldList += "<br>"
            }
            var listWrapper = `
                <div style="background-color: #DADADA; font-family: monospace;">
                    ${worldList}
                </div>
            `;
            serverChatResponse("Currently loaded worlds (top " + topCount + "): " + listWrapper, data.location)
            return;
        },
        help: function() {
            return serverChatResponse(generate_command_list(), data.location);
        },
        block: function(id) {
            if(id != "*") {
                id = san_nbr(id);
                if(id < 0) return;
            }
            var blocks = ws.chat_blocks;
            if(blocks.length >= chatIdBlockLimit) return serverChatResponse("Too many blocked IDs", data.location);
            if(blocks.indexOf(id) > -1) return;
            blocks.push(id);
            serverChatResponse("Blocked chats from ID: " + id, data.location);
        },
        uptime: function() {
            serverChatResponse("Server uptime: " + uptime(), data.location);
        },
        getip: function(id) {
            id = san_nbr(id);
            if(id < 0) id = 0;
            var res = "Client [" + id + "]:<br><div style=\"background-color: #C0C0C0\">";
            var clientsFound = 0;

            if(data.location == "page") {
                if(client_ips[world.id] && client_ips[world.id][id]) {
                    var cli = client_ips[world.id][id];
                    var cli_ip = cli[0];
                    var cli_closed = cli[2];
                    if(clientsFound != 0) res += "<br>";
                    res += cli_ip + ", " + (cli_closed ? "disconnected" : "connected");
                    clientsFound++;
                }
            } else if(data.location == "global") {
                for(var c_world in client_ips) {
                    var c_obj = client_ips[c_world];
                    if(c_obj[id]) {
                        var cli = c_obj[id];
                        var cli_ip = cli[0];
                        var cli_closed = cli[2];
                        if(clientsFound != 0) res += "<br>";
                        res += "[world: " + c_world + "], " + (cli_closed ? "disconnected" : "connected");
                        clientsFound++;
                    }
                }
            }
            res += "</div>";
            if(clientsFound == 0) {
                res = "No clients found for id " + id;
            }
            serverChatResponse(res, data.location);
        },
        getclients: function() {
            var res = "Clients:<br><div style=\"background-color: #C0C0C0\">";
            var clientsFound = 0;
            wss.clients.forEach(function(ws) {
                if(!ws.userClient) return;
                if(data.location == "page") {
                    if(ws.world_id == world.id) {
                        if(clientsFound != 0) res += "<br>";
                        res += "[" + ws.clientId + "] " + ws.ipAddress;
                        clientsFound++;
                    }
                } else if(data.location == "global") {
                        if(clientsFound != 0) res += "<br>";
                        res += "[id: " + ws.clientId + ", world: " + ws.world_id + "] " + ws.ipAddress;
                        clientsFound++;
                }
            });
            res += "</div>";
            if(clientsFound == 0) {
                res = "No clients found";
            }
            serverChatResponse(res, data.location);
        }
    }

    // This is a command
    if(msg[0] == "/") {
        var args = msg.toLowerCase().substr(1).split(" ");
        var command = args[0];

        var operator  = user.operator;
        var superuser = user.superuser;
        var staff     = user.staff;

        switch(command) {
            case "worlds":
                if(superuser) com.worlds();
                return;
            case "help":
                com.help();
                return;
            case "uptime":
                if(operator) com.uptime();
                return;
            case "block":
                com.block(args[1]);
                return;
            case "getip":
                com.getip(args[1]);
                return;
            case "getclients":
                com.getclients();
                return;
            default:
                serverChatResponse("Invalid command: " + html_tag_esc(msg));
        }
    }

    var username_to_display = user.username;
    if(accountSystem == "uvias") {
        username_to_display = user.display_username;
    }
    var chatData = {
        nickname: nick,
        realUsername: username_to_display,
        id: clientId,
        message: msg,
        registered: user.authenticated,
        location: data.location,
        op: user.operator,
        admin: user.superuser,
        staff: user.staff,
        color: data.color
    };

    if(user.authenticated && user.id in ranks_cache.users) {
        var rank = ranks_cache[ranks_cache.users[user.id]];
        chatData.rankName = rank.name;
        chatData.rankColor = rank.chat_color;
    }

    var isCommand = false;
    if(msg.startsWith("/")) {
        isCommand = true;
    }

    if(!isCommand) {
        if(data.location == "page") {
            await add_to_chatlog(chatData, world.id);
        } else if(data.location == "global") {
            await add_to_chatlog(chatData, 0);
        }
    }

    var websocketChatData = Object.assign({
        kind: "chat",
        channel: vars.channel
    }, chatData);

    var chatOpts = {
        // Global and Page updates should not appear in worlds with chat disabled
        chat_perm,
        isChat: true,
        clientId
    };

    if(!isCommand) {
        if(data.location == "page") {
            broadcast(websocketChatData, chatOpts);
        } else if(data.location == "global") {
            ws_broadcast(websocketChatData, void 0, chatOpts);
        }
    }
}