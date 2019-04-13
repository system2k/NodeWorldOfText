module.exports.GET = async function(req, serve, vars, params) {
    var query_data = vars.query_data;

    var token = query_data.ssotoken;

    if(!token || typeof token != "string") {
        return serve("No token specified");
    }

    if(token.length > 1000) {
        return serve("Token is invalid");
    }
    
    return serve("Received token: '" + token + "'");
}