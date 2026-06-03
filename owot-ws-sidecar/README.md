# OWOT WebSocket Sidecar (Rust)

Multi-threaded WebSocket server for **tile fetch/write** with Redis cluster fanout.

Node keeps HTTP (pages, admin, accounts). Chat/cursor/link messages are forwarded to Node's internal relay (`/internal/ws-relay/`).

## Architecture

```
Browser  ──HTTPS──►  nginx
                      ├── /home/, /accounts/, …  ──►  Node :6768 (HTTP)
                      └── */ws/                  ──►  Rust :6770-6771 (WS pool)
                                │
                    tile fetch/write ──► SQLite (WAL)
                    tileUpdate/chat/cursor broadcasts ──► Redis pub/sub ──► all sidecar instances
                    chat/cursor/link/… ──► Node internal relay
```

## Build

```bash
cd owot-ws-sidecar
cargo build --release
```

## Enable

1. Edit your `nwotdata/settings.json` (see `settings_example.json`):

```json
"sidecar": {
  "enabled": true,
  "ws_port": 6770,
  "ws_ip": "127.0.0.1",
  "instances": 2,
  "redis_url": "redis://127.0.0.1:6379",
  "node_relay_url": "http://127.0.0.1:6768/internal/ws-relay/",
  "database": "../nwotdata/nwot.sqlite"
}
```

2. Ensure Redis is running (`redis-cli ping` → `PONG`).

3. Reload nginx (WebSocket locations proxy to `owot_ws` upstream).

4. Restart PM2:

```bash
pm2 start ecosystem.config.js
# or
pm2 restart nodeworldoftext owot-ws-sidecar-0 owot-ws-sidecar-1
```

## Notes

- **v0.1** implements core tile fetch/write; complex protect/link/clear still go through Node relay.
- Write permission checks are simplified vs full Node `write_data.js` (rate limits honor your disabled settings).
- Each sidecar instance has its own tile RAM cache; writes flush to SQLite and broadcast via Redis.
- Scale horizontally by adding upstream servers in nginx `owot_ws` and matching PM2 sidecar processes.

## Environment

| Variable | Default |
|----------|---------|
| `OWOT_SETTINGS` | `../nwotdata/settings.json` |
| `OWOT_SIDECAR_PORT` | `6770` |
| `OWOT_SIDECAR_IP` | `127.0.0.1` |
| `OWOT_DATABASE` | from settings |
| `OWOT_REDIS_URL` | from settings |
| `OWOT_NODE_RELAY` | from settings |
