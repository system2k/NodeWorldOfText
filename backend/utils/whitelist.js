function checkWhitelistFeature(userId, userAuth, ipAddressVal, worldName, code, server) {
	if(!server.siteWhitelistCache || !server.siteWhitelistStatus) {
		return true;
	}

	var worldKey = (worldName || "").toUpperCase();
	var userKey = String(userId || "");

	var status = server.siteWhitelistStatus.get(code);
	if(!status) status = "public";

	if(status == "public") return true;

	if(status == "disabled") return false;

	if(status == "authenticated") {
		return !!userAuth;
	}

	if(status == "whitelisted") {
		let cache = server.siteWhitelistCache;
		if(!cache) return false;

		if(cache.user && cache.user.has(userKey)) {
			let entry = cache.user.get(userKey);
			if(entry && entry[code]) return true;
		}

		if(cache.ip && cache.ip.has(ipAddressVal)) {
			let entry = cache.ip.get(ipAddressVal);
			if(entry && entry[code]) return true;
		}

		if(cache.world && cache.world.has(worldKey)) {
			let entry = cache.world.get(worldKey);
			if(entry && entry[code]) return true;
		}

		return false;
	}

	return true;
}

function checkWhitelistFeatureWithOwner(userId, userAuth, ipAddressVal, worldName, code, server, isOwner, ownerCode) {
	if(checkWhitelistFeature(userId, userAuth, ipAddressVal, worldName, code, server)) {
		return true;
	}
	if(isOwner && checkWhitelistFeature(userId, userAuth, ipAddressVal, worldName, ownerCode, server)) {
		return true;
	}
	return false;
}

module.exports = {
	checkWhitelistFeature,
	checkWhitelistFeatureWithOwner
};