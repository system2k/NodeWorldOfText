"use strict";

/*
	PostgreSQL adapter for world/tile/whitelist tables.
	Matches AsyncDBManager get/run/all interface used by tile_database and world_mgr.
	Only connects to the dedicated owot_worlds database — never touches other PG DBs.
*/

var pg = require("pg");

function normalizeArgs(args) {
	if(args == null || args === undefined) return [];
	if(Array.isArray(args)) return args;
	if(typeof args === "object") return args;
	return [args];
}

function quotePgTileColumns(sql) {
	// tile table uses quoted mixed-case column names in PostgreSQL
	return sql
		.replace(/\btileX\b/g, '"tileX"')
		.replace(/\btileY\b/g, '"tileY"');
}

function toPgPlaceholders(sql, args) {
	args = normalizeArgs(args);
	sql = quotePgTileColumns(sql);
	if(typeof args === "object" && !Array.isArray(args)) {
		var values = [];
		var converted = sql
			.replace(/\browid\b/gi, "id")
			.replace(/COLLATE NOCASE/gi, "")
			.replace(/VALUES\s*\(\s*null/gi, "VALUES (DEFAULT")
			.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, function(_, key) {
				if(!(key in args)) return "$" + key;
				values.push(args[key]);
				return "$" + values.length;
			});
		if(/WHERE\s+[^;]*name\s*=\?\s*$/i.test(converted.replace(/\s+/g, " "))) {
			converted = converted.replace(/name\s*=\?\s*$/i, "lower(name) = lower($" + values.length + ")");
		}
		return [converted, values];
	}
	var idx = 0;
	var converted = sql
		.replace(/\browid\b/gi, "id")
		.replace(/COLLATE NOCASE/gi, "")
		.replace(/VALUES\s*\(\s*null/gi, "VALUES (DEFAULT")
		.replace(/\?/g, function() {
			idx++;
			return "$" + idx;
		});
	if(/WHERE\s+[^;]*name\s*=\$[0-9]+\s*$/i.test(converted.replace(/\s+/g, " "))) {
		converted = converted.replace(/name\s*=\$(\d+)\s*$/i, function(_, n) {
			return "lower(name) = lower($" + n + ")";
		});
	}
	return [converted, args];
}

function WorldPgDb(config) {
	this.pool = new pg.Pool({
		host: config.host || "/var/run/postgresql",
		port: config.port || null,
		user: config.user || "owot_worlds",
		password: config.password || undefined,
		database: config.database || "owot_worlds",
		max: config.pool_size || 8,
		application_name: "nodeworldoftext_worlds"
	});
}

WorldPgDb.prototype.get = async function(command, args) {
	var pair = toPgPlaceholders(command, args);
	var result = await this.pool.query(pair[0], pair[1]);
	return result.rows[0];
};

WorldPgDb.prototype.all = async function(command, args) {
	var pair = toPgPlaceholders(command, args);
	var result = await this.pool.query(pair[0], pair[1]);
	return result.rows;
};

WorldPgDb.prototype.run = async function(command, args) {
	var pair = toPgPlaceholders(command, args);
	var sql = pair[0];
	var params = pair[1];
	var wantsReturning = /\bINSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql);
	if(wantsReturning) {
		sql += " RETURNING id";
	}
	var result = await this.pool.query(sql, params);
	var lastID = null;
	if(result.rows && result.rows[0] && result.rows[0].id != null) {
		lastID = result.rows[0].id;
	}
	return {
		lastID: lastID,
		changes: result.rowCount
	};
};

WorldPgDb.prototype.exec = async function(command) {
	var statements = command.split(";").map(function(s) {
		return s.trim();
	}).filter(Boolean);
	for(var i = 0; i < statements.length; i++) {
		await this.pool.query(statements[i]);
	}
	return true;
};

WorldPgDb.prototype.end = async function() {
	await this.pool.end();
};

module.exports.create = function(config) {
	return new WorldPgDb(config);
};

module.exports.toPgPlaceholders = toPgPlaceholders;
