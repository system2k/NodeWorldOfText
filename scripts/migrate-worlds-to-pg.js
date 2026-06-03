"use strict";

/*
	Copy world/tile/whitelist from SQLite (nwot.sqlite) into the dedicated owot_worlds
	PostgreSQL database. Read-only on SQLite; only writes to owot_worlds.
	Does not modify any other PostgreSQL databases.
*/

const path = require("path");
const sqlite3 = require("sqlite3");
const pg = require("pg");

const SETTINGS_PATH = process.env.OWOT_SETTINGS || path.join(__dirname, "../nwotdata/settings.json");
const settings = require(SETTINGS_PATH);
const pgCfg = settings.pg_worlds || {};

const SQLITE_PATH = path.resolve(__dirname, "..", settings.paths.database);
const BATCH = 2000;

function openSqlite() {
	return new Promise(function(resolve, reject) {
		var db = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY, function(err) {
			if(err) reject(err);
			else resolve(db);
		});
	});
}

function sqliteAll(db, sql, params) {
	return new Promise(function(resolve, reject) {
		db.all(sql, params || [], function(err, rows) {
			if(err) reject(err);
			else resolve(rows);
		});
	});
}

async function main() {
	console.log("SQLite source:", SQLITE_PATH);
	console.log("PostgreSQL target:", pgCfg.database || "owot_worlds");

	var sqlite = await openSqlite();
	var pool = new pg.Pool({
		host: pgCfg.host || "/var/run/postgresql",
		port: pgCfg.port || undefined,
		user: pgCfg.user || "owot_worlds",
		password: pgCfg.password || undefined,
		database: pgCfg.database || "owot_worlds"
	});

	var client = await pool.connect();
	try {
		var worldCount = (await sqliteAll(sqlite, "SELECT COUNT(*) AS c FROM world"))[0].c;
		var tileCount = (await sqliteAll(sqlite, "SELECT COUNT(*) AS c FROM tile"))[0].c;
		var wlCount = (await sqliteAll(sqlite, "SELECT COUNT(*) AS c FROM whitelist"))[0].c;
		console.log(`Copying ${worldCount} worlds, ${tileCount} tiles, ${wlCount} whitelist rows...`);

		await client.query("BEGIN");
		await client.query("TRUNCATE tile, whitelist, world RESTART IDENTITY CASCADE");

		var worlds = await sqliteAll(sqlite, "SELECT * FROM world ORDER BY id");
		for(var i = 0; i < worlds.length; i++) {
			var w = worlds[i];
			await client.query(
				`INSERT INTO world (
					id, name, owner_id, created_at, feature_go_to_coord, feature_membertiles_addremove,
					feature_paste, feature_coord_link, feature_url_link, custom_bg, custom_cursor,
					custom_guest_cursor, custom_color, custom_tile_owner, custom_tile_member,
					writability, readability, properties
				) VALUES (
					$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
				)`,
				[
					w.id, w.name, w.owner_id, w.created_at, w.feature_go_to_coord,
					!!w.feature_membertiles_addremove, w.feature_paste, w.feature_coord_link,
					w.feature_url_link, w.custom_bg, w.custom_cursor, w.custom_guest_cursor,
					w.custom_color, w.custom_tile_owner, w.custom_tile_member,
					w.writability, w.readability, w.properties
				]
			);
		}
		await client.query("SELECT setval(pg_get_serial_sequence('world','id'), COALESCE((SELECT MAX(id) FROM world), 1))");

		var whitelist = await sqliteAll(sqlite, "SELECT * FROM whitelist ORDER BY id");
		for(var j = 0; j < whitelist.length; j++) {
			var row = whitelist[j];
			await client.query(
				"INSERT INTO whitelist (id, user_id, world_id, created_at) VALUES ($1,$2,$3,$4)",
				[row.id, row.user_id, row.world_id, row.created_at]
			);
		}
		await client.query("SELECT setval(pg_get_serial_sequence('whitelist','id'), COALESCE((SELECT MAX(id) FROM whitelist), 1))");

		var offset = 0;
		while(true) {
			var tiles = await sqliteAll(
				sqlite,
				"SELECT id, world_id, content, tileY, tileX, properties, writability, created_at FROM tile ORDER BY id LIMIT ? OFFSET ?",
				[BATCH, offset]
			);
			if(!tiles.length) break;

			var values = [];
			var params = [];
			var paramIdx = 1;
			for(var t = 0; t < tiles.length; t++) {
				var tile = tiles[t];
				values.push("($" + paramIdx + ",$" + (paramIdx + 1) + ",$" + (paramIdx + 2) + ",$" + (paramIdx + 3) + ",$" + (paramIdx + 4) + ",$" + (paramIdx + 5) + ",$" + (paramIdx + 6) + ",$" + (paramIdx + 7) + ")");
				params.push(
					tile.id, tile.world_id, tile.content, tile.tileY, tile.tileX,
					tile.properties, tile.writability, tile.created_at
				);
				paramIdx += 8;
			}
			await client.query(
				`INSERT INTO tile (id, world_id, content, "tileY", "tileX", properties, writability, created_at) VALUES ${values.join(",")}`,
				params
			);

			offset += tiles.length;
			if(offset % 20000 === 0 || tiles.length < BATCH) {
				console.log(`  tiles: ${offset}/${tileCount}`);
			}
			if(tiles.length < BATCH) break;
		}
		await client.query("SELECT setval(pg_get_serial_sequence('tile','id'), COALESCE((SELECT MAX(id) FROM tile), 1))");

		await client.query("COMMIT");
		console.log("Migration complete.");
	} catch(err) {
		await client.query("ROLLBACK");
		throw err;
	} finally {
		client.release();
		await pool.end();
		sqlite.close();
	}
}

main().catch(function(err) {
	console.error(err);
	process.exit(1);
});
