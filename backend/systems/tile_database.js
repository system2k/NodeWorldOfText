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
var advancedSplit;

// Tile Animation Password
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
    advancedSplit = vars.advancedSplit;

    NOT_SO_SECRET += get_bypass_key();

    writeCycle();

    intv.clear_tdb_ratelims = setInterval(function() {
        var now = Date.now();
        for(var i in ratelimits) {
            var keys = ratelimits[i];
            for(var x in keys) {
                if(keys[x] <= now) {
                    delete keys[x];
                }
            }
        }
    }, 1000 * 60 * 5);
}

// caller ids. this returns information to a request that uploaded the edits to the server
var cids = {}; // [return_data, callback_function, is_processed]

var ratelimits = {};
function set_ratelimit(type, key, duration) {
    if(!ratelimits[type]) ratelimits[type] = {};
    var now = Date.now();
    ratelimits[type][key] = now + duration;
}
function check_ratelimit(type, key) {
    var now = Date.now();
    if(!ratelimits[type]) return false;
    if(!ratelimits[type][key]) return false;
    if(ratelimits[type][key] <= now) {
        delete ratelimits[type][key];
        return false;
    }
    return true;
}

function write_edits(tile, t, accepted, rejected, edit, data, editLog) {
    var tileY = edit[0];
    var tileX = edit[1];
    var charY = edit[2];
    var charX = edit[3];
    var time = edit[4];
    var char = edit[5];
    var editId = edit[6];
    var color = edit[7];
    var animation = edit[8];

    var world = data.world;
    var user = data.user;
    var public_only = data.public_only;
    var can_color_text = data.can_color_text;
    var no_log_edits = data.no_log_edits;
    var is_owner = data.is_owner;
    var is_member = data.is_member;

    var offset = charY * 16 + charX;
    var char_writability = t.charProt[offset];

    // permission checking - compute the writability of the cell, accounting for tile and world writing permissions
    if(char_writability == null) char_writability = tile ? tile.writability : null;
    if(char_writability == null) char_writability = world.writability;

    // tile is owner-only, but user is not owner
    if(char_writability == 2 && !is_owner) {
        rejected[editId] = "NO_TILE_PERM";
        return;
    }
    // tile is member-only, but user is not member (nor owner)
    if(char_writability == 1 && !is_owner && !is_member) {
        rejected[editId] = "NO_TILE_PERM";
        return;
    }

    // this edit request is only allowed to write on public areas
    if(public_only && char_writability != 0) {
        rejected[editId] = "NO_TILE_PERM";
        return;
    }

    accepted.push(editId);

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

    if(!no_log_edits) {
        var ar = [tileY, tileX, charY, charX, time, char, editId];
        if(color) ar.push(color);
        if(incAnimationEditLog) { // if animation is passed in edit
            if(ar.length == 7) ar.push(0); // keep elements aligned
            ar.push(animation)
        }

        editLog.push(ar);
    }
}

function write_link(call_id, tile, t, data) {
    var world = data.world;
    var user = data.user;
    var tileX = data.tileX;
    var tileY = data.tileY;
    var charX = data.charX;
    var charY = data.charY;
    var is_member = data.is_member;
    var is_owner = data.is_owner;
    var type = data.type;
    var link_tileX = data.link_tileX;
    var link_tileY = data.link_tileY;
    var url = data.url;

    var world_id = world.id;

    // at this stage, it is assumed that the user has permission to link (on allowed areas)
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

    cids[call_id][0] = [false, true];
}

function protect_area(call_id, tile, t, data) {
    var world = data.world;
    var user = data.user;
    var charX = data.charX;
    var charY = data.charY;
    var is_member = data.is_member;
    var is_owner = data.is_owner;
    var type = data.type;
    var precise = data.precise;
    var protect_type = data.protect_type;
    
    var world_id = world.id;

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

    cids[call_id][0] = [false, true];
}

async function loadTile(tileCache, world_id, tileX, tileY) {
    var tileUID = world_id + "," + tileY + "," + tileX;

    if(tileUID in tileCache) {
        return tileCache[tileUID];
    } else {
        var tile = await db.get("SELECT * FROM tile WHERE tileX=? AND tileY=? AND world_id=?", [tileX, tileY, world_id]);
        var t = {
            charProt: null,
            properties: null,
            tile_data: null,
            writability: null,
            oldWritability: null,
            createUndefTile: false
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
        t.oldWRitability = t.writability;
        tileCache[tileUID] = [tile, t];
        return tileCache[tileUID];
    }
}

function prepareTileUpdate(updatedTiles, tileX, tileY, t) {
    if(!updatedTiles[tileY + "," + tileX]) {
        updatedTiles[tileY + "," + tileX] = {
            content: t.tile_data,
            properties: {
                cell_props: t.properties.cell_props,
                color: t.properties.color,
                char: t.properties.char,
                writability: t.writability
            }
        }
    } else {
        var uTile = updatedTiles[tileY + "," + tileX];
        uTile.content = t.tile_data;
        var props = uTile.properties;
        props.cell_props = t.properties.cell_props;
        props.color = t.properties.color;
        props.char = t.properties.char;
        props.writability = t.writability;
    }
}

var queue = [];
async function flushQueue() {
    for(var i in cids) {
        cids[i][2] = true;
    }

    var queueLength = queue.length;

    var tileCache = {};

    for(var i = 0; i < queueLength; i++) {
        var operation = queue[0];
        queue.shift();
        
        var call_id = operation[0];
        var type = operation[1];
        var data = operation[2];

        var date = data.date;
        var user = data.user;
        var world = data.world;
        var channel = data.channel;
        var no_log_edits = data.no_log_edits;

        var updatedTiles = {};
        var updatedTilesBroadcast = false;

        if(type == types.write) {
            var tile_edits = data.tile_edits;

            var accepted = [];
            var rejected = {};
            var editLog = [];

            for(var e = 0; e < tile_edits.length; e++) {
                var edit = tile_edits[e];
                
                var tileY = edit[0];
                var tileX = edit[1];

                var tileUID = world.id + "," + tileY + "," + tileX;

                var tData = tileCache[tileUID] || await loadTile(tileCache, world.id, tileX, tileY);
                var tile = tData[0]; // tile Database object
                var t = tData[1]; // data processed from tile database object

                write_edits(tile, t, accepted, rejected, edit, data, editLog);
                t.createUndefTile = true;

                // send tile update to the client
                prepareTileUpdate(updatedTiles, tileX, tileY, t);
                updatedTilesBroadcast = true;
            }

            cids[call_id][0] = [accepted, rejected];

            if(!no_log_edits && editLog.length) {
                var editTileGroups = {};
                for(var d = 0; d < editLog.length; d++) {
                    var tileX = editLog[d][1];
                    var tileY = editLog[d][0];
                    var key = tileY + "," + tileX;
                    if(!editTileGroups[key]) editTileGroups[key] = [];
                    editTileGroups[key].push(editLog[d]);
                }
                for(var yx in editTileGroups) {
                    var posyx = yx.split(",");
                    var tileX = parseInt(posyx[1]);
                    var tileY = parseInt(posyx[0]);
                    var tileEdits = editTileGroups[yx];
                    await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)", // log the edit
                        [0, world.id, tileY, tileX, date, JSON.stringify(tileEdits)]);
                }
            }
        }
        if(type == types.link) {
            var tileY = data.tileY;
            var tileX = data.tileX;

            var tileUID = world.id + "," + tileY + "," + tileX;

            var tData = tileCache[tileUID] || await loadTile(tileCache, world.id, tileX, tileY);
            var tile = tData[0]; // tile Database object
            var t = tData[1]; // data processed from tile database object
            write_link(call_id, tile, t, data);
            t.createUndefTile = true;

            prepareTileUpdate(updatedTiles, tileX, tileY, t);
            updatedTilesBroadcast = true;
        }
        if(type == types.protect) {
            var tileY = data.tileY;
            var tileX = data.tileX;

            var tileUID = world.id + "," + tileY + "," + tileX;

            var tData = tileCache[tileUID] || await loadTile(tileCache, world.id, tileX, tileY);
            var tile = tData[0]; // tile Database object
            var t = tData[1]; // data processed from tile database object
            protect_area(call_id, tile, t, data);
            t.createUndefTile = true;

            prepareTileUpdate(updatedTiles, tileX, tileY, t);
            updatedTilesBroadcast = true;
        }
        if(type == types.clear) {
            var tileY = data.tileY;
            var tileX = data.tileX;
            
            var tData = tileCache[tileUID] || await loadTile(tileCache, world.id, tileX, tileY);
            var tile = tData[0]; // tile Database object
            var t = tData[1]; // data processed from tile database object

            for(var f in t.properties) {
                delete t.properties[f];
            }
            t.tile_data = " ".repeat(128);

            prepareTileUpdate(updatedTiles, tileX, tileY, t);
            updatedTilesBroadcast = true;

            await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)", // log the edit
                [user.id, world.id, tileY, tileX, date, "@{\"kind\":\"tile_clear\"}"]);
        }
        if(type == types.publicclear) {
            if(!user.superuser) {
                if(check_ratelimit("publicclear", world.id)) return;
                set_ratelimit("publicclear", world.id, 1000 * 60 * 2);
            }

            var chunkSize = 2048;
            var idx = 0;

            await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)",
                [user.id, world.id, 0, 0, Date.now(), "@{\"kind\":\"clear_public\"}"]);

            while(true) {
                var data = await db.all("SELECT * FROM tile WHERE world_id=? LIMIT ?,?",
                    [world.id, idx * chunkSize, chunkSize]);
                if(!data || data.length == 0) {
                    break;
                }
                for(var d = 0; d < data.length; d++) {
                    var tile = data[d];
                    var properties = JSON.parse(tile.properties);
                    // this tile contains precise char data
                    if(properties.char) {
                        var charData = decodeCharProt(properties.char);
                        var content = advancedSplit(tile.content);
                        var hasUpdated = false;
                        for(var r = 0; r < charData.length; r++) {
                            var char = charData[r];
                            var charX = r % 16;
                            var charY = Math.floor(r / 16);
                            var charWritability = char;
                            if(charWritability == null) charWritability = tile.writability;
                            if(charWritability == null) charWritability = world.writability;
                            if(char == 0 || charWritability == 0) {
                                hasUpdated = true;
                                content[r] = " ";
                                if(properties.cell_props) {
                                    if(properties.cell_props[charY]) {
                                        if(properties.cell_props[charY][charX]) {
                                            properties.cell_props[charY][charX] = {};
                                        }
                                    }
                                }
                            }
                        }
                        // update tile if a char has been updated
                        if(hasUpdated) {
                            content = content.join("");
                            properties = JSON.stringify(properties);
                            await db.run("UPDATE tile SET (content,properties)=(?,?) WHERE id=?",
                                [content, properties, tile.id]);
                        }
                    } else {
                        if(tile.writability == 0) {
                            await db.run("UPDATE tile SET (content,properties)=(?,?) WHERE id=?",
                                [" ".repeat(128), "{}", tile.id]);
                        } else if(tile.writability == null && world.writability == 0) {
                            // delete default tiles that are public too (null = default protection)
                            await db.run("UPDATE tile SET (content,properties)=(?,?) WHERE id=?",
                                [" ".repeat(128), "{}", tile.id]);
                        }
                    }
                }
                idx++;
            }
        }

        if(updatedTilesBroadcast) {
            wss.clients.forEach(function(client) {
                if(client.world_id == world.id && client.readyState == WebSocket.OPEN) {
                    try {
                        client.send(JSON.stringify({
                            channel,
                            kind: "tileUpdate",
                            source: "write",
                            tiles: updatedTiles
                        }))
                    } catch(e) {
                        handle_error(e);
                    }
                }
            })
        }
    }

    // apply the changes to the database
    for(var wyx in tileCache) {
        var UID = wyx.split(",");
        var world_id = parseInt(UID[0]);
        var tileY = parseInt(UID[1]);
        var tileX = parseInt(UID[2]);
        var tile = tileCache[wyx][0];
        var t = tileCache[wyx][1];

        var writabilityChanged = (t.writability != t.oldWritability);

        if(tile) { // tile exists, update
            if(writabilityChanged) {
                await db.run("UPDATE tile SET (writability, content, properties)=(?, ?, ?) WHERE id=?",
                    [t.writability, t.tile_data, JSON.stringify(t.properties), tile.id]);
            } else {
                await db.run("UPDATE tile SET (content, properties)=(?, ?) WHERE id=?",
                    [t.tile_data, JSON.stringify(t.properties), tile.id]);
            }
        } else if(t.createUndefTile) { // tile doesn't exist, insert
            if(writabilityChanged) {
                await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?, ?)",
                    [world_id, t.tile_data, tileY, tileX, JSON.stringify(t.properties), t.writability, Date.now()]);
            } else {
                await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
                    [world_id, t.tile_data, tileY, tileX, JSON.stringify(t.properties), Date.now()]);
            }
        }
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

var cycleTimeout = Math.floor(1000 / 60);
async function writeCycle() {
    if(queue.length) {
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
            cids[id][1] = res;
        } else {
            console.log("An error occured while sending back an edit response");
        }
    })
}

module.exports.write = function(call_id, type, data) {
    queue.push([call_id, type, data]);
}

module.exports.reserveCallId = function(id) {
    if(!cids[id]) cids[id] = [null, null, false];
}

var current_call_id = 0;
module.exports.newCallId = function() {
    return current_call_id++;
}

var types = {
    write: 0,
    link: 1,
    protect: 2,
    clear: 3,
    publicclear: 4
}

module.exports.types = types;