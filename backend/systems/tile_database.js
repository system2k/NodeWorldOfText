var db;
var decodeCharProt;
var insert_char_at_index;
var handle_error;
var g_transaction;
var intv;
var wss;
var WebSocket;
var san_nbr;
var fixColors;
var get_bypass_key;
var encodeCharProt;

// Animation Feature Password
//let's leave this as just a feature for who knows this secret top top secret
var NOT_SO_SECRET = "@^&$%!#*%^#*)~@$^*#!)~*%38259`25equfahgrqieavkj4bh8ofweieagrHG*FNV#@#OIFENUOGIVEOSFKNL<CDOLFKEWNSCOIEAFM:COGPEWWRG>BVPZL:MBGOEWSV";

module.exports.main = function(vars) {
    db = vars.db;
    decodeCharProt = vars.decodeCharProt;
    insert_char_at_index = vars.insert_char_at_index;
    handle_error = vars.handle_error;
    g_transaction = vars.g_transaction;
    intv = vars.intv;
    wss = vars.wss;
    WebSocket = vars.WebSocket;
    san_nbr = vars.san_nbr;
    fixColors = vars.fixColors;
    get_bypass_key = vars.get_bypass_key;
    encodeCharProt = vars.encodeCharProt;

    NOT_SO_SECRET += get_bypass_key();

    writeCycle();
}

// caller ids. this returns information to a request that uploaded the edits to the server
var cids = {}; // [accepted[], rejected{}]

function write_edits(tileX, tileY, edit, tile, t, tileUpdates, world_id, editLog) {
    var call_id = edit[0];
    var data = edit[2];

    var world = data.world;
    var user = data.user;
    var time = data.time;
    var editId = data.editId;
    var animation = data.animation;
    var public_only = data.public_only;
    var can_color_text = data.can_color_text;
    var no_log_edits = data.no_log_edits;
    var is_owner = data.is_owner;
    var is_member = data.is_member;
    var char = data.char;
    var color = data.color;
    var charX = data.charX;
    var charY = data.charY;

    var offset = charY * 16 + charX;

    var char_writability = t.charProt[offset];

    // call-id template (for char edits)
    cids[call_id][0] = [[], {}];

    // permission checking - compute the writability of the cell, accounting for tile and world writing permissions
    if(char_writability == null) char_writability = tile ? tile.writability : null;
    if(char_writability == null) char_writability = world.writability;

    // tile is owner-only, but user is not owner
    if(char_writability == 2 && !is_owner) {
        cids[call_id][0][1][editId] = "NO_TILE_PERM";
        return;
    }
    // tile is member-only, but user is not member (nor owner)
    if(char_writability == 1 && !is_owner && !is_member) {
        cids[call_id][0][1][editId] = "NO_TILE_PERM";
        return;
    }

    // this edit request is only allowed to write on public areas
    if(public_only && char_writability != 0) {
        cids[call_id][0][1][editId] = "NO_TILE_PERM";
        return;
    }

    cids[call_id][0][0].push(editId);

    t.tile_data = insert_char_at_index(t.tile_data, char, offset);

    if(!can_color_text) color = 0;
    if(color !== -1) {
        t.properties.color[offset] = color;
    }

    // detect overriden links
    if(t.properties.cell_props) {
        if(t.properties.cell_props[charY]) {
            // clear properties for this char
            if(t.properties.cell_props[charY][charX]) {
                delete t.properties.cell_props[charY][charX];
            }
            // the row for this tile is empty
            if(Object.keys(t.properties.cell_props[charY]).length == 0) {
                delete t.properties.cell_props[charY];
            }
        }
    }

    // animation --> [notSoSecret, changeInterval, repeat, frames]
    // notSoSecret must be the value of NOT_SO_SECRET, changeInterval is in milliseconds (1/1000 of a second) and repeat is a boolean (true/false)
    // frames --> [frame0, frame1, ..., frameN], maximum 999 frames
    // frame --> [TEXT, COLORS] where TEXT is a 128 character string, and COLORS is an array of 128 colors
    var incAnimationEditLog = false; // valid animation with valid password
    if(Array.isArray(animation) && (animation.length === 4)) {
        // Animation code.
        var notSoSecret = animation[0]
        if ((typeof notSoSecret == "string") && (notSoSecret === NOT_SO_SECRET)) {
            incAnimationEditLog = true;
            var changeInterval = san_nbr(animation[1]);
            if (changeInterval < 500) changeInterval = 500; // so it won't be very very fast
            var repeat = animation[2];
            if (typeof repeat != "boolean") {
                repeat = false;
            }
            var frames = animation[3];
            if (Array.isArray(frames) && (frames.length > 0) && (frames.length < 1000)) { // 999 is maximum frames
                var okFrames = [];
                for (var f = 0; f < frames.length; f++) {
                    var frame = frames[f];
                    var frameText = frame[0];
                    var frameColors = fixColors(frame[1]);
                    if ((typeof frameText == "string") && (frameText.length == 128)) {
                        okFrames.push([frameText, frameColors]);
                    }
                }
                if (okFrames.length) {
                    t.properties.animation = {
                        changeInterval,
                        repeat,
                        frames: okFrames
                    };
                }
            }
        }
    }

    if(!tileUpdates[world_id]) {
        tileUpdates[world_id] = {};
    }
    if(!tileUpdates[world_id][tileY + "," + tileX]) {
        tileUpdates[world_id][tileY + "," + tileX] = ["", {}, null];
    }

    var upd = tileUpdates[world_id][tileY + "," + tileX];
    upd[0] = t.tile_data;
    upd[1] = t.properties;
    upd[2] = t.writability;

    if(!no_log_edits) {
        var ar = [tileY, tileX, charY, charX, 0 /*time*/, char, editId];
        if(color) ar.push(color);
        if(incAnimationEditLog) { // if animation is passed in edit
            if(!color) ar.push(0); // keep elements aligned
            ar.push(animation)
        }

        editLog.push([time, ar, 0, world.id]);
    }
}

function write_link(tileX, tileY, edit, tile, t, tileUpdates, world_id) {
    var call_id = edit[0];
    var data = edit[2];

    var world = data.world;
    var user = data.user;
    var charX = data.charX;
    var charY = data.charY;
    var is_member = data.is_member;
    var is_owner = data.is_owner;
    var type = data.type;
    var link_tileX = data.link_tileX;
    var link_tileY = data.link_tileY;
    var url = data.url;

    // at this stage, it is assumed that the user can link
    var can_link = true;

    var tile_props = t.properties;
    var charProt = t.charProt;

    var char_writability = charProt[charY * 16 + charX];
    if(char_writability == null) char_writability = tile ? tile.writability : null; // inherit from tile
    if(char_writability == null) char_writability = world.writability; // inherit from world

    // if the areas are protected and the user's perms do not match
    if(char_writability == 2 && !is_owner) {
        can_link = false;
    }
    if(char_writability == 1 && !is_member) {
        can_link = false;
    }

    if(!can_link) {
        cids[call_id][0] = [true, "PERM"];
        return;
    }

    if(!tile_props.cell_props) tile_props.cell_props = {};
    if(!tile_props.cell_props[charY]) tile_props.cell_props[charY] = {};
    if(!tile_props.cell_props[charY][charX]) tile_props.cell_props[charY][charX] = {};

    if(typeof url != "string") url = "";
    if(type == "url") {
        tile_props.cell_props[charY][charX].link = {
            type: "url",
            url: url.slice(0, 10064) // size limit of urls
        }
    } else if(type == "coord") {
        tile_props.cell_props[charY][charX].link = {
            type: "coord",
            link_tileY: link_tileY,
            link_tileX: link_tileX
        }
    }

    if(!tileUpdates[world_id]) {
        tileUpdates[world_id] = {};
    }
    if(!tileUpdates[world_id][tileY + "," + tileX]) {
        tileUpdates[world_id][tileY + "," + tileX] = ["", {}, null];
    }

    var upd = tileUpdates[world_id][tileY + "," + tileX];
    upd[0] = t.tile_data;
    upd[1] = t.properties;
    upd[2] = t.writability;

    cids[call_id][0] = [false, true];
}

function protect_area(tileX, tileY, edit, tile, t, tileUpdates, world_id) {
    var call_id = edit[0];
    var data = edit[2];

    var world = data.world;
    var user = data.user;
    var charX = data.charX;
    var charY = data.charY;
    var is_member = data.is_member;
    var is_owner = data.is_owner;
    var type = data.type;
    var precise = data.precise;
    var protect_type = data.protect_type;

    var properties = t.properties;
    var charProt = t.charProt;

    var writability = null; // current writability of the target (tile or char)

    if(tile) {
        if(precise) {
            var code = charProt[charY * 16 + charX];
            if(code == null) {
                writability = tile.writability
                if(writability == null) {
                    writability = world.writability;
                }
            } else {
                writability = code;
            }
        } else {
            writability = tile.writability;
        }
    } else {
        writability = world.writability;
    }
    // this 'writability' variable cannot be null, only 0-2

    var can_owner = is_owner;
    var can_member = is_owner || (is_member &&
        world.feature_membertiles_addremove && writability < 2);

    if(!(can_owner || can_member)) {
        cids[call_id][0] = [true, "PERM"];
        return;
    }

    var new_writability;
    if(precise) {
        new_writability = tile ? tile.writability : null;
    } else {
        if(can_owner) {
            new_writability = protect_type;
        } else if(can_member && protect_type < 2) {
            new_writability = protect_type;
        } else {
            new_writability = tile ? tile.writability : null;
        }
    }

    if(precise) {
        var idx = charY * 16 + charX;
        var char_writability = charProt[idx];
        if(char_writability == null) char_writability = writability;

        var char_can_member = can_owner || (can_member && char_writability != 2);

        if(protect_type == 2 && can_owner) {
            charProt[idx] = 2;
        }
        if(protect_type == 1 && char_can_member) {
            charProt[idx] = 1;
        }
        if(protect_type == 0 && char_can_member) {
            charProt[idx] = 0;
        }
        if(protect_type == null && char_can_member) {
            charProt[idx] = null;
        }
    } else {
        for(var i = 0; i < 128; i++) {
            var char_writability = charProt[i];
            if(char_writability == null) char_writability = writability;

            var char_can_member = can_owner || (can_member && char_writability != 2);

            if(protect_type == 2 && can_owner) {
                charProt[i] = 2;
            }
            if(protect_type == 1 && char_can_member) {
                charProt[i] = 1;
            }
            if(protect_type == 0 && char_can_member) {
                charProt[i] = 0;
            }
            if(protect_type == null && char_can_member) {
                charProt[i] = null;
            }
        }
    }

    // if entire array is the same, simplify it
    var mainWritability = -1;
    var consistent = true;
    for(var i = 0; i < 128; i++) {
        var writ = charProt[i];
        if(mainWritability == -1) {
            mainWritability = writ;
            continue;
        }
        if(mainWritability != writ) {
            consistent = false;
            break;
        };
    }

    if(consistent) {
        // don't include null, because a protection will be cancelled out if the tile is full-null
        if(mainWritability != null) {
            new_writability = mainWritability;
        }
        delete properties.char;
    } else {
        properties.char = encodeCharProt(charProt);
    }

    t.writability = new_writability;

    if(!tileUpdates[world_id]) {
        tileUpdates[world_id] = {};
    }
    if(!tileUpdates[world_id][tileY + "," + tileX]) {
        tileUpdates[world_id][tileY + "," + tileX] = ["", {}, null];
    }

    var upd = tileUpdates[world_id][tileY + "," + tileX];
    upd[0] = t.tile_data;
    upd[1] = t.properties;
    upd[2] = t.writability;

    cids[call_id][0] = [false, true];
}

var nextEdits = {};
var editsAvailableInQueue = false;

async function flushQueue() {
    for(var i in cids) {
        cids[i][3] = true;
    }

    var tileUpdates = {};

    var nextEditsCpy = nextEdits;
    nextEdits = {};
    var editLog = [];
    for(var i in nextEditsCpy) {
        var pos = i.split(",");
        var tileX = parseInt(pos[1]);
        var tileY = parseInt(pos[0]);
        var world_id = parseInt(pos[2]);

        var tile = await db.get("SELECT * FROM tile WHERE tileX=? AND tileY=? and world_id=?", [tileX, tileY, world_id]);
        var t = {
            charProt: null,
            properties: null,
            tile_data: null,
            writability: null
        }
        if(tile) {
            t.properties = JSON.parse(tile.properties);
            if(!t.properties.color) {
                t.properties.color = Array(128).fill(0)
            }
            if(t.properties.char) {
                t.charProt = decodeCharProt(t.properties.char);
            } else {
                t.charProt = new Array(128).fill(null);
            }
            t.tile_data = tile.content;
            t.writability = tile.writability;
        } else {
            // tile does not exist. this is an empty tile
            t.properties = {
                color: Array(128).fill(0)
            }
            t.charProt = new Array(128).fill(null);
            t.tile_data = " ".repeat(128);
            t.writability = null;
        }

        // some write functions may change the writability. this is the old writability for reference when updating the tile
        var oldWritability = t.writability;

        var edits = nextEditsCpy[i];

        // assumes it receives an edit for a single character. multi-character edits are
        // partitioned automatically in a different procedure
        for(var e = 0; e < edits.length; e++) {
            var edit = edits[e];

            var eType = edit[1];

            if(eType == type.write) {
                write_edits(tileX, tileY, edit, tile, t, tileUpdates, world_id, editLog);
            }
            if(eType == type.link) {
                write_link(tileX, tileY, edit, tile, t, tileUpdates, world_id);
            }
            if(eType == type.protect) {
                protect_area(tileX, tileY, edit, tile, t, tileUpdates, world_id);
            }
        }

        var writabilityChanged = oldWritability != t.writability;

        if(tile) { // tile exists, update
            if(writabilityChanged) {
                await db.run("UPDATE tile SET (writability, content, properties)=(?, ?, ?) WHERE id=?",
                    [t.writability, t.tile_data, JSON.stringify(t.properties), tile.id]);
            } else {
                await db.run("UPDATE tile SET (content, properties)=(?, ?) WHERE id=?",
                    [t.tile_data, JSON.stringify(t.properties), tile.id]);
            }
        } else { // tile doesn't exist, insert
            if(writabilityChanged) {
                await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?, ?)",
                    [world_id, t.tile_data, tileY, tileX, JSON.stringify(t.properties), t.writability, Date.now()]);
            } else {
                await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
                    [world_id, t.tile_data, tileY, tileX, JSON.stringify(t.properties), Date.now()]);
            }
        }
    }

    editLog.sort(function(a, b) {
        return a[0] - b[0];
    })

    var currentUser = null;
    var currentWorld = null;
    var currentTileX = null;
    var currentTileY = null;
    var currentEdits = [];
    // insert edits at the correct order in the correct group
    for(var i = 0; i < editLog.length; i++) {
        var time = editLog[i][0];
        var edit = editLog[i][1];
        var tileX = edit[1];
        var tileY = edit[0];
        var charX = edit[3];
        var charY = edit[2];
        var user = editLog[i][2];
        var world = editLog[i][3];
        // this is the initial edit
        if(currentWorld == null) {
            currentUser = user;
            currentWorld = world;
            currentTileX = tileX;
            currentTileY = tileY;
        }
        // different group, adjust
        if(currentUser != user || currentWorld != world || currentTileX != tileX || currentTileY != tileY) {
            if(currentEdits) {
                await writeEditDatabase(currentEdits, tileX, tileY, user, world, time);
            }
            currentEdits = [];
            currentEdits.push(edit);
            currentUser = user;
            currentWorld = world;
            currentTileX = tileX;
            currentTileY = tileY;
        } else {
            currentEdits.push(edit);
        }
        // reached the end and there's pending edits
        if(i >= editLog.length - 1 && currentEdits) {
            await writeEditDatabase(currentEdits, tileX, tileY, user, world, time);
        }
    }

    for(var w_id in tileUpdates) {
        var world_upd = tileUpdates[w_id];

        var tupd = {};

        for(var t_coord in world_upd) {
            var tile = world_upd[t_coord];

            tupd[t_coord] = {
                content: tile[0],
                properties: Object.assign(tile[1], {
                    writability: tile[2]
                })
            }
        }

        wss.clients.forEach(function(client) {
            if(client.world_id == w_id && client.readyState == WebSocket.OPEN) {
                try {
                    client.send(JSON.stringify({
                        channel: "",
                        kind: "tileUpdate",
                        source: "write",
                        tiles: tupd
                    }))
                } catch(e) {
                    handle_error(e);
                }
            }
        })
    }

    for(var i in cids) {
        var call = cids[i];
        var retData = call[0];
        var func = call[1];
        var applied = call[2];
        if(!applied) continue; // if these call ids were added during the database write, don't discard
        if(func) {
            func(retData);
        }
        delete cids[i];
    }
}

async function writeEditDatabase(edits, tileX, tileY, user_id, world_id, time) {
    await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)", // log the edit
        [user_id, world_id, tileY, tileX, time, JSON.stringify(edits)])
}

var cycleTimeout = Math.floor(1000 / 60);
async function writeCycle() {
    if(editsAvailableInQueue) {
        editsAvailableInQueue = false;
        await g_transaction.begin();
        try {
            await flushQueue();
        } catch(e) {
            handle_error(e);
        }
        await g_transaction.end();
        intv.writeCycle = setTimeout(writeCycle, cycleTimeout);
    } else {
        intv.writeCycle = setTimeout(writeCycle, cycleTimeout);
    }
}

module.exports.editResponse = async function(id) {
    return new Promise(function(res) {
        if(cids[id]) {
            cids[id][2] = res;
        } else {
            console.log("An error occured while sending back an edit response");
        }
    })
}

module.exports.write = function(call_id, type, data) {
    var tileX = data.tileX;
    var tileY = data.tileY;
    var world_id = data.world.id;

    var key = tileY + "," + tileX + "," + world_id;

    var queue = nextEdits[key];
    if(!queue) {
        nextEdits[key] = [];
        queue = nextEdits[key];
    }

    queue.push([call_id, type, data]);
    editsAvailableInQueue = true;
}

module.exports.reserveCallId = function(id) {
    if(!cids[id]) cids[id] = [null, null, false];
}

var current_call_id = 0;
module.exports.newCallId = function() {
    return current_call_id++;
}

var type = {
    write: 0,
    link: 1,
    protect: 2
}

module.exports.type = type;