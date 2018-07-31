function sanitize_color(col) {
    if(!col) col = 0;
    col = parseInt(col);
    if(!col) col = 0;
    if(col == -1) return -1; // skips the colors if -1
    col = Math.floor(col);
    if(col < 0) col = 0;
    if(col > 16777215) col = 16777215;
    return col;
}

in_queue = []; // locked tiles
// race condition (with tile data) management system
function is_queueing(tileX, tileY, worldID) {
    for(var i = 0; i < in_queue.length; i++) {
        if(in_queue[i][0] == tileX && in_queue[i][1] == tileY && in_queue[i][2] == worldID) {
            return true;
        }
    }
    return false;
}
is_waiting = []; // functions that are executed then the lock is released
function wait_queue(tileX, tileY, worldID) {
    return new Promise(function(resolve) {
        is_waiting.push([tileX, tileY, worldID, function() {
            resolve();
        }])
    })
}

function rem_queue(tileX, tileY, worldID) {
    for(var i = 0; i < in_queue.length; i++) {
        if(in_queue[i][0] == tileX && in_queue[i][1] == tileY && in_queue[i][2] == worldID) {
            in_queue.splice(i, 1);
            break;
        }
    }
}

function resolve_queue(tileX, tileY, worldID) {
    for(var i = 0; i < is_waiting.length; i++) {
        if(is_waiting[i][0] == tileX && is_waiting[i][1] == tileY && is_waiting[i][2] == worldID) {
            var back_function = is_waiting[i][3] // we have to delete the element first, and then call the function
            is_waiting.splice(i, 1);
            back_function();
            break;
        }
    }
}

function fixColors(colors) {
	if(Array.isArray(colors)) {
		colors = colors.slice(0, 128);
		for(var g = 0; g < colors.length; g++) {
			colors[g] = sanitize_color(colors[g]);
		}
	} else {
		colors = sanitize_color(colors);
	}
	return colors;
}

//let's leave this as just a feature for who knows this secret top top secret
var NOT_SO_SECRET = "@^&$%!#*%^#*)~@$^*#!)~*%38259`25equfahgrqieavkj4bh8ofweieagrHG*FNV#@#OIFENUOGIVEOSFKNL<CDOLFKEWNSCOIEAFM:COGPEWWRG>BVPZL:MBGOEWSV";

module.exports = async function(data, vars) {
    var db = vars.db;
    var user = vars.user;
    var world = vars.world;
    var transaction = vars.transaction;
    var san_nbr = vars.san_nbr;
    var tile_coord = vars.tile_coord;
    var broadcast = vars.broadcast;
    var channel = vars.channel;
    var decodeCharProt = vars.decodeCharProt;
    var insert_char_at_index = vars.insert_char_at_index;
    var advancedSplit = vars.advancedSplit;
    var get_bypass_key = vars.get_bypass_key;

    var bypass_key = get_bypass_key();
    // the retrieval of the key failed (aka "undefined"). change to a value that cannot be compared to
    // in case the key provided in the request is also "undefined"
    if(!bypass_key) {
        bypass_key = Object;
    }

    var public_only = data.public_only;

    var edits_limit = 500;
    if(user.superuser) {
        edits_limit = 1280;
    }

    var worldProps = JSON.parse(world.properties);

    var no_log_edits = !!worldProps.no_log_edits;
    var color_text   = !!worldProps.color_text;

    var is_owner = user.id == world.owner_id;
    var is_member = user.stats.member;

     // can write on public tiles?
    var can_write = user.stats.can_write;

    var can_color_text = true;
    if(color_text == 1 && !is_member && !is_owner) can_color_text = false;
    if(color_text == 2 && !is_owner) can_color_text = false;

    var edits = data.edits;
    if(!edits) return;
    if(!Array.isArray(edits)) return;
    
    var total_edits = 0;
    var tiles = {};
    // organize edits into tile coordinates
    for(var i = 0; i < edits.length; i++) {
        var segment = edits[i];
        if(!segment || !Array.isArray(segment)) continue;

        total_edits++;
        if(typeof segment[5] != "string") {
            continue;
        }
        segment[0] = san_nbr(segment[0]);
        segment[1] = san_nbr(segment[1]);

        if (!tiles[segment[0] + "," + segment[1]]) {
            tiles[segment[0] + "," + segment[1]] = []
        }
        segment[5] = segment[5].replace(/\n/g, " ")
        segment[5] = segment[5].replace(/\r/g, " ")
        segment[5] = segment[5].replace(/\x1b/g, " ")
        tiles[segment[0] + "," + segment[1]].push(segment)
        if(total_edits >= edits_limit) { // edit limit reached
            break;
        }
    }

    var accepted = [];
    var rejected = {};
    var upd_tiles = {};

    // accepts only an ARRAY of edits
    function rej_edits(edits) {
        for(var i = 0; i < edits.length; i++) {
            rejected[edits[i][6]] = "NO_TILE_PERM"
        }
    }

    // begin writing the edits
    await transaction.begin();
    for(var i in tiles) {
        var tile_data = " ".repeat(128);

        var properties = {
            color: Array(128).fill(0)
        };
        var date = Date.now();

        var pos = tile_coord(i)
        var tileY = san_nbr(pos[0]);
        var tileX = san_nbr(pos[1]);

        if(is_queueing(tileX, tileY, world.id)) {
            await wait_queue(tileX, tileY, world.id); // wait for previous tile to finish
        }
        in_queue.push([tileX, tileY, world.id]); // lock this tile
        // this tile is done, let other edits edit the same tile (unlock tile)
        function free_queue() {
            resolve_queue(tileX, tileY, world.id);
            rem_queue(tileX, tileY, world.id);
        }
        // begin writing the edits with a try/catch.
        // if an internal error occurs, it won't block the entire system by not reaching the function to free the queue
        try {
            var tile = await db.get("SELECT * FROM tile WHERE world_id=? AND tileY=? AND tileX=?",
                [world.id, tileY, tileX])
            var charProt = new Array(128).fill(null);
            if(tile) {
                properties = JSON.parse(tile.properties);
                if(properties.char) {
                    charProt = decodeCharProt(properties.char);
                }
            }
    
            var incomingEdits = tiles[i];
            if(tile) {
                var content = tile.content;
                tile_data = content;
            }

            var changes = [];
            var accepted_changes = [];
            // processes edits, including splitting multi-char edits into multiple edits
            for(var k = 0; k < incomingEdits.length; k++) {
                var editIncome = incomingEdits[k];

                var charX = san_nbr(editIncome[3]);
                var charY = san_nbr(editIncome[2]);
                var charInsIdx = charY * 16 + charX;
                if(charInsIdx < 0) charInsIdx = 0;
                if(charInsIdx > 127) charInsIdx = 127;
                var char = editIncome[5];
                if(typeof char != "string") {
                    char = "?";
                }
                char = advancedSplit(char);
                if(char.length <= 1) {
                    if(!editIncome[7]) editIncome[7] = 0;
                    if(Array.isArray(editIncome[7])) {
                        editIncome[7] = fixColors(editIncome[7][0])
                    }
                    changes.push(editIncome);
                    continue;
                } else {
                    // only password holders, superusers, owners, or members can use multiple characters per edit
                    if(!user.superuser && !(is_owner || is_member) && data.bypass != bypass_key) {
                        char = char.slice(0, 1);
                    }
                }
                for(var i = 0; i < char.length; i++) {
                    var newIdx = charInsIdx + i;
                    if(newIdx > 127) newIdx = 127;
                    var newX = newIdx % 16;
                    var newY = Math.floor(newIdx / 16);
                    var newChar = char[i];
                    var newColor = editIncome[7];
                    if(Array.isArray(newColor)) {
                        newColor = san_nbr(newColor[i]);
                    }
                    if(!newColor) newColor = 0;

                    var newAr = [editIncome[0], editIncome[1],
                                newY, newX,
                                editIncome[4], newChar, editIncome[6], newColor];
                    if(editIncome[8]) {
                        newAr.push(editIncome[8]);
                    }
                    changes.push(newAr);
                }
            }

            for(var e = 0; e < changes.length; e++) {
                // edit --> [tileY, tileX, charY, charX, timestamp, char, id, colors, animation]
				var change = changes[e];
                var charY = san_nbr(change[2]);
                var charX = san_nbr(change[3]);
                var charInsIdx = charY * 16 + charX;

                var char_writability = charProt[charInsIdx];

                // permission checking - compute the writability of the cell, accounting for tile and world writing permissions
                if(char_writability == null) char_writability = tile ? tile.writability : null;
                if(char_writability == null) char_writability = world.writability;

                // tile is owner-only, but user is not owner
                if(char_writability == 2 && !is_owner) {
                    rej_edits([change]);
                    continue;
                }
                // tile is member-only, but user is not member (nor owner)
                if(char_writability == 1 && !is_owner && !is_member) {
                    rej_edits([change]);
                    continue;
                }

                // this edit request is only allowed to write on public areas
                if(public_only && char_writability != 0) {
                    rej_edits([change]);
                    continue;
                }

                var char = change[5];
                accepted.push(change[6]);
                var color = fixColors(change[7]);
				// animation --> [notSoSecret, changeInterval, repeat, frames]
				// notSoSecret must be the value of NOT_SO_SECRET, changeInterval is in milliseconds (1/1000 of a second) and repeat is a boolean (true/false)
                // frames --> [frame0, frame1, ..., frameN], maximum 999 frames
                // frame --> [TEXT, COLORS] where TEXT is a 128 character string, and COLORS is an array of 128 colors
                var animation = change[8];
                var incAnimationEditLog = false;
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
							if (okFrames.length /* > 0*/) {
								properties.animation = {
									changeInterval,
									repeat,
									frames: okFrames
								};
							}
						}
					}
                }
                var offset = charY * 16 + charX;
                tile_data = insert_char_at_index(tile_data, char, offset);
                if(!properties.color) {
                    properties.color = Array(128).fill(0)
                }
                if(Array.isArray(color)) {
                    var color_index = 0;
                    for(var s = charY*16 + charX; s < 128; s++) {
                        if(color[color_index] !== -1) {
                            if(!can_color_text) color[color_index] = 0;
                            properties.color[s] = color[color_index];
                        }
                        color_index++;
                    }
                } else {
                    if(!can_color_text) color = 0;
                    if(color !== -1) {
                        properties.color[charY*16 + charX] = color;
                    }
                }
        
                if(properties.cell_props) {
                    if(properties.cell_props[charY]) {
                        if(properties.cell_props[charY][charX]) {
                            properties.cell_props[charY][charX] = {};
                        }
                    }
                }

                var eLog = [tileY, tileX, charY, charX,
                    san_nbr(change[4]), char, san_nbr(change[6]), color];
                if(incAnimationEditLog) {
                    eLog.push(animation)
                }
                accepted_changes.push(eLog)
            }
            if(tile) { // tile exists, update
                await db.run("UPDATE tile SET (content, properties)=(?, ?) WHERE id=?",
                    [tile_data, JSON.stringify(properties), tile.id])
            } else { // tile doesn't exist, insert
                await db.run("INSERT INTO tile VALUES(null, ?, ?, ?, ?, ?, null, ?)",
                    [world.id, tile_data, tileY, tileX, JSON.stringify(properties), date])
            }
            if(!no_log_edits && accepted_changes.length) {
                await db.run("INSERT INTO edit VALUES(null, ?, ?, ?, ?, ?, ?)", // log the edit
                    [user.id, world.id, tileY, tileX, date, JSON.stringify(accepted_changes)])
            }
        
            // return updated tiles to client
            upd_tiles[tileY + "," + tileX] = {
                content: tile_data,
                properties: Object.assign(properties, {
                    writability: tile ? tile.writability : null
                })
            }
            free_queue();
        } catch (e) {
            free_queue();
            throw e;
        }
    }
    await transaction.end();

    if(Object.keys(upd_tiles).length > 0) {
        broadcast({
            channel,
            kind: "tileUpdate",
            source: "write",
            tiles: upd_tiles
        }, world.name)
    }

    return { accepted, rejected };
}