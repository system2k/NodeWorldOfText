use crate::pg::PgPool;
use crate::tile::CachedTile;
use crate::world::WorldInfo;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use crate::db::DbPool as SqlitePool;

#[derive(Clone)]
pub enum WorldDbBackend {
    Sqlite(Arc<SqlitePool>),
    Postgres(PgPool),
}

fn pg_block<F, T>(future: F) -> anyhow::Result<T>
where
    F: std::future::Future<Output = anyhow::Result<T>>,
{
    tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(future))
}

impl WorldDbBackend {
    pub fn fetch_world(&self, name: &str) -> anyhow::Result<Option<WorldRow>> {
        match self {
            Self::Sqlite(pool) => {
                let conn = pool.get()?;
                let mut stmt = conn.prepare(
                    "SELECT id, name, owner_id, readability, writability, properties, feature_membertiles_addremove, feature_url_link, feature_coord_link FROM world WHERE name = ?1",
                )?;
                let row = stmt.query_row([name], |row| {
                    Ok(WorldRow {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        owner_id: row.get(2)?,
                        readability: row.get(3)?,
                        writability: row.get(4)?,
                        properties: row.get(5)?,
                        member_tiles_addremove: row.get::<_, i32>(6)? != 0,
                        url_link: row.get(7)?,
                        coord_link: row.get(8)?,
                    })
                });
                Ok(row.ok())
            }
            Self::Postgres(pool) => pg_block(async move {
                let client = pool.get().await?;
                let row = client
                    .query_opt(
                        "SELECT id, name, owner_id, readability, writability, properties, feature_membertiles_addremove, feature_url_link, feature_coord_link FROM world WHERE lower(name) = lower($1)",
                        &[&name],
                    )
                    .await?;
                Ok(row.map(|r| WorldRow {
                    id: r.get::<_, i32>(0) as i64,
                    name: r.get(1),
                    owner_id: r.get::<_, Option<i32>>(2).map(|v| v as i64),
                    readability: r.get(3),
                    writability: r.get(4),
                    properties: r.get(5),
                    member_tiles_addremove: r.get(6),
                    url_link: r.get(7),
                    coord_link: r.get(8),
                }))
            }),
        }
    }

    pub fn insert_world(&self, name: &str, now: i64) -> anyhow::Result<()> {
        match self {
            Self::Sqlite(pool) => {
                let conn = pool.get()?;
                conn.execute(
                    "INSERT INTO world (name, created_at, feature_go_to_coord, feature_membertiles_addremove, feature_paste, feature_coord_link, feature_url_link, custom_bg, custom_cursor, custom_guest_cursor, custom_color, custom_tile_owner, custom_tile_member, writability, readability, properties) VALUES (?1, ?2, 0, 0, 0, 0, 0, '', '', '', '', '', '', 0, 0, '{}')",
                    rusqlite::params![name, now],
                )?;
            }
            Self::Postgres(pool) => {
                let name = name.to_string();
                pg_block(async move {
                    let client = pool.get().await?;
                    client
                        .execute(
                            "INSERT INTO world (name, created_at, feature_go_to_coord, feature_membertiles_addremove, feature_paste, feature_coord_link, feature_url_link, custom_bg, custom_cursor, custom_guest_cursor, custom_color, custom_tile_owner, custom_tile_member, writability, readability, properties) VALUES ($1, $2, 0, false, 0, 0, 0, '', '', '', '', '', '', 0, 0, '{}')",
                            &[&name, &now],
                        )
                        .await?;
                    Ok(())
                })?;
            }
        }
        Ok(())
    }

    pub fn fetch_whitelist(&self, world_id: i64) -> anyhow::Result<HashMap<i64, bool>> {
        match self {
            Self::Sqlite(pool) => {
                let mut members = HashMap::new();
                let conn = pool.get()?;
                let mut stmt = conn.prepare("SELECT user_id FROM whitelist WHERE world_id = ?1")?;
                let rows = stmt.query_map([world_id], |row| row.get::<_, i64>(0))?;
                for row in rows {
                    members.insert(row?, true);
                }
                Ok(members)
            }
            Self::Postgres(pool) => pg_block(async move {
                let mut members = HashMap::new();
                let client = pool.get().await?;
                let world_id_i32 = world_id as i32;
                let rows = client
                    .query(
                        "SELECT user_id FROM whitelist WHERE world_id = $1",
                        &[&world_id_i32],
                    )
                    .await?;
                for row in rows {
                    members.insert(row.get::<_, i32>(0) as i64, true);
                }
                Ok(members)
            }),
        }
    }

    pub fn load_tile(
        &self,
        world_id: i64,
        tile_y: i32,
        tile_x: i32,
    ) -> anyhow::Result<Option<CachedTile>> {
        match self {
            Self::Sqlite(pool) => {
                let conn = pool.get()?;
                let mut stmt = conn.prepare(
                    "SELECT content, properties, writability, created_at FROM tile WHERE world_id = ?1 AND tileY = ?2 AND tileX = ?3",
                )?;
                let row = stmt.query_row(rusqlite::params![world_id, tile_y, tile_x], |row| {
                    Ok(CachedTile {
                        content: row.get(0)?,
                        properties: serde_json::from_str(&row.get::<_, String>(1)?)
                            .unwrap_or(json!({})),
                        writability: row.get(2)?,
                        created_at: row.get(3)?,
                    })
                });
                Ok(row.ok())
            }
            Self::Postgres(pool) => pg_block(async move {
                let client = pool.get().await?;
                let world_id_i32 = world_id as i32;
                let row = client
                    .query_opt(
                        "SELECT content, properties, writability, created_at FROM tile WHERE world_id = $1 AND \"tileY\" = $2 AND \"tileX\" = $3",
                        &[&world_id_i32, &tile_y, &tile_x],
                    )
                    .await?;
                Ok(row.map(|r| CachedTile {
                    content: r.get(0),
                    properties: serde_json::from_str::<Value>(r.get(1)).unwrap_or(json!({})),
                    writability: r.get::<_, Option<i32>>(2).map(|v| v as i32),
                    created_at: r.get(3),
                }))
            }),
        }
    }

    pub async fn flush_tiles_async(
        &self,
        entries: Vec<(i64, i32, i32, CachedTile)>,
    ) -> anyhow::Result<usize> {
        if entries.is_empty() {
            return Ok(0);
        }
        match self {
            Self::Sqlite(pool) => {
                let pool = pool.clone();
                tokio::task::spawn_blocking(move || Self::flush_sqlite(&pool, &entries)).await?
            }
            Self::Postgres(pool) => Self::flush_postgres(pool, &entries).await,
        }
    }

    fn flush_sqlite(pool: &SqlitePool, entries: &[(i64, i32, i32, CachedTile)]) -> anyhow::Result<usize> {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        for (world_id, tile_y, tile_x, tile) in entries {
            let props_str = serde_json::to_string(&tile.properties)?;
            tx.execute(
                "INSERT INTO tile (world_id, content, tileY, tileX, properties, writability, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(world_id, tileY, tileX) DO UPDATE SET content = excluded.content, properties = excluded.properties, writability = excluded.writability",
                rusqlite::params![
                    world_id,
                    tile.content,
                    tile_y,
                    tile_x,
                    props_str,
                    tile.writability,
                    tile.created_at
                ],
            )?;
        }
        tx.commit()?;
        Ok(entries.len())
    }

    async fn flush_postgres(
        pool: &PgPool,
        entries: &[(i64, i32, i32, CachedTile)],
    ) -> anyhow::Result<usize> {
        const CHUNK: usize = 256;
        let mut client = pool.get().await?;
        let transaction = client.transaction().await?;
        for chunk in entries.chunks(CHUNK) {
            let mut world_ids = Vec::with_capacity(chunk.len());
            let mut contents = Vec::with_capacity(chunk.len());
            let mut tile_ys = Vec::with_capacity(chunk.len());
            let mut tile_xs = Vec::with_capacity(chunk.len());
            let mut properties = Vec::with_capacity(chunk.len());
            let mut writabilities = Vec::with_capacity(chunk.len());
            let mut created_ats = Vec::with_capacity(chunk.len());
            for (world_id, tile_y, tile_x, tile) in chunk {
                world_ids.push(*world_id as i32);
                contents.push(tile.content.as_str());
                tile_ys.push(*tile_y);
                tile_xs.push(*tile_x);
                properties.push(serde_json::to_string(&tile.properties)?);
                writabilities.push(tile.writability);
                created_ats.push(tile.created_at);
            }
            transaction
                .execute(
                    r#"
                    INSERT INTO tile (world_id, content, "tileY", "tileX", properties, writability, created_at)
                    SELECT u.world_id, u.content, u.tile_y, u.tile_x, u.properties, u.writability, u.created_at
                    FROM UNNEST(
                        $1::int[],
                        $2::varchar(128)[],
                        $3::int[],
                        $4::int[],
                        $5::text[],
                        $6::int[],
                        $7::bigint[]
                    ) AS u(world_id, content, tile_y, tile_x, properties, writability, created_at)
                    ON CONFLICT (world_id, "tileY", "tileX") DO UPDATE SET
                        content = EXCLUDED.content,
                        properties = EXCLUDED.properties,
                        writability = EXCLUDED.writability
                    WHERE tile.content IS DISTINCT FROM EXCLUDED.content
                       OR tile.properties IS DISTINCT FROM EXCLUDED.properties
                       OR tile.writability IS DISTINCT FROM EXCLUDED.writability
                    "#,
                    &[
                        &world_ids,
                        &contents,
                        &tile_ys,
                        &tile_xs,
                        &properties,
                        &writabilities,
                        &created_ats,
                    ],
                )
                .await?;
        }
        transaction.commit().await?;
        Ok(entries.len())
    }
}

#[derive(Clone, Debug)]
pub struct WorldRow {
    pub id: i64,
    pub name: String,
    pub owner_id: Option<i64>,
    pub readability: i32,
    pub writability: i32,
    pub properties: String,
    pub member_tiles_addremove: bool,
    pub url_link: i32,
    pub coord_link: i32,
}

pub fn hydrate_world(row: WorldRow, members: HashMap<i64, bool>) -> WorldInfo {
    let props: Value =
        serde_json::from_str(&row.properties).unwrap_or(Value::Object(Default::default()));
    let mem_key = props
        .get("mem_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let chat_feature = props
        .get("chat_permission")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let quick_erase = props
        .get("quick_erase")
        .and_then(|v| v.as_i64())
        .unwrap_or(2) as i32;
    WorldInfo {
        id: row.id,
        name: row.name,
        owner_id: row.owner_id,
        readability: row.readability,
        writability: row.writability,
        chat_feature,
        quick_erase,
        member_tiles_addremove: row.member_tiles_addremove,
        url_link: row.url_link,
        coord_link: row.coord_link,
        mem_key,
        members,
    }
}
