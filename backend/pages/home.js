module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	
	var website = server.website;

	var data = {
		website
	};

	write(render("home.html", data));
}