module.exports.GET = async function(req, write, server, ctx) {
	var HTML = ctx.HTML;
	
	var website = server.website;

	var data = {
		website
	};

	write(HTML("home.html", data));
}