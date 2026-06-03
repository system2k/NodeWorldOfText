"use strict";

/**
 * PM2 process config for NodeWorldOfText + optional Rust WS sidecar.
 *
 * Node (HTTP/admin): fork mode, 1 instance — admin pages and WS relay for chat/cursor.
 * Rust sidecar: 30 instances on ports 6770–6799 for WebSocket tile I/O.
 * PG access via PgBouncer on 127.0.0.1:6432 (see scripts/setup-pgbouncer-owot.sh).
 *
 * Enable sidecar in nwotdata/settings.json: "sidecar": { "enabled": true, ... }
 * Then: pm2 start ecosystem.config.js
 */
const path = require("path");
const SIDECAR_COUNT = 30;
const SIDECAR_BASE_PORT = 6770;

const sidecarApps = [];
for (let i = 0; i < SIDECAR_COUNT; i++) {
	sidecarApps.push({
		name: `owot-ws-sidecar-${i}`,
		script: "./owot-ws-sidecar/target/release/owot-ws-sidecar",
		cwd: __dirname,
		instances: 1,
		exec_mode: "fork",
		autorestart: true,
		watch: false,
		merge_logs: true,
		env: {
			OWOT_SETTINGS: process.env.OWOT_SETTINGS || path.join(__dirname, "../nwotdata/settings.json"),
			OWOT_SIDECAR_PORT: String(SIDECAR_BASE_PORT + i),
			OWOT_SIDECAR_IP: "127.0.0.1",
			OWOT_PG_POOL_SIZE: "4",
		},
	});
}

module.exports = {
	apps: [
		{
			name: "nodeworldoftext",
			script: "./runserver.js",
			cwd: __dirname,
			instances: 1,
			exec_mode: "fork",
			autorestart: true,
			watch: false,
			merge_logs: true,
			kill_retry_time: 100,
			max_memory_restart: "1536M",
		},
		...sidecarApps,
	],
};
