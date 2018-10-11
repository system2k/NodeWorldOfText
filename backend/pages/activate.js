module.exports.GET = async function(req, serve, vars, params) {
    var user = vars.user;
    var url = vars.url;
    var path = vars.path;
    var get_third = vars.get_third;
    var db = vars.db;
    var dispage = vars.dispage;

    // gets id from /accounts/activate/{world}/
    var activation_key = get_third(path, "accounts", "activate")

    if(activation_key == "complete") {
        return await dispage("activate_complete", null, req, serve, vars)
    }

    var user_activate = await db.get("SELECT * FROM registration_registrationprofile WHERE activation_key=?", activation_key)

    if(!user_activate) {
        return await dispage("register_failed", null, req, serve, vars)
    }
    var user_id = user_activate.user_id;
    await db.run("UPDATE auth_user SET is_active=1 WHERE id=?", user_id)
    await db.run("DELETE FROM registration_registrationprofile WHERE user_id=?", user_id)

    serve(null, null, {
        redirect: "/accounts/activate/complete/"
    })
}