// Paste these replacements into OWOT Single Image Drawer (v3.8+).
// Server must expose worldModel.char_rate_unlimited (owo.awoo.cf with rate limits off).

// --- replace getRateInfo() ---
function getRateInfo() {
    try {
        const wm = W.state.worldModel;
        const um = W.state.userModel;
        if (wm.char_rate_unlimited) {
            const writeInterval = (wm.write_interval | 0) || 1000;
            return {
                count: Infinity,
                ms: 1000,
                writeInterval,
                member: !!(um.is_member || um.is_owner),
                cps: Infinity,
                unlimited: true
            };
        }
        const cr = Array.isArray(wm.char_rate) ? wm.char_rate : [0, 1000];
        const member = !!(um.is_member || um.is_owner);
        const count = cr[0] | 0;
        const ms = (cr[1] | 0) || 1000;
        const writeInterval = (wm.write_interval | 0) || 1000;
        let cps;
        if (member) cps = 280;
        else if (count <= 0) cps = 0;
        else {
            const base = Math.min(ms, 60 * 1000);
            cps = Math.floor(1000 / base * count) - 1;
            if (cps < 1) cps = 1;
            if (cps > 280) cps = 280;
        }
        return { count, ms, writeInterval, member, cps, unlimited: false };
    } catch (e) {
        return { count: 0, ms: 1000, writeInterval: 1000, member: false, cps: 60, unlimited: false };
    }
}

// --- replace updateWorldInfo() rate lines (inside function, html += section) ---
//    if (r.unlimited) html += 'Rate: <b style="color:#7d7">none (unlimited)</b><br>';
//    else if (r.member) html += 'Rate: member/owner (~280 cells/s)<br>';
//    else if (r.cps <= 0) html += 'Rate: <b style="color:#f77">guests cannot write here</b><br>';
//    else html += 'Rate: ' + r.count + ' chars / ' + r.ms + 'ms &rarr; ~' + r.cps + ' cells/s<br>';

// --- replace computeAutoThroughput() start ---
//    const r = getRateInfo();
//    if (r.unlimited) return { chunk: 512, sleep: 0, cps: Infinity, info: r };

// --- replace startDrawing() limiter lines ---
//    const limBudget = (rate.unlimited || !Number.isFinite(rate.count)) ? Infinity : Math.max(1, rate.count);

// --- replace getBrowserWorldMeta() ---
//    return {
//        char_rate: rate.unlimited ? [Infinity, 1000] : [rate.count, rate.ms],
//        char_rate_unlimited: !!rate.unlimited,
//        write_interval: rate.writeInterval,
//        member: rate.member,
//    };
