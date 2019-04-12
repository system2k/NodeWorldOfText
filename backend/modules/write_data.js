module.exports = async function(data, vars, evars) {
    var user = vars.user;
    var world = vars.world;
    var san_nbr = vars.san_nbr;
    var advancedSplit = vars.advancedSplit;
    var get_bypass_key = vars.get_bypass_key;
    var tile_database = vars.tile_database;
    var fixColors = vars.fixColors;
    var channel = vars.channel;

    var bypass_key = get_bypass_key();
    if(!bypass_key) {
        bypass_key = NaN;
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

    is_owner = is_owner || (user.superuser && world.name == "");

    var can_color_text = true;
    if(color_text == 1 && !is_member && !is_owner) can_color_text = false;
    if(color_text == 2 && !is_owner) can_color_text = false;

    var edits = data.edits;
    if(!edits) return;
    if(!Array.isArray(edits)) return;
    
    var total_edits = 0;
    var tiles = {};
    var tileCount = 0;
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
            tiles[segment[0] + "," + segment[1]] = [];
            tileCount++;
        }
        segment[5] = segment[5].replace(/\n/g, " ");
        segment[5] = segment[5].replace(/\r/g, " ");
        segment[5] = segment[5].replace(/\x1b/g, " ");
        tiles[segment[0] + "," + segment[1]].push(segment)
        if(total_edits >= edits_limit) { // edit limit reached
            break;
        }
    }

    if(evars && evars.ws && vars.monitorEventSockets.length) {
        vars.broadcastMonitorEvent(evars.ws.ipAddress + ", [" + evars.ws.clientId + ", '" + vars.channel + "'] sent 'write' on world ['" + world.name + "', " + world.id + "]. " + tileCount + " modified tiles, " + total_edits + " edits");
    }

    var call_id = tile_database.newCallId();

    tile_database.reserveCallId(call_id);

    var DateNow = Date.now();
    var tile_edits = [];

    for(var i in tiles) {
        var incomingEdits = tiles[i];

        var changes = [];

        for(var k = 0; k < incomingEdits.length; k++) {
            var editIncome = incomingEdits[k];

            var charX = san_nbr(editIncome[3]);
            var charY = san_nbr(editIncome[2]);
            var charInsIdx = charY * CONST.tileCols + charX;
            if(charInsIdx < 0) charInsIdx = 0;
            if(charInsIdx > CONST.tileArea - 1) charInsIdx = CONST.tileArea - 1;

            charX = charInsIdx % CONST.tileCols;
            charY = Math.floor(charInsIdx / CONST.tileCols);
            editIncome[3] = charX;
            editIncome[2] = charY;

            var char = editIncome[5];
            if(typeof char != "string") {
                char = "?";
            }
            char = advancedSplit(char);
            if(char.length <= 1) {
                if(!editIncome[7]) editIncome[7] = 0;
                if(Array.isArray(editIncome[7])) {
                    editIncome[7] = fixColors(editIncome[7][0]);
                } else {
                    editIncome[7] = fixColors(editIncome[7]);
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
                if(newIdx > CONST.tileArea - 1) continue; // overflow
                // convert back to proper X/Y
                var newX = newIdx % CONST.tileCols;
                var newY = Math.floor(newIdx / CONST.tileCols);
                var newChar = char[i];
                var newColor = editIncome[7];
                if(Array.isArray(newColor)) {
                    // color is an array, get individual values
                    newColor = fixColors(newColor[i]);
                } else {
                    // color is a number
                    newColor = fixColors(newColor);
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
            var change = changes[e];
            tile_edits.push(change);
        }
    }

    // send to tile database manager
    tile_database.write(call_id, tile_database.types.write, {
        date: DateNow,
        tile_edits,
        user, world, is_owner, is_member,
        can_color_text, public_only, no_log_edits,
        channel
    });

    var resp = await tile_database.editResponse(call_id);

    return { accepted: resp[0], rejected: resp[1] };
}