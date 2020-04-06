module.exports.GET = async function(req, serve, vars, evars) {
    var path = evars.path;

    var url = vars.url;
    var get_third = vars.get_third;
    var db = vars.db;
    var dispage = vars.dispage;
    var accountSystem = vars.accountSystem;

    if(accountSystem == "uvias") {
        return;
    }

    // gets id from /accounts/verify/{world}/
    var verification_key = get_third(path, "accounts", "verify");

    if(verification_key == "complete") {
        return await dispage("activate_complete", null, req, serve, vars, evars);
    }

    var user_verify = await db.get("SELECT * FROM registration_registrationprofile WHERE activation_key=?", verification_key);

    if(!user_verify) {
        return await dispage("register_failed", null, req, serve, vars, evars);
    }
    var user_id = user_verify.user_id;
    await db.run("UPDATE auth_user SET is_active=1 WHERE id=?", user_id);
    await db.run("DELETE FROM registration_registrationprofile WHERE user_id=?", user_id);

    serve(null, null, {
        redirect: "/accounts/verify/complete/"
    });
}