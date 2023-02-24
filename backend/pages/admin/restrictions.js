var restrictions = require("../../utils/restrictions.js");
var procRest = restrictions.procRest;
var procCoal = restrictions.procCoal;
var setRestrictions = restrictions.setRestrictions;
var setCoalition = restrictions.setCoalition;

module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	var user = ctx.user;

	var createCSRF = server.createCSRF;
	var loadString = server.loadString;

	if(!user.superuser) return;

	var csrftoken = createCSRF(user.id.toString(), 0);

	write(render("administrator_restrictions.html", {
		rstr: loadString("restr"),
		coal: loadString("restr_cg1"),
		csrftoken
	}));
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	var query_data = ctx.query_data;

	var checkCSRF = server.checkCSRF;
	var saveRestrictions = server.saveRestrictions;

	if(!user.superuser) return;

	var csrftoken = req.headers["x-csrf-token"];
	if(!checkCSRF(csrftoken, user.id.toString(), 0)) {
		return write("CSRF verification failed");
	}

	var type = query_data.type;

	var list = post_data.toString("utf8").replace(/\r\n/g, "\n").split("\n");

	if(type == "1") { // restrictions
		var result = procRest(list);
		setRestrictions(result.data);
		saveRestrictions("main", result.raw);
	} else if(type == "2") { // coalesce
		var result = procCoal(list);
		setCoalition(result.data);
		saveRestrictions("cg1", result.raw);
	}

	write("SUCCESS");
}