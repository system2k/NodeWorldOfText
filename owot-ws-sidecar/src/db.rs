use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::OpenFlags;
use std::path::Path;
use std::sync::Arc;

pub type DbPool = r2d2::Pool<SqliteConnectionManager>;

pub fn open_pool(path: &Path) -> anyhow::Result<Arc<DbPool>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let manager = SqliteConnectionManager::file(path).with_flags(
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI,
    );
    let pool = r2d2::Pool::builder()
        .max_size(8)
        .build(manager)?;
    {
        let conn = pool.get()?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=15000;",
        )?;
    }
    Ok(Arc::new(pool))
}
