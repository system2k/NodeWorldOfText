module.exports.GET = async function(req, serve, vars, evars) {
	var cookies = evars.cookies;

	var http_time = vars.http_time;

	var cookieRes = [];
	if("privateworldmsg" in cookies) {
		cookieRes.push("privateworldmsg=; expires=" + http_time(0) + "; path=/;");
	}

	var privateWorldMsg = cookies.privateworldmsg;
	if(!privateWorldMsg) privateWorldMsg = "";

	var HTML = evars.HTML;
	serve(HTML("private.html", {
		privateWorldMsg
	}), null, {
		cookie: cookieRes
	});
}