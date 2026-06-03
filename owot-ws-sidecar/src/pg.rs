use deadpool_postgres::{Config as PgConfig, Pool, Runtime};
use std::path::Path;
use tokio_postgres::NoTls;

pub type PgPool = Pool;

pub fn open_pool(
    host: &str,
    port: Option<u16>,
    user: &str,
    password: Option<&str>,
    database: &str,
    max_size: usize,
) -> anyhow::Result<PgPool> {
    let mut cfg = PgConfig::new();
    if host.starts_with('/') {
        cfg.host = Some(host.to_string());
    } else {
        cfg.host = Some(host.to_string());
        if let Some(p) = port {
            cfg.port = Some(p);
        }
    }
    cfg.user = Some(user.to_string());
    if let Some(pass) = password {
        cfg.password = Some(pass.to_string());
    }
    cfg.dbname = Some(database.to_string());
    cfg.pool = Some(deadpool_postgres::PoolConfig {
        max_size: max_size.max(1),
        ..Default::default()
    });
    cfg.create_pool(Some(Runtime::Tokio1), NoTls)
        .map_err(|e| anyhow::anyhow!(e))
}

pub fn open_pool_from_settings(
    host: &str,
    port: Option<u16>,
    user: &str,
    password: Option<&str>,
    database: &str,
    max_size: usize,
) -> anyhow::Result<PgPool> {
    open_pool(host, port, user, password, database, max_size)
}

pub fn auth_sqlite_path(settings_path: &Path, fallback: &Path) -> std::path::PathBuf {
    if let Ok(raw) = std::fs::read_to_string(settings_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(p) = v
                .get("paths")
                .and_then(|x| x.get("database"))
                .and_then(|x| x.as_str())
            {
                return Path::new(p).to_path_buf();
            }
        }
    }
    fallback.to_path_buf()
}
