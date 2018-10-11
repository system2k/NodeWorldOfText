module.exports.GET = async function(req, serve, vars) {
    var cookies = vars.cookies;
    var db = vars.db;
    var new_token = vars.new_token;
    var cookie_expire = vars.cookie_expire;

    if(cookies.sessionid) {
        await db.run("DELETE FROM auth_session WHERE session_key=?", cookies.sessionid)
    }

    serve(null, null, {
        cookie: "sessionid=; expires=" + cookie_expire(0) + "; path=/",
        redirect: "/home/"
    })
}