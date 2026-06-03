use crate::auth::{load_user, parse_cookies};
use crate::broadcast::UpdateBatcher;
use crate::config::{is_sidecar_rate_limited_kind, is_tile_kind, Config};
use crate::db::DbPool;
use crate::redis_bus::RedisBus;
use crate::relay::NodeRelay;
use crate::tile::{parse_fetch_rectangles, TileCache};
use crate::world::{can_view_world, client_ip, parse_world_path, WorldCache, WorldInfo};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub auth_db: Arc<DbPool>,
    pub worlds: Arc<WorldCache>,
    pub tiles: TileCache,
    pub redis: Arc<RedisBus>,
    pub update_batcher: Arc<UpdateBatcher>,
    pub relay: NodeRelay,
    pub ip_connections: Arc<DashMap<String, u32>>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/{*path}", get(ws_handler))
        .with_state(state)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: axum::http::HeaderMap,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state, headers, addr, path))
}

async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    headers: axum::http::HeaderMap,
    addr: SocketAddr,
    raw_path: String,
) {
    let ip = client_ip(&headers, Some(addr));
    let full = if raw_path.contains('?') {
        raw_path.clone()
    } else {
        raw_path
    };
    let (path_only, query) = match full.split_once('?') {
        Some((p, q)) => (format!("/{p}"), q.to_string()),
        None => (format!("/{full}"), String::new()),
    };

    let (mut ws_tx, mut ws_rx) = socket.split();
    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if ws_tx.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let send = |payload: String| {
        let _ = out_tx.send(payload);
    };

    let world_path = match parse_world_path(&path_only) {
        Ok(p) => p,
        Err(_) => {
            send(error_packet("INVALID_ADDR", "Invalid address"));
            writer.abort();
            return;
        }
    };

    if !track_ip(&state, &ip) {
        send(error_packet("CONN_LIMIT", "Too many connections"));
        writer.abort();
        return;
    }

    let cookies = parse_cookies(headers.get(axum::http::header::COOKIE).and_then(|v| v.to_str().ok()));
    let user = load_user(&state.auth_db, &cookies).unwrap_or_default();
    let mem_key = parse_query(&query, "key");
    let hide_count = parse_query(&query, "hide").as_deref() == Some("1");

    let world = match state.worlds.get_or_create(&world_path, false) {
        Ok(Some(w)) => w,
        Ok(None) => {
            release_ip(&state, &ip);
            send(error_packet("NO_EXIST", "World does not exist"));
            writer.abort();
            return;
        }
        Err(err) => {
            tracing::error!("world load failed: {err:#}");
            release_ip(&state, &ip);
            writer.abort();
            return;
        }
    };

    let perms = match can_view_world(&world, &user, mem_key.as_deref()) {
        Some(p) => p,
        None => {
            release_ip(&state, &ip);
            send(error_packet("NO_PERM", "No permission"));
            writer.abort();
            return;
        }
    };

    let channel = random_channel();
    let client_id = state.redis.next_client_id(world.id).await.unwrap_or(1);
    let can_chat = world.chat_feature == 0
        || (world.chat_feature == 1 && perms.member)
        || (world.chat_feature == 2 && perms.owner);
    let sent_client_id = if can_chat { client_id } else { -1 };

    send(
        json!({
            "kind": "channel",
            "sender": channel,
            "id": sent_client_id,
            "initial_user_count": if hide_count { Value::Null } else { json!(1) }
        })
        .to_string(),
    );

    let mut redis_rx = state.redis.subscribe_local();
    let world_id = world.id;
    let channel_for_bus = channel.clone();
    let tiles_for_bus = state.tiles.clone();
    let out_tx_bus = out_tx.clone();
    let bus_task = tokio::spawn(async move {
        loop {
            match redis_rx.recv().await {
                Ok(bus) if bus.world_id == world_id => {
                    if let Ok(v) = serde_json::from_str::<Value>(&bus.payload) {
                        if v.get("kind").and_then(|k| k.as_str()) == Some("tileUpdate") {
                            if v.get("channel").and_then(|c| c.as_str()) == Some(&channel_for_bus) {
                                continue;
                            }
                            if let Some(tiles) = v.get("tiles").and_then(|t| t.as_object()) {
                                tiles_for_bus.apply_remote_updates(world_id, tiles);
                            }
                        }
                    }
                    let _ = out_tx_bus.send(bus.payload);
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    let mut reqs_second = 0u32;
    let mut current_second = chrono::Utc::now().timestamp();
    let mut receive_updates = true;

    while let Some(Ok(msg)) = ws_rx.next().await {
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Ping(_) => continue,
            Message::Close(_) => break,
            _ => continue,
        };
        let Ok(parsed) = serde_json::from_str::<Value>(&text) else {
            break;
        };
        let Some(kind_raw) = parsed.get("kind").and_then(|v| v.as_str()) else {
            continue;
        };
        let kind = kind_raw.to_ascii_lowercase();
        if state.config.ws_req_per_second > 0
            && is_sidecar_rate_limited_kind(&kind)
            && !rate_ok(
                &mut reqs_second,
                &mut current_second,
                state.config.ws_req_per_second,
            )
        {
            continue;
        }
        let request_id = parsed.get("request").and_then(|v| v.as_i64());

        if kind == "ping" {
            let mut res = json!({"kind":"ping","result":"pong"});
            if let Some(id) = parsed.get("id") {
                res["id"] = id.clone();
            }
            if let Some(id) = request_id {
                res["request"] = json!(id);
            }
            send(res.to_string());
            continue;
        }

        if kind == "config" {
            if let Some(v) = parsed.get("receiveContentUpdates") {
                receive_updates = v.as_bool().unwrap_or(true);
            }
            let _ = receive_updates;
            continue;
        }

        if kind == "boundary" {
            continue;
        }

        if kind == "fetch" {
            match handle_fetch(&state, &world, &parsed) {
                Ok(tiles) => {
                    let mut res = json!({"kind":"fetch","tiles": tiles});
                    if let Some(id) = request_id {
                        res["request"] = json!(id);
                    }
                    send(res.to_string());
                }
                Err(err) => {
                    send(
                        json!({"kind":"error","code":"PARAM","message": err}).to_string(),
                    );
                }
            }
            continue;
        }

        if kind == "write" {
            let edits = parsed
                .get("edits")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let (accepted, rejected, updated) =
                state.tiles.apply_writes(&world, &perms, &user, &edits);
            if !updated.is_empty() {
                state
                    .update_batcher
                    .queue(world.id, &channel, updated);
            }
            let mut res = json!({"kind":"write","accepted": accepted, "rejected": rejected});
            if let Some(id) = request_id {
                res["request"] = json!(id);
            }
            send(res.to_string());
            continue;
        }

        if kind == "clear_tile" {
            if let Some(updated) = state.tiles.clear_tile(
                &world,
                &perms,
                &user,
                mem_key.as_deref(),
                &parsed,
            ) {
                state
                    .update_batcher
                    .queue(world.id, &channel, updated);
            }
            continue;
        }

        if kind == "protect" {
            if let Some(updated) = state.tiles.protect_tile(
                &world,
                &perms,
                &user,
                mem_key.as_deref(),
                &parsed,
            ) {
                state
                    .update_batcher
                    .queue(world.id, &channel, updated);
            }
            continue;
        }

        if kind == "link" {
            if let Some(updated) = state.tiles.set_link(
                &world,
                &perms,
                &user,
                mem_key.as_deref(),
                &parsed,
            ) {
                state
                    .update_batcher
                    .queue(world.id, &channel, updated);
            }
            continue;
        }

        if is_tile_kind(&kind) {
            continue;
        }

        match state
            .relay
            .forward(
                &kind,
                &parsed,
                &user,
                &world,
                &channel,
                client_id,
                &ip,
                mem_key.as_deref(),
            )
            .await
        {
            Ok(resp) => {
                for r in resp.responses {
                    send(r);
                }
                for b in resp.broadcasts {
                    let target_world = b.world_id.unwrap_or(world.id);
                    let _ = state
                        .redis
                        .publish_broadcast(target_world, b.payload)
                        .await;
                }
            }
            Err(err) => {
                tracing::warn!("relay {kind} failed: {err:#}");
            }
        }
    }

    bus_task.abort();
    writer.abort();
    release_ip(&state, &ip);
}

fn handle_fetch(
    state: &AppState,
    world: &WorldInfo,
    msg: &Value,
) -> Result<Value, String> {
    let rects = parse_fetch_rectangles(msg)?;
    let map = state
        .tiles
        .fetch_rectangles(world.id, &rects)
        .map_err(|e| e.to_string())?;
    Ok(Value::Object(map))
}

fn track_ip(state: &AppState, ip: &str) -> bool {
    let mut entry = state.ip_connections.entry(ip.to_string()).or_insert(0);
    if state.config.max_connections_per_ip == 0 {
        *entry += 1;
        return true;
    }
    if *entry >= state.config.max_connections_per_ip {
        return false;
    }
    *entry += 1;
    true
}

fn release_ip(state: &AppState, ip: &str) {
    if let Some(mut entry) = state.ip_connections.get_mut(ip) {
        if *entry > 0 {
            *entry -= 1;
        }
    }
}

fn rate_ok(reqs: &mut u32, second: &mut i64, limit: u32) -> bool {
    let now = chrono::Utc::now().timestamp();
    if now != *second {
        *second = now;
        *reqs = 0;
    }
    *reqs += 1;
    *reqs <= limit
}

fn random_channel() -> String {
    let mut rng = rand::thread_rng();
    (0..7).map(|_| format!("{:02x}", rng.gen::<u8>())).collect()
}

fn parse_query(query: &str, key: &str) -> Option<String> {
    for part in query.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k == key {
                return Some(v.replace('+', " "));
            }
        }
    }
    None
}

fn error_packet(code: &str, message: &str) -> String {
    json!({"kind":"error","code":code,"message":message}).to_string()
}
