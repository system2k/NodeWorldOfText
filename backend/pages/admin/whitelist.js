var restrictions = require("../../utils/restrictions.js");
var procRest = restrictions.procRest;
var procCoal = restrictions.procCoal;
var setRestrictions = restrictions.setRestrictions;
var setRestrictionsFlatList = restrictions.setRestrictionsFlatList;
var setRestrictionsFlatListStr = restrictions.setRestrictionsFlatListStr;
var setCoalition = restrictions.setCoalition;

module.exports.GET = async function(req, write, server, ctx) {
	var render = ctx.render;
	var user = ctx.user;
	var createCSRF = server.createCSRF;
	var db_misc = server.db_misc;

	if(!user.superuser) return;

	var siteWhitelistCache = server.siteWhitelistCache;
	var siteWhitelistStatus = server.siteWhitelistStatus;

	var csrftoken = createCSRF(user.id.toString(), 0);

	write(render("administrator_whitelist.html", {
		csrftoken,
		status: JSON.stringify(Object.fromEntries(siteWhitelistStatus.entries())),
		cache: JSON.stringify({
			ip: Object.fromEntries(siteWhitelistCache.ip.entries()),
			user: Object.fromEntries(siteWhitelistCache.user.entries()),
			world: Object.fromEntries(siteWhitelistCache.world.entries())
		})
	}));
}
