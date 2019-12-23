var db;
var db_edits;
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
var change_char_in_array;
var memTileCache;

module.exports.main = function(vars) {
    db = vars.db;
    db_edits = vars.db_edits;
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
    change_char_in_array = vars.change_char_in_array;
    memTileCache = vars.memTileCache;

    //writeCycle();
    databaseClock();

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
// [response_callback, response_data, completion_callback, total_units, current_units]
// total_units must be >0
var cids = {};

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

function is_consistent(array) {
    var consistentValue;
    var cvSet = false;
    for(var i = 0; i < array.length; i++) {
        if(!cvSet) {
            cvSet = true;
            consistentValue = array[i];
            continue;
        }
        if(array[i] != consistentValue) {
            return false;
        }
    }
    return true;
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
                    await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)", // log the edit
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

            var linkArch = {
                kind: "link",
                charX: data.charX,
                charY: data.charY
            };
            if(data.type == "url") {
                linkArch.link_type = 0;
                linkArch.link_tileX = null;
                linkArch.link_tileY = null;
                linkArch.url = data.url;
            } else if(data.type == "coord") {
                linkArch.link_type = 1;
                linkArch.link_tileX = data.link_tileX;
                linkArch.link_tileY = data.link_tileY;
                linkArch.url = "";
            }
            await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)",
                [0, world.id, tileY, tileX, Date.now(), "@" + JSON.stringify(linkArch)]);

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

            var protArch = {
                kind: "protect",
                protect_type: data.protect_type,
                precise: !!data.precise,
                charX: data.charX,
                charY: data.charY
            };
            await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)",
                [0, world.id, tileY, tileX, Date.now(), "@" + JSON.stringify(protArch)]);

            prepareTileUpdate(updatedTiles, tileX, tileY, t);
            updatedTilesBroadcast = true;
        }
        if(type == types.clear) {
            var tileY = data.tileY;
            var tileX = data.tileX;
            var tileUID = world.id + "," + tileY + "," + tileX;
            var tData = tileCache[tileUID] || await loadTile(tileCache, world.id, tileX, tileY);
            var tile = tData[0]; // tile Database object
            var t = tData[1]; // data processed from tile database object

            for(var f in t.properties) {
                delete t.properties[f];
            }
            t.tile_data = " ".repeat(CONST.tileArea);
            t.properties.color = Array(CONST.tileArea).fill(0);

            prepareTileUpdate(updatedTiles, tileX, tileY, t);
            updatedTilesBroadcast = true;

            await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)", // log the edit
                [user.id, world.id, tileY, tileX, date, "@{\"kind\":\"tile_clear\"}"]);
        }
        if(type == types.publicclear) {
            if(!user.superuser) {
                if(check_ratelimit("publicclear", world.id)) return;
                set_ratelimit("publicclear", world.id, 1000 * 60 * 2);
            }

            var chunkSize = 2048;
            var idx = 0;

            await db_edits.run("INSERT INTO edit VALUES(?, ?, ?, ?, ?, ?)",
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
                            var charX = r % CONST.tileCols;
                            var charY = Math.floor(r / CONST.tileCols);
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
                                [" ".repeat(CONST.tileArea), "{}", tile.id]);
                        } else if(tile.writability == null && world.writability == 0) {
                            // delete default tiles that are public too (null = default protection)
                            await db.run("UPDATE tile SET (content,properties)=(?,?) WHERE id=?",
                                [" ".repeat(CONST.tileArea), "{}", tile.id]);
                        }
                    }
                }
                idx++;
            }
        }
        if(type == types.paste) {
            var tileX = data.tileX;
            var tileY = data.tileY;
            var charX = data.charX;
            var charY = data.charY;
            var text = advancedSplit(data.text);
            var buckets = {};
            var currColor = 0;
            var index = 0;
            while(true) {
                var chr = text[index];
                if(chr.indexOf("\0") > -1) chr = " ";
                var tstr = tileY + "," + tileX;
                if(chr == "\n") {
                    charX = data.charX;
                    tileX = data.tileX;
                    charY++;
                    if(charY >= CONST.tileRows) {
                        charY = 0;
                        tileY++;
                    }
                    index++;
                } else {
                    if(!buckets[tstr]) buckets[tstr] = [[], []];

                    var hex = "ABCDEF";
                    if(chr == "\x1b") {
                        var hCode = text[index + 1];
                        if(hCode == "$") {
                            index += 2;
                            var lType = text[index];
                            index++;
                            if(lType == "c") {
                                var strPoint = index;
                                var buf = "";
                                var mode = 0;
                                while(true) {
                                    if(text[strPoint] == "[" && mode == 0) {
                                        mode = 1;
                                        if(++strPoint >= text.length) break;
                                        continue;
                                    }
                                    if(text[strPoint] == "]" && mode == 1) {
                                        strPoint++;
                                        break;
                                    }
                                    if(mode == 1) {
                                        buf += text[strPoint];
                                        if(++strPoint >= text.length) break;
                                        continue;
                                    }
                                    if(++strPoint >= text.length) break;
                                }
                                index = strPoint;
                                buf = buf.split(",");
                                var coordTileX = parseInt(buf[0].trim());
                                var coordTileY = parseInt(buf[1].trim());
                                //if(Permissions.can_coordlink(state.userModel, state.worldModel)) {
                                    buckets[tstr][1].push(["coord", tileX, tileY, charX, charY, coordTileX, coordTileY]);
                                //}
                            } else if(lType == "u") {
                                var strPoint = index;
                                var buf = "";
                                var quotMode = 0;
                                while(true) {
                                    if(text[strPoint] == "\"" && quotMode == 0) {
                                        quotMode = 1;
                                        if(++strPoint >= text.length) break;
                                        continue;
                                    }
                                    if(text[strPoint] == "\"" && quotMode == 1) {
                                        strPoint++;
                                        break;
                                    }
                                    if(quotMode == 1) {
                                        if(text[strPoint] == "\\") {
                                            quotMode = 2;
                                            if(++strPoint >= text.length) break;
                                            continue;
                                        }
                                        buf += text[strPoint];
                                    }
                                    if(quotMode == 2) {
                                        buf += text[strPoint];
                                        quotMode = 1;
                                        if(++strPoint >= text.length) break;
                                        continue;
                                    }
                                    if(++strPoint >= text.length) break;
                                }
                                index = strPoint;
                                //if(Permissions.can_urllink(state.userModel, state.worldModel)) {
                                    buckets[tstr][1].push(["url", tileX, tileY, charX, charY, buf]);
                                //}
                            }
                        } else if(hCode == "P") { // contains area protections
                            index += 2;
                            var protType = parseInt(text[index]);
                            index++;
                            if(isNaN(protType)) return;
                            if(!(protType >= 0 && protType <= 2)) return;
                            if(protType <= 1) { // public, member
                               // if(!Permissions.can_protect_tiles(state.userModel, state.worldModel)) return;
                            }
                            if(protType == 2) { // owner
                                //if(!Permissions.can_admin(state.userModel, state.worldModel)) {
                                    protType = 1; // member
                                //}
                            }
                            buckets[tstr][1].push(["prot", tileX, tileY, charX, charY, protType]);
                        } else {
                            var cCol = "";
                            if(hCode == "x") {
                                cCol = "000000";
                                index += 2;
                            } else {
                                var code = hex.indexOf(hCode);
                                if(code > -1) {
                                    cCol = text.slice(index + 2, index + 2 + code + 1).join("");
                                    index += code + 1;
                                }
                                index += 2;
                            }
                            currColor = parseInt(cCol, 16);
                        }
                    } else {
                        buckets[tstr][0].push([tileY, tileX, charY, charX, 0, chr, 0, currColor]);
                        charX++;
                        if(charX >= CONST.tileCols) {
                            charX = 0;
                            tileX++;
                        }
                        index++;
                    }
                }
                if(index >= text.length) break;
            }
            for(var bk in buckets) {
                var pos = bk.split(",");
                var tileX = parseInt(pos[1]);
                var tileY = parseInt(pos[0]);

                var tileUID = world.id + "," + tileY + "," + tileX;

                var tData = tileCache[tileUID] || await loadTile(tileCache, world.id, tileX, tileY);
                var tile = tData[0]; // tile Database object
                var t = tData[1]; // data processed from tile database object

                var currTile = buckets[bk][0];
                var misc = buckets[bk][1];

                for(var x = 0; x < currTile.length; x++) {
                    write_edits(tile, t, null, null, currTile[x], data, null);
                }
                for(var x = 0; x < misc.length; x++) {
                    var type = misc[x][0];
                    var m_tileX = misc[x][1];
                    var m_tileY = misc[x][2];
                    var m_charX = misc[x][3];
                    var m_charY = misc[x][4];
                    if(type == "coord" || type == "url") {
                        var linkObj = {
                            user, world,
                            tileX: m_tileX, tileY: m_tileY,
                            charX: m_charX,
                            charY: m_charY,
                            is_member: data.is_member,
                            is_owner: data.is_owner,
                            type
                        };
                        if(type == "coord") {
                            linkObj.link_tileX = misc[x][5];
                            linkObj.link_tileY = misc[x][6];
                        } else if(type == "url") {
                            linkObj.url = misc[x][5];
                        }
                        write_link(null, tile, t, linkObj);
                    } else if(type == "prot") {
                        protect_area(null, tile, t, {
                            user, world,
                            tileX: m_tileX, tileY: m_tileY,
                            charX: m_charX,
                            charY: m_charY,
                            is_member: data.is_member,
                            is_owner: data.is_owner,
                            precise: true,
                            protect_type: misc[x][5]
                        });
                    }
                }
                t.createUndefTile = true;

                // send tile update to the client
                prepareTileUpdate(updatedTiles, tileX, tileY, t);
                updatedTilesBroadcast = true;
            }
            cids[call_id][0] = "COMPLETE";
        }

        if(updatedTilesBroadcast) {
            wss.clients.forEach(function(client) {
                if(!client.userClient) return;
                if(client.world_id == world.id && client.readyState == WebSocket.OPEN) {
                    try {
                        client.send(JSON.stringify({
                            channel,
                            kind: "tileUpdate",
                            source: "write",
                            tiles: updatedTiles
                        }));
                    } catch(e) {
                        handle_error(e);
                    }
                }
            });
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

/*var cycleTimeout = Math.floor(1000 / 60);
async function writeCycle() {
    if(queue.length) {
        try {
            await g_transaction.begin();
            await db_edits.run("BEGIN TRANSACTION");
            try {
                await flushQueue();
            } catch(e) {
                handle_error(e);
            }
            await g_transaction.end();
            await db_edits.run("COMMIT");
        } catch(e) {
            // TODO: end transaction if already started
            console.log("Cycle error on", Date.now());
            handle_error(e);
        }
        intv.writeCycle = setTimeout(writeCycle, cycleTimeout);
    } else {
        intv.writeCycle = setTimeout(writeCycle, cycleTimeout);
    }
}*/

async function loadTileCacheData(world_id, tileX, tileY) {
    var tile = await db.get("SELECT rowid as rowid, content, properties, writability FROM tile WHERE tileX=? AND tileY=? AND world_id=?", [tileX, tileY, world_id]);
    var t = {
        tile_id: null, // rowid; id must be set once inserted to database. null if does not exist yet.
        tile_exists: false, // is set to true once the tile is added to database
        content: null,
        writability: null,
        prop_color: null,
        prop_char: null,
        prop_cell_props: null,
        props_updated: false,
        content_updated: false,
        writability_updated: false,
        last_accessed: 0 // todo
    };
    if(tile) {
        var parsed_props = JSON.parse(tile.properties);
        if(parsed_props.color) {
            t.prop_color = parsed_props.color;
        } else {
            t.prop_color = new Array(CONST.tileArea).fill(0);
        }
        if(parsed_props.char) {
            t.prop_char = decodeCharProt(parsed_props.char);
        } else {
            t.prop_char = new Array(CONST.tileArea).fill(null);
        }
        if(parsed_props.cell_props) {
            t.prop_cell_props = parsed_props.cell_props;
        } else {
            t.prop_cell_props = {};
        }
        t.tile_exists = true;
        t.content = advancedSplit(tile.content);
        t.writability = tile.writability;
        t.tile_id = tile.rowid;
    } else {
        t.prop_color = new Array(CONST.tileArea).fill(0);
        t.prop_char = new Array(CONST.tileArea).fill(null);
        t.prop_cell_props = {};
        t.tile_exists = false;
        t.content = new Array(CONST.tileArea).fill(" ");
        t.writability = null;
        t.tile_id = null;
    }
    return t;
}

var fetch_tile_queue = [];
// Unique tile id tuple: "world_id,tile_y,_tile_x"

function lookupTileQueue(tileUID) {
    for(var i = 0; i < fetch_tile_queue.length; i++) {
        if(fetch_tile_queue[i][0] == tileUID) return fetch_tile_queue[i];
    }
    return null;
}

function IOProgress(callID) {
    if(!cids[callID]) return;
    cids[callID][4]++;
    if(cids[callID][4] >= cids[callID][3]) {
        var response = cids[callID][0];
        var completion = cids[callID][2];
        if(response) response(cids[callID][1]);
        if(completion) completion();
    }
}

function tileWriteEdits(cacheTile, editObj) {
    var editArray = editObj[1];
    var data = editObj[2];
    var sharedObj = editObj[3];
    var callID = editObj[4];

    var accepted = cids[callID][1][0];
    var rejected = cids[callID][1][1];

    var tileY = editArray[0];
    var tileX = editArray[1];
    var charY = editArray[2];
    var charX = editArray[3];
    var time = editArray[4];
    var char = editArray[5];
    var editID = editArray[6];
    var color = editArray[7];

    var world = data.world;
    var user = data.user;
    var public_only = data.public_only;
    var preserve_links = data.preserve_links;
    var can_color_text = data.can_color_text;
    var no_log_edits = data.no_log_edits;
    var is_owner = data.is_owner || (user.superuser && world.name == "");
    var is_member = data.is_member || (user.superuser && world.name == "");

    var index = charY * CONST.tileCols + charX;
    var char_writability = cacheTile.prop_char[index];

    // permission checking - compute the writability of the cell, accounting for tile and world writing permissions
    if(char_writability == null) char_writability = cacheTile.writability;
    if(char_writability == null) char_writability = world.writability;

    // tile is owner-only, but user is not owner
    if(char_writability == 2 && !is_owner) {
        if(rejected) rejected[editId] = "NO_TILE_PERM";
        IOProgress(callID);
        return;
    }
    // tile is member-only, but user is not member (nor owner)
    if(char_writability == 1 && !is_owner && !is_member) {
        if(rejected) rejected[editId] = "NO_TILE_PERM";
        IOProgress(callID);
        return;
    }

    // this edit request is only allowed to write on public areas
    if(public_only && char_writability != 0) {
        if(rejected) rejected[editId] = "NO_TILE_PERM";
        IOProgress(callID);
        return;
    }

    var char_updated = change_char_in_array(cacheTile.content, char, index);
    if(char_updated) {
        cacheTile.content_updated = true;
    }

    if(!can_color_text) color = 0;
    if(color !== -1) {
        var prevCol = cacheTile.prop_color[index];
        cacheTile.prop_color[index] = color;
        if(prevCol != color) cacheTile.props_updated = true;
    }

    // detect overriden links
    if(!preserve_links) {
        if(cacheTile.prop_cell_props[charY]) {
            // clear properties for this char
            if(cacheTile.prop_cell_props[charY][charX]) {
                delete cacheTile.prop_cell_props[charY][charX];
                cacheTile.props_updated = true;
            }
            // the row for this tile is empty
            if(Object.keys(cacheTile.prop_cell_props[charY]).length == 0) {
                delete cacheTile.prop_cell_props[charY];
                cacheTile.props_updated = true;
            }
        }
    }

    if(accepted) {
        accepted.push(editID);
    }
    if(char_updated && !no_log_edits && sharedObj.editLog) {
        var ar = [tileY, tileX, charY, charX, time, char, editID];
        if(color) ar.push(color);
        sharedObj.editLog.push(ar);
    }
    IOProgress(callID);
}

function tileWriteLinks(cacheTile, editObj) {
    var data = editObj[1];
    var sharedObj = editObj[2];
    var callID = editObj[3];

    var respData = cids[callID][1];

    var tileX = data.tileX;
    var tileY = data.tileY;
    var charX = data.charX;
    var charY = data.charY;
    var user = data.user;
    var world = data.world;
    var is_member = data.is_member || (user.superuser && world.name == "");
    var is_owner = data.is_owner || (user.superuser && world.name == "");
    var type = data.type;
    var url = data.url;
    var link_tileX = data.link_tileX;
    var link_tileY = data.link_tileY;

    var index = charY * CONST.tileCols + charX;
    var char_writability = cacheTile.prop_char[index];
    if(char_writability == null) char_writability = cacheTile.writability;
    if(char_writability == null) char_writability = world.writability;

    var can_link = true;

    // if the areas are protected and the user's perms do not match
    if(char_writability == 2 && !is_owner) {
        can_link = false;
    }
    if(char_writability == 1 && !is_member) {
        can_link = false;
    }

    if(!can_link) {
        respData[0] = true;
        respData[1] = "PERM";
        IOProgress(callID);
        return;
    }

    if(!cacheTile.prop_cell_props[charY]) cacheTile.prop_cell_props[charY] = {};
    if(!cacheTile.prop_cell_props[charY][charX]) cacheTile.prop_cell_props[charY][charX] = {};

    if(typeof url != "string") url = "";
    if(type == "url") {
        cacheTile.prop_cell_props[charY][charX].link = {
            type: "url",
            url: url.slice(0, 10064) // size limit of urls
        }
    } else if(type == "coord") {
        cacheTile.prop_cell_props[charY][charX].link = {
            type: "coord",
            link_tileY: link_tileY,
            link_tileX: link_tileX
        }
    }
    cacheTile.props_updated = true;

    respData[0] = false;
    respData[1] = true;
    IOProgress(callID);
}

function tileWriteProtections(cacheTile, editObj) {
    var data = editObj[1];
    var sharedObj = editObj[2];
    var callID = editObj[3];

    var respData = cids[callID][1];

    var tileX = data.tileX;
    var tileY = data.tileY;
    var charX = data.charX;
    var charY = data.charY;
    var user = data.user;
    var world = data.user;
    var is_member = data.is_member || (user.superuser && world.name == "");
    var is_owner = data.is_owner || (user.superuser && world.name == "");
    var type = data.type;
    var precise = data.precise;
    var protect_type = data.protect_type;

    var feature_perm = world.feature_membertiles_addremove;
    is_member = (is_member && feature_perm) || is_owner || (user.superuser && world.name == "");

    var tile_writability = cacheTile.writability;
    if(tile_writability == null) tile_writability = world.writability;

    var has_modified = false;

    if(precise) {
        var idx = charY * CONST.tileCols + charX;
        var char_writability = cacheTile.prop_char[idx];
        if(char_writability == null) char_writability = tile_writability;
        var area_perm = is_owner || (is_member && char_writability < 2);
        if(protect_type == 2 && area_perm && is_owner) {
            cacheTile.prop_char[idx] = 2;
            cacheTile.props_updated = true;
            has_modified = true;
        }
        if(protect_type == 1 && area_perm && is_member) {
            cacheTile.prop_char[idx] = 1;
            cacheTile.props_updated = true;
            has_modified = true;
        }
        if(protect_type == 0 && area_perm && is_member) {
            cacheTile.prop_char[idx] = 0;
            cacheTile.props_updated = true;
            has_modified = true;
        }
        if(protect_type == null && area_perm && is_member) {
            if(cacheTile.writability != null) {
                for(var n = 0; n < charProt.length; n++) {
                    if(charProt[n] == null) {
                        charProt[n] = cacheTile.writability;
                    }
                }
                cacheTile.writability = null;
                cacheTile.writability_updated = true;
            }
            cacheTile.prop_char[idx] = null;
            has_modified = true;
        }
        if(cacheTile.prop_char[0] != null && is_consistent(cacheTile.prop_char)) {
            cacheTile.writability = charProt[0];
            for(var i = 0; i < cacheTile.prop_char.length; i++) {
                cacheTile.prop_char[i] = null;
            }
            has_modified = true;
        }
    } else {
        var full_protection_complete = true;
        for(var i = 0; i < CONST.tileArea; i++) {
            var char_writability = cacheTile.prop_char[i];
            if(char_writability == null) char_writability = tile_writability;
            var area_perm = is_owner || (is_member && char_writability < 2);
            if(protect_type == 2) {
                if(area_perm && is_owner) {
                    cacheTile.prop_char[i] = 2;
                    cacheTile.props_updated = true;
                    has_modified = true;
                } else {
                    full_protection_complete = false;
                }
            }
            if(protect_type == 1) {
                if(area_perm && is_member) {
                    cacheTile.prop_char[i] = 1;
                    cacheTile.props_updated = true;
                    has_modified = true;
                } else {
                    full_protection_complete = false;
                }
            }
            if(protect_type == 0) {
                if(area_perm && is_member) {
                    cacheTile.prop_char[i] = 0;
                    cacheTile.props_updated = true;
                    has_modified = true;
                } else {
                    full_protection_complete = false;
                }
            }
            if(protect_type == null) {
                if(area_perm && is_member) {
                    cacheTile.prop_char[i] = null;
                    has_modified = true;
                } else {
                    full_protection_complete = false;
                }
            }
        }
        if(full_protection_complete) {
            // user can change protection of all chars in the tile, so change the protection of the tile itself
            for(var i = 0; i < cacheTile.prop_char.length; i++) {
                cacheTile.prop_char[i] = null;
            }
            cacheTile.props_updated = true;
            cacheTile.writability = protect_type;
            cacheTile.writability_updated = true;
        }
    }

    // no permission to modify
    if(!has_modified) {
        respData[0] = true;
        respData[1] = "PERM";
        IOProgress(callID);
        return;
    }

    respData[0] = false;
    respData[1] = true;
    IOProgress(callID);
}

function tileWriteClear(cacheTile, editObj) {
    var data = editObj[1];
    var sharedObj = editObj[2];
    var callID = editObj[3];

    var tileX = data.tileX;
    var tileY = data.tileY;
    var user = data.user;
    var world = data.world;
    var date = data.date;

    for(var x = 0; x < CONST.tileArea; x++) {
        cacheTile.content[x] = " ";
        cacheTile.prop_color[x] = 0;
    }
    for(var d in cacheTile.prop_cell_props) {
        delete cacheTile.prop_cell_props[d];
    }

    cacheTile.content_updated = true;
    cacheTile.props_updated = true;

    IOProgress(callID);
}

function processTileEdit(worldID, tileX, tileY, editData) {
    var cacheTile = isTileDIM(worldID, tileX, tileY);
    // the first element of an editData array must be the edit type
    for(var i = 0; i < editData.length; i++) {
        var editObj = editData[i];
        var editType = editObj[0];
        switch(editType) {
            case types.write:
                tileWriteEdits(cacheTile, editObj);
                break;
            case types.link:
                tileWriteLinks(cacheTile, editObj);
                break;
            case types.protect:
                tileWriteProtections(cacheTile, editObj);
                break;
            case types.clear:
                tileWriteClear(cacheTile, editObj);
                break;
        }
    }
}

function appendToUnloadedTileCache(worldID, tileX, tileY, editData) {
    var tile_uid = worldID + "," + tileY + "," + tileX;
    var qList = lookupTileQueue(tile_uid);
    if(qList) {
        qList[1].push(editData);
    } else {
        fetch_tile_queue.push([tile_uid, [editData]]);
    }
}

async function doShiftTileQueue() {
    if(!fetch_tile_queue.length) return;
    var qData = fetch_tile_queue[0];
    fetch_tile_queue.shift();
    var tile_uid = qData[0];
    var pending_edits = qData[1];

    var tile_vec3 = tile_uid.split(",");
    var world_id = parseInt(tile_vec3[0]);
    var tile_y = parseInt(tile_vec3[1]);
    var tile_x = parseInt(tile_vec3[2]);

    var tile = await loadTileCacheData(world_id, tile_x, tile_y);
    addTileMem(world_id, tile_x, tile_y, tile);
    processTileEdit(world_id, tile_x, tile_y, pending_edits);
}

var shiftTileQueueBusy = false;
async function stimulateTileQueue() {
    if(!fetch_tile_queue.length) return;
    if(shiftTileQueueBusy) return;
    shiftTileQueueBusy = true;
    while(true) {
        if(!fetch_tile_queue.length) break;
        await doShiftTileQueue();
    }
    shiftTileQueueBusy = false;
}

function arrayIsEntirely(arr, elm) {
    for(var i = 0; i < arr.length; i++) {
        if(arr[i] != elm) return false;
    }
    return true;
}

async function iterateDatabaseChanges() {
    for(var worldID in memTileCache) {
        for(var tileY in memTileCache[worldID]) {
            for(var tileX in memTileCache[worldID][tileY]) {
                var tile = memTileCache[worldID][tileY][tileX];
                if(!tile.props_updated && !tile.content_updated && !tile.writability_updated) continue;
                if(tile.tile_exists) {
                    if(tile.props_updated) {
                        tile.props_updated = false;
                        var propObj = {};
                        if(!arrayIsEntirely(tile.prop_color, 0)) {
                            propObj.color = tile.prop_color;
                        }
                        if(!arrayIsEntirely(tile.prop_char, null)) {
                            propObj.char = encodeCharProt(tile.prop_char);
                        }
                        if(Object.keys(tile.prop_cell_props).length > 0) {
                            propObj.cell_props = tile.prop_cell_props;
                        }
                        await db.run("UPDATE tile SET properties=? WHERE rowid=?", [JSON.stringify(propObj), tile.tile_id]);
                    }
                    if(tile.content_updated) {
                        tile.content_updated = false;
                        await db.run("UPDATE tile SET content=? WHERE rowid=?", [tile.content.join(""), tile.tile_id]);
                    }
                    if(tile.writability_updated) {
                        tile.writability_updated = false;
                        await db.run("UPDATE tile SET writability=? WHERE rowid=?", [tile.writability, tile.tile_id]);
                    }
                } else {
                    tile.props_updated = false;
                    tile.content_updated = false;
                    tile.writability_updated = false;
                    var propObj = {};
                    if(!arrayIsEntirely(tile.prop_color, 0)) {
                        propObj.color = tile.prop_color;
                    }
                    if(!arrayIsEntirely(tile.prop_char, null)) {
                        propObj.char = encodeCharProt(tile.prop_char);
                    }
                    if(Object.keys(tile.prop_cell_props).length > 0) {
                        propObj.cell_props = tile.prop_cell_props;
                    }
                    var newTile = await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, ?, ?)",
                        [worldID, tile.content.join(""), tileY, tileX, JSON.stringify(propObj), tile.writability, Date.now()]);
                    var lastID = newTile.lastID;
                    tile.tile_exists = true;
                    tile.tile_id = lastID;
                }
            }
        }
    }
}

async function databaseClock() {
    await db.run("BEGIN TRANSACTION");
    try {
        await iterateDatabaseChanges();
    } catch(e) {
        handle_error(e);
    }
    await db.run("COMMIT");
    setTimeout(databaseClock, 1000 * 5);
}

function isTileDIM(worldID, tileX, tileY) {
    if(!memTileCache[worldID]) return false;
    if(!memTileCache[worldID][tileY]) return false;
    if(!memTileCache[worldID][tileY][tileX]) return false;
    return memTileCache[worldID][tileY][tileX];
}
function addTileMem(worldID, tileX, tileY, cacheTileData) {
    if(!memTileCache[worldID]) {
        memTileCache[worldID] = {};
    }
    if(!memTileCache[worldID][tileY]) {
        memTileCache[worldID][tileY] = {};
    }
    if(!memTileCache[worldID][tileY][tileX]) {
        memTileCache[worldID][tileY][tileX] = cacheTileData;
    }
}

function processTileIORequest(call_id, type, data) {
    switch(type) {
        case types.write:
            var tile_edits = data.tile_edits;
            var world = data.world;
            cids[call_id][1] = [[], {}];
            cids[call_id][3] = tile_edits.length;
            var sharedObj = {
                editLog: []
            };
            cids[call_id][2] = function() {
                console.log(sharedObj)
            }
            for(var e = 0; e < tile_edits.length; e++) {
                var edit = tile_edits[e];
                var tileY = edit[0];
                var tileX = edit[1];
                if(isTileDIM(world.id, tileX, tileY)) {
                    processTileEdit(world.id, tileX, tileY, [[types.write, edit, data, sharedObj, call_id]]);
                } else {
                    appendToUnloadedTileCache(world.id, tileX, tileY, [types.write, edit, data, sharedObj, call_id]);
                    stimulateTileQueue();
                }
            }
            break;
        case types.link:
            var world = data.world;
            var tileX = data.tileX;
            var tileY = data.tileY;

            cids[call_id][1] = [false, false];
            cids[call_id][3] = 1;
            var sharedObj = {
                editLog: []
            };
            cids[call_id][2] = function() {
                console.log("link completion", sharedObj);
            }

            if(isTileDIM(world.id, tileX, tileY)) {
                processTileEdit(world.id, tileX, tileY, [[types.link, data, sharedObj, call_id]]);
            } else {
                appendToUnloadedTileCache(world.id, tileX, tileY, [types.link, data, sharedObj, call_id]);
                stimulateTileQueue();
            }
            break;
        case types.protect:
            var world = data.world;
            var tileX = data.tileX;
            var tileY = data.tileY;

            cids[call_id][1] = [false, false];
            cids[call_id][3] = 1;
            var sharedObj = {
                editLog: []
            };
            cids[call_id][2] = function() {
                console.log("prot completion", sharedObj);
            }

            if(isTileDIM(world.id, tileX, tileY)) {
                processTileEdit(world.id, tileX, tileY, [[types.protect, data, sharedObj, call_id]]);
            } else {
                appendToUnloadedTileCache(world.id, tileX, tileY, [types.protect, data, sharedObj, call_id]);
                stimulateTileQueue();
            }
            break;
        case types.clear:
            var tileX = data.tileX;
            var tileY = data.tileY;
            var world = data.world;

            cids[call_id][3] = 1;
            cids[call_id][2] = function() {
                console.log("clr tile completion");
            }

            if(isTileDIM(world.id, tileX, tileY)) {
                processTileEdit(world.id, tileX, tileY, [[types.clear, data, null, call_id]]);
            } else {
                appendToUnloadedTileCache(world.id, tileX, tileY, [types.clear, data, null, call_id]);
                stimulateTileQueue();
            }
            break;
    }
}

module.exports.editResponse = async function(id) {
    return new Promise(function(res) {
        if(!cids[id]) {
            return console.log("An error occurred while sending back an edit response");
        }
        if(cids[id][3] && cids[id][4] >= cids[id][3]) { // I/O is already completed
            res(cids[id][1]);
            if(cids[id][2]) { // completion callback
                cids[id][2]();
            }
            delete cids[id];
        } else {
            cids[id][0] = function(resData) {
                res(resData);
                delete cids[id];
            }
        }
    });
}

module.exports.write = function(call_id, type, data) {
    switch(type) {
        case types.write:
        case types.link:
        case types.protect:
        case types.clear:
            processTileIORequest(call_id, type, data);
            break;
        case types.publicclear:
            break;
        case types.paste:
            break;
    }
}

module.exports.reserveCallId = function(id) {
    if(!cids[id]) cids[id] = [null, null, null, 0, 0];
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
    publicclear: 4,
    paste: 5
};

module.exports.types = types;