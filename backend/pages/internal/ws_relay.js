/*
	Internal WebSocket relay for the Rust WS sidecar.
	Handles chat, cursor, and other non-tile WS kinds.
	Tile ops (fetch, write, clear_tile, protect, link) are handled by the Rust sidecar.
*/

var pages = null;
var world_mgr = require("../../subsystems/world_mgr.js");

function loadPages(runserverPages) {
	pages = runserverPages;
}

function makeVirtualCtx(body) {
	var ctx = body.ctx || {};
	var user = ctx.user || {};
	user.authenticated = !!user.authenticated;
	user.superuser = !!user.superuser;
	user.staff = !!user.staff;
	user.operator = !!user.operator;
	user.csrftoken = user.csrftoken || "";
	return {
		user: user,
		channel: ctx.channel || "",
		keyQuery: ctx.memKey || null,
		world: {
			id: ctx.worldId,
			name: ctx.worldName || ""
		},
		clientId: ctx.clientId,
		ipAddress: ctx.ipAddress || "127.0.0.1"
	};
}

function makeVirtualWs(ctx, worldObj) {
	var sdata = {
		terminated: false,
		ipAddress: ctx.ipAddress,
		ipAddressFam: 4,
		ipAddressVal: 1,
		origin: null,
		userClient: true,
		world: worldObj,
		user: ctx.user,
		channel: ctx.channel,
		clientId: ctx.clientId,
		keyQuery: ctx.keyQuery,
		hasBroadcastedCursorPosition: false,
		cursorPositionHidden: false,
		receiveContentUpdates: true,
		descriptiveCmd: false,
		passiveCmd: false,
		handleCmdSockets: false,
		cmdsSentInSecond: 0,
		lastCmdSecond: 0,
		hide_user_count: false,
		chat_blocks: {
			id: [],
			user: [],
			no_tell: false,
			no_anon: false,
			no_reg: false,
			block_all: false
		},
		center: [0, 0],
		boundary: null,
		localFilter: true
	};
	return {
		readyState: 1,
		sdata: sdata,
		send: function() {},
		close: function() {}
	};
}

module.exports.POST = async function(req, write, server, httpCtx) {
	if(!pages) {
		return write(JSON.stringify({ error: "Relay not initialized" }), 500, {
			mime: "application/json; charset=utf-8"
		});
	}

	var ip = httpCtx.ipAddress || "";
	if(ip != "127.0.0.1" && ip != "::1" && ip != "0:0:0:0:0:0:0:1" && !ip.endsWith("127.0.0.1")) {
		return write(JSON.stringify({ error: "Forbidden" }), 403, {
			mime: "application/json; charset=utf-8"
		});
	}

	var post = httpCtx.post_data;
	if(Buffer.isBuffer(post)) {
		try {
			post = JSON.parse(post.toString("utf8"));
		} catch(e) {
			return write(JSON.stringify({ error: "Invalid body" }), 400, {
				mime: "application/json; charset=utf-8"
			});
		}
	}
	if(!post || typeof post != "object") {
		return write(JSON.stringify({ error: "Invalid body" }), 400, {
			mime: "application/json; charset=utf-8"
		});
	}

	var kind = post.kind;
	var msg = post.msg;
	if(typeof kind != "string" || !msg || typeof msg != "object") {
		return write(JSON.stringify({ error: "Invalid request" }), 400, {
			mime: "application/json; charset=utf-8"
		});
	}
	kind = kind.toLowerCase();

	var websockets = pages.websockets;
	if(!websockets || !websockets[kind]) {
		return write(JSON.stringify({ responses: [], broadcasts: [] }), 200, {
			mime: "application/json; charset=utf-8"
		});
	}

	var ctx = makeVirtualCtx(post);
	var world = await world_mgr.getOrCreateWorld(ctx.world.name || "");
	if(!world) {
		return write(JSON.stringify({ error: "World not found" }), 404, {
			mime: "application/json; charset=utf-8"
		});
	}
	ctx.world = world;

	var responses = [];
	var broadcasts = [];
	var ws = makeVirtualWs(ctx, world);

	function send(payload) {
		payload.kind = payload.kind || kind;
		if(typeof msg.request == "number") payload.request = msg.request;
		responses.push(JSON.stringify(payload));
	}

	function broadcast(data, opts) {
		if(data.kind && data.kind != kind) {
			data.source = kind;
		}
		var worldId = world.id;
		var isGlobal = false;
		if(opts && opts.isChat && opts.global) {
			isGlobal = true;
			worldId = null;
		}
		broadcasts.push({
			world_id: worldId,
			global: isGlobal,
			payload: JSON.stringify(data)
		});
	}

	try {
		await websockets[kind](ws, msg, send, broadcast, server, ctx);
	} catch(e) {
		server.handle_error(e);
		return write(JSON.stringify({ error: "Handler failed" }), 500, {
			mime: "application/json; charset=utf-8"
		});
	}

	write(JSON.stringify({ responses, broadcasts }), 200, {
		mime: "application/json; charset=utf-8"
	});
};

module.exports.loadPages = loadPages;
