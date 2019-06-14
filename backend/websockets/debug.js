module.exports = async function(ws, data, send, vars, evars) {
    if(!vars.isTestServer) return;
    var log;
    try {
        log = JSON.parse(data.data);
    } catch(e) {
        return;
    }
    if(Array.isArray(log)) {
        console.log("[Debug]", log.join(" "));
    }
}