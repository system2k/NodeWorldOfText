mod auth;
mod broadcast;
mod char_prot;
mod config;
mod db;
mod pg;
mod redis_bus;
mod relay;
mod storage;
mod tile;
mod tile_redis;
mod world;
mod ws;

use crate::broadcast::UpdateBatcher;
use crate::config::Config;
use crate::db::open_pool as open_sqlite_pool;
use crate::pg::open_pool as open_pg_pool;
use crate::redis_bus::RedisBus;
use crate::relay::NodeRelay;
use crate::storage::WorldDbBackend;
use crate::tile::TileCache;
use crate::tile_redis::TileRedisCache;
use crate::world::WorldCache;
use crate::ws::{router, AppState};
use axum::Router;
use dashmap::DashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("owot_ws_sidecar=info".parse()?))
        .init();

    let config = Config::load()?;
    let auth_db = open_sqlite_pool(&config.auth_database_path)?;

    let world_backend = if let Some(pg_cfg) = &config.pg_worlds {
        tracing::info!(
            "Using PostgreSQL world store: {}@{}",
            pg_cfg.database,
            pg_cfg.host
        );
        WorldDbBackend::Postgres(open_pg_pool(
            &pg_cfg.host,
            pg_cfg.port,
            &pg_cfg.user,
            pg_cfg.password.as_deref(),
            &pg_cfg.database,
            pg_cfg.pool_size,
        )?)
    } else {
        tracing::info!(
            "Using SQLite world store: {}",
            config.auth_database_path.display()
        );
        WorldDbBackend::Sqlite(auth_db.clone())
    };

    let tile_redis = if config.tile_cache_redis {
        Some(Arc::new(TileRedisCache::connect(
            &config.redis_url,
            Some(config.tile_cache_ttl_secs),
        )?))
    } else {
        None
    };

    let worlds = Arc::new(WorldCache::new(world_backend.clone()));
    let tiles = TileCache::new(world_backend, tile_redis);
    tiles.spawn_background_tasks();
    let redis = Arc::new(RedisBus::connect(&config.redis_url).await?);
    redis.clone().spawn_subscriber(&config.redis_url);
    let update_batcher = UpdateBatcher::new(redis.clone());
    let relay = NodeRelay::new(config.node_relay_url.clone());

    let state = AppState {
        config: config.clone(),
        auth_db,
        worlds,
        tiles,
        redis,
        update_batcher,
        relay,
        ip_connections: Arc::new(DashMap::new()),
    };

    let app = Router::new().merge(router(state)).layer(TraceLayer::new_for_http());

    let bind = format!("{}:{}", config.bind_ip, config.bind_port);
    tracing::info!("OWOT WS sidecar listening on {bind}");
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}
