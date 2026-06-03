"use strict";

var DEFAULT_WS_LIMITS = {
	chat: [256, 1000, 0],
	chathistory: [4, 500, 0],
	clear_tile: [512, 1000, 0],
	cmd_opt: [10, 1000, 0],
	cmd: [256, 1000, 0],
	debug: [10, 1000, 0],
	fetch: [256, 1000, 0],
	link: [400, 1000, 0],
	protect: [400, 1000, 0],
	write: [16, 1000, 0],
	cursor: [70, 1000, 0]
};

var DEFAULT_HTTP_LIMITS = {
	login: 2,
	logout: 2,
	register: 1,
	profile_get: 2,
	profile_post: 10,
	configure: 2,
	member_autocomplete: 4,
	download: 2,
	tabular: 2,
	sso: 3,
	protect: 16,
	unprotect: 16,
	protect_char: 16,
	unprotect_char: 16,
	coordlink: 16,
	urllink: 16,
	yourworld_post: 4,
	yourworld_get: 6,
	world_style: 2,
	world_props: 2
};

var DEFAULT_WRITE_LIMITS = {
	edits_per_request: 16,
	superuser_edits_per_request: 64,
	chars_per_second: 20,
	tiles_per_second: 4,
	period_ms: 1000
};

var DEFAULT_CHAT_LIMITS = {
	global_per_second: 2,
	page_member_per_second: 8,
	page_owner_per_second: 512,
	command_per_second: 512
};

function mergeNumber(value, fallback) {
	return typeof value === "number" && !isNaN(value) ? value : fallback;
}

function mergeWsLimit(value, fallback) {
	if(value === null || value === false) return null;
	if(Array.isArray(value) && value.length >= 2) {
		return [
			mergeNumber(value[0], fallback[0]),
			mergeNumber(value[1], fallback[1]),
			mergeNumber(value[2], fallback[2] ?? 0)
		];
	}
	return fallback.slice();
}

function loadWriteLimits(write) {
	if(write === null || write === false) {
		return { disabled: true };
	}
	write = write || {};
	return {
		disabled: false,
		edits_per_request: mergeNumber(write.edits_per_request, DEFAULT_WRITE_LIMITS.edits_per_request),
		superuser_edits_per_request: mergeNumber(write.superuser_edits_per_request, DEFAULT_WRITE_LIMITS.superuser_edits_per_request),
		chars_per_second: mergeNumber(write.chars_per_second, DEFAULT_WRITE_LIMITS.chars_per_second),
		tiles_per_second: mergeNumber(write.tiles_per_second, DEFAULT_WRITE_LIMITS.tiles_per_second),
		period_ms: mergeNumber(write.period_ms, DEFAULT_WRITE_LIMITS.period_ms)
	};
}

function loadHttpLimits(http) {
	if(http === null || http === false) {
		return { disabled: true };
	}
	http = http || {};
	return {
		disabled: false,
		login: mergeNumber(http.login, DEFAULT_HTTP_LIMITS.login),
		logout: mergeNumber(http.logout, DEFAULT_HTTP_LIMITS.logout),
		register: mergeNumber(http.register, DEFAULT_HTTP_LIMITS.register),
		profile_get: mergeNumber(http.profile_get, DEFAULT_HTTP_LIMITS.profile_get),
		profile_post: mergeNumber(http.profile_post, DEFAULT_HTTP_LIMITS.profile_post),
		configure: mergeNumber(http.configure, DEFAULT_HTTP_LIMITS.configure),
		member_autocomplete: mergeNumber(http.member_autocomplete, DEFAULT_HTTP_LIMITS.member_autocomplete),
		download: mergeNumber(http.download, DEFAULT_HTTP_LIMITS.download),
		tabular: mergeNumber(http.tabular, DEFAULT_HTTP_LIMITS.tabular),
		sso: mergeNumber(http.sso, DEFAULT_HTTP_LIMITS.sso),
		protect: mergeNumber(http.protect, DEFAULT_HTTP_LIMITS.protect),
		unprotect: mergeNumber(http.unprotect, DEFAULT_HTTP_LIMITS.unprotect),
		protect_char: mergeNumber(http.protect_char, DEFAULT_HTTP_LIMITS.protect_char),
		unprotect_char: mergeNumber(http.unprotect_char, DEFAULT_HTTP_LIMITS.unprotect_char),
		coordlink: mergeNumber(http.coordlink, DEFAULT_HTTP_LIMITS.coordlink),
		urllink: mergeNumber(http.urllink, DEFAULT_HTTP_LIMITS.urllink),
		yourworld_post: mergeNumber(http.yourworld_post, DEFAULT_HTTP_LIMITS.yourworld_post),
		yourworld_get: mergeNumber(http.yourworld_get, DEFAULT_HTTP_LIMITS.yourworld_get),
		world_style: mergeNumber(http.world_style, DEFAULT_HTTP_LIMITS.world_style),
		world_props: mergeNumber(http.world_props, DEFAULT_HTTP_LIMITS.world_props)
	};
}

function loadChatLimits(chat) {
	if(chat === null || chat === false) {
		return { disabled: true };
	}
	chat = chat || {};
	return {
		disabled: false,
		global_per_second: mergeNumber(chat.global_per_second, DEFAULT_CHAT_LIMITS.global_per_second),
		page_member_per_second: mergeNumber(chat.page_member_per_second, DEFAULT_CHAT_LIMITS.page_member_per_second),
		page_owner_per_second: mergeNumber(chat.page_owner_per_second, DEFAULT_CHAT_LIMITS.page_owner_per_second),
		command_per_second: mergeNumber(chat.command_per_second, DEFAULT_CHAT_LIMITS.command_per_second)
	};
}

function load(settings) {
	var rl = settings && settings.rate_limits ? settings.rate_limits : {};
	var http = rl.http;
	var chat = rl.chat;
	var websocket = rl.websocket;
	var wsLimits = {};
	var disabled = rl.disabled === true;

	if(websocket === null || websocket === false || disabled) {
		for(var kind in DEFAULT_WS_LIMITS) {
			wsLimits[kind] = null;
		}
	} else {
		websocket = websocket || {};
		for(var kind in DEFAULT_WS_LIMITS) {
			wsLimits[kind] = mergeWsLimit(websocket[kind], DEFAULT_WS_LIMITS[kind]);
		}
	}

	var httpLimits = loadHttpLimits(disabled ? null : http);
	var chatLimits = loadChatLimits(disabled ? null : chat);
	var connectionsPerIp = disabled || rl.connections_per_ip === null || rl.connections_per_ip === false
		? null
		: mergeNumber(rl.connections_per_ip, 50);

	return {
		disabled,
		connections_per_ip: connectionsPerIp,
		write: disabled ? { disabled: true } : loadWriteLimits(rl.write),
		websocket: wsLimits,
		http: httpLimits,
		chat: chatLimits,
		default_world_char_rate: disabled ? null : (rl.default_world_char_rate === undefined ? null : rl.default_world_char_rate)
	};
}

// Client-visible char_rate tuple. null/ false default_world_char_rate means no world guest limit.
function resolveWorldCharRate(worldCharRate, rateLimits) {
	if(worldCharRate) {
		var parts = worldCharRate.split("/");
		if(parts.length == 2) {
			return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
		}
	}
	if(isDefaultWorldCharRateDisabled(rateLimits)) {
		return [20480, 1000];
	}
	var def = rateLimits.default_world_char_rate;
	if(typeof def === "string") {
		var parsed = def.split("/");
		if(parsed.length == 2) {
			return [parseInt(parsed[0], 10), parseInt(parsed[1], 10)];
		}
	}
	if(Array.isArray(def) && def.length >= 2) {
		return [def[0], def[1]];
	}
	if(def && typeof def === "object") {
		return [
			mergeNumber(def.chars, mergeNumber(def.val, 20480)),
			mergeNumber(def.period_ms, mergeNumber(def.period, 1000))
		];
	}
	return [20480, 1000];
}

function isDefaultWorldCharRateDisabled(rateLimits) {
	return !rateLimits || rateLimits.default_world_char_rate === null || rateLimits.default_world_char_rate === false;
}

module.exports = {
	load,
	resolveWorldCharRate,
	isDefaultWorldCharRateDisabled,
	DEFAULT_WRITE_LIMITS,
	DEFAULT_HTTP_LIMITS,
	DEFAULT_WS_LIMITS,
	DEFAULT_CHAT_LIMITS
};
