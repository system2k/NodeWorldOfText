module.exports = {};

var db;
var decodeCharProt;
var insert_char_at_index;
var handle_error;
var g_transaction;
var intv;
var wss;
var WebSocket;

module.exports.main = function(vars) {
    db = vars.db;
    decodeCharProt = vars.decodeCharProt;
    insert_char_at_index = vars.insert_char_at_index;
    handle_error = vars.handle_error;
    g_transaction = vars.g_transaction;
    intv = vars.intv;
    wss = vars.wss;
    WebSocket = vars.WebSocket;

    writeCycle();
}

var nextEdits = {};
var editsAvailableInQueue = false;

// caller ids. this returns information to a request that uploaded the edits to the server
var cids = {}; // [accepted[], rejected{}]

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
        var charProt;
        var properties;
        var tile_data;
        var writability;
        if(tile) {
            properties = JSON.parse(tile.properties);
            if(!properties.color) {
                properties.color = Array(128).fill(0)
            }
            if(properties.char) {
                charProt = decodeCharProt(properties.char);
            } else {
                charProt = new Array(128).fill(null);
            }
            tile_data = tile.content;
            writability = tile.writability;
        } else {
            // tile does not exist. this is an empty tile
            properties = {
                color: Array(128).fill(0)
            }
            charProt = new Array(128).fill(null);
            tile_data = " ".repeat(128);
            writability = null;
        }

        var edits = nextEditsCpy[i];

        // assumes it receives an edit for a single character. multi-character edits are
        // partitioned automatically in a different procedure
        for(var e = 0; e < edits.length; e++) {
            var edit = edits[e];

            var charX = edit[0];
            var charY = edit[1];
            var char = edit[2];
            var color = edit[3];
            var data = edit[4];

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
            var write_data_call_id = data.write_data_call_id;

            var offset = charY * 16 + charX;

            var char_writability = charProt[offset];

            // repeated again to make sure
            if(!cids[write_data_call_id]) cids[write_data_call_id] = [[], {}];

            // permission checking - compute the writability of the cell, accounting for tile and world writing permissions
            if(char_writability == null) char_writability = tile ? tile.writability : null;
            if(char_writability == null) char_writability = world.writability;

            // tile is owner-only, but user is not owner
            if(char_writability == 2 && !is_owner) {
                cids[write_data_call_id][1][editId] = "NO_TILE_PERM";
                continue;
            }
            // tile is member-only, but user is not member (nor owner)
            if(char_writability == 1 && !is_owner && !is_member) {
                cids[write_data_call_id][1][editId] = "NO_TILE_PERM";
                continue;
            }

            // this edit request is only allowed to write on public areas
            if(public_only && char_writability != 0) {
                cids[write_data_call_id][1][editId] = "NO_TILE_PERM";
                continue;
            }

            cids[write_data_call_id][0].push(editId);

            tile_data = insert_char_at_index(tile_data, char, offset);

            if(!can_color_text) color = 0;
            if(color !== -1) {
                properties.color[offset] = color;
            }

            // detect overriden links
            if(properties.cell_props) {
                if(properties.cell_props[charY]) {
                    // clear properties for this char
                    if(properties.cell_props[charY][charX]) {
                        delete properties.cell_props[charY][charX];
                    }
                    // the row for this tile is empty
                    if(Object.keys(properties.cell_props[charY]).length == 0) {
                        delete properties.cell_props[charY];
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
            upd[0] = tile_data;
            upd[1] = properties;
            upd[2] = writability;

            if(!no_log_edits) {
                var ar = [tileY, tileX, charY, charX, 0 /*time. save bytes. already in column*/, char, editId];
                if(color) ar.push(color);
                if(animation) {
                    if(!color) ar.push(0); // keep elements aligned
                    ar.push(animation)
                }

                editLog.push([time, ar, 0, world.id]);
            }
        }

        if(tile) { // tile exists, update
            await db.run("UPDATE tile SET (content, properties)=(?, ?) WHERE id=?",
                [tile_data, JSON.stringify(properties), tile.id])
        } else { // tile doesn't exist, insert
            await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
                [world_id, tile_data, tileY, tileX, JSON.stringify(properties), time])
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
        var func = call[2];
        var applied = call[3];
        if(!applied) continue; // if these call ids were added during the database write, don't discard
        if(func) {
            func([call[0], call[1]]);
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
            handle_error(e); /////////////////////////////////////////////////////////////////////////////////////////////////
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
            console.log("Error, tile_database.js, editResponse, 01");
        }
    })
}

module.exports.write = function(tileX, tileY, charX, charY, char, color, world_id, data) {
    var key = tileY + "," + tileX + "," + world_id;

    var queue = nextEdits[key];
    if(!queue) {
        nextEdits[key] = [];
        queue = nextEdits[key];
    }

    queue.push([charX, charY, char, color, data]);
    editsAvailableInQueue = true;
}

module.exports.reserveCallId = function(id) {
    if(!cids[id]) cids[id] = [[], {}, null, false];
}