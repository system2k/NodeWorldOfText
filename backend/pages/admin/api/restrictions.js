var restrictions = require("../../../utils/restrictions.js");
var ipaddress = require("../../../framework/ipaddress.js");

var reconIP = ipaddress.reconIP;

module.exports.GET = async function(req, write, server, ctx, params) {
	var user = ctx.user;
	var query_data = ctx.query_data;

	if(!user.superuser) {
		return await callPage("404");
	}

	let tag = query_data.tag;
	let list = restrictions.getRestrictionsFlatList();
	let listTag = list.filter(item => item.tag == tag).map(item => {
		if(item.ip) {
			return {
				...item,
				ip: reconIP(item.ip)
			};
		} else {
			return item;
		}
	});

	write(JSON.stringify(listTag), null, {
		mime: "application/json"
	});
}

module.exports.POST = async function(req, write, server, ctx) {
	var post_data = ctx.post_data;
	var user = ctx.user;
	var callPage = ctx.callPage;

	var saveRestrictions = server.saveRestrictions;

	if(!user.superuser) {
		return await callPage("404");
	}

	let action = post_data.kind;
	let rules = JSON.parse(post_data.rules);

	let list = restrictions.getRestrictionsFlatListStr();

	if(action == "prepend") {
		let merged = [
			...rules,
			...list
		];
		let result = restrictions.procRest(merged);
		restrictions.setRestrictions(result.groups);
		restrictions.setRestrictionsFlatList(result.raw);
		restrictions.setRestrictionsFlatListStr(result.rawStr);
		saveRestrictions("main", result.rawStr.join("\n") + "\n");
	}

	write("SUCCESS");
}