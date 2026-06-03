use serde::Deserialize;
use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct PgWorldsConfig {
    pub enabled: bool,
    pub host: String,
    pub port: Option<u16>,
    pub user: String,
    pub password: Option<String>,
    pub database: String,
    pub pool_size: usize,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub settings_path: String,
    pub bind_ip: String,
    pub bind_port: u16,
    pub auth_database_path: PathBuf,
    pub redis_url: String,
    pub node_relay_url: String,
    pub max_connections_per_ip: u32,
    pub ws_req_per_second: u32,
    pub tile_cache_redis: bool,
    pub tile_cache_ttl_secs: u64,
    pub pg_worlds: Option<PgWorldsConfig>,
}

#[derive(Deserialize)]
struct SettingsFile {
    #[serde(default)]
    paths: PathsSection,
    #[serde(default)]
    sidecar: SidecarSection,
    #[serde(default)]
    pg_worlds: PgWorldsSection,
}

#[derive(Deserialize, Default)]
struct PathsSection {
    database: Option<String>,
}

#[derive(Deserialize, Default)]
struct SidecarSection {
    enabled: Option<bool>,
    ws_port: Option<u16>,
    ws_ip: Option<String>,
    redis_url: Option<String>,
    node_relay_url: Option<String>,
    database: Option<String>,
    max_connections_per_ip: Option<u32>,
    ws_req_per_second: Option<u32>,
    tile_cache_redis: Option<bool>,
    tile_cache_ttl_secs: Option<u64>,
}

#[derive(Deserialize, Default)]
struct PgWorldsSection {
    enabled: Option<bool>,
    host: Option<String>,
    port: Option<u16>,
    user: Option<String>,
    password: Option<String>,
    database: Option<String>,
    pool_size: Option<usize>,
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let settings_path = env::var("OWOT_SETTINGS")
            .unwrap_or_else(|_| "../nwotdata/settings.json".to_string());
        let mut paths = PathsSection::default();
        let mut cfg = SidecarSection::default();
        let mut pg = PgWorldsSection::default();
        if let Ok(raw) = std::fs::read_to_string(&settings_path) {
            if let Ok(parsed) = serde_json::from_str::<SettingsFile>(&raw) {
                paths = parsed.paths;
                cfg = parsed.sidecar;
                pg = parsed.pg_worlds;
            }
        }

        let auth_database_path = PathBuf::from(
            env::var("OWOT_AUTH_DATABASE")
                .ok()
                .or(paths.database)
                .or(cfg.database.clone())
                .unwrap_or_else(|| "../nwotdata/nwot.sqlite".to_string()),
        );

        let pg_worlds = if pg.enabled.unwrap_or(false) {
            Some(PgWorldsConfig {
                enabled: true,
                host: pg.host.unwrap_or_else(|| "/var/run/postgresql".to_string()),
                port: pg.port,
                user: pg.user.unwrap_or_else(|| "owot_worlds".to_string()),
                password: pg.password,
                database: pg.database.unwrap_or_else(|| "owot_worlds".to_string()),
                pool_size: env::var("OWOT_PG_POOL_SIZE")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .or(pg.pool_size)
                    .unwrap_or(4),
            })
        } else {
            None
        };

        Ok(Self {
            settings_path,
            bind_ip: env::var("OWOT_SIDECAR_IP")
                .ok()
                .or(cfg.ws_ip)
                .unwrap_or_else(|| "127.0.0.1".to_string()),
            bind_port: env::var("OWOT_SIDECAR_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .or(cfg.ws_port)
                .unwrap_or(6770),
            auth_database_path,
            redis_url: env::var("OWOT_REDIS_URL")
                .ok()
                .or(cfg.redis_url)
                .unwrap_or_else(|| "redis://127.0.0.1:6379".to_string()),
            node_relay_url: env::var("OWOT_NODE_RELAY")
                .ok()
                .or(cfg.node_relay_url)
                .unwrap_or_else(|| "http://127.0.0.1:6768/internal/ws-relay/".to_string()),
            max_connections_per_ip: cfg.max_connections_per_ip.unwrap_or(0),
            ws_req_per_second: cfg.ws_req_per_second.unwrap_or(0),
            tile_cache_redis: cfg.tile_cache_redis.unwrap_or(true),
            tile_cache_ttl_secs: cfg.tile_cache_ttl_secs.unwrap_or(3600),
            pg_worlds,
        })
    }
}

pub const TILE_COLS: i32 = 16;
pub const TILE_ROWS: i32 = 8;
pub const TILE_AREA: i32 = TILE_COLS * TILE_ROWS;

pub const TILE_KINDS: &[&str] = &[
    "fetch",
    "write",
    "ping",
    "config",
    "boundary",
    "clear_tile",
    "protect",
    "link",
];

pub fn is_tile_kind(kind: &str) -> bool {
    TILE_KINDS.contains(&kind)
}

pub fn is_sidecar_rate_limited_kind(kind: &str) -> bool {
    matches!(kind, "fetch" | "write" | "ping" | "config" | "boundary")
}
