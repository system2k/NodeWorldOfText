use redis::Commands;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

const KEY_PREFIX: &str = "owot:tile:";
const DEFAULT_TTL_SECS: u64 = 3600;

#[derive(Clone)]
pub struct TileRedisCache {
    client: redis::Client,
    ttl_secs: u64,
}

#[derive(Clone, Debug)]
pub struct CachedTilePayload {
    pub content: String,
    pub properties: Value,
    pub writability: Option<i32>,
    pub created_at: i64,
}

impl TileRedisCache {
    pub fn connect(redis_url: &str, ttl_secs: Option<u64>) -> anyhow::Result<Self> {
        Ok(Self {
            client: redis::Client::open(redis_url)?,
            ttl_secs: ttl_secs.unwrap_or(DEFAULT_TTL_SECS),
        })
    }

    fn key(world_id: i64, tile_y: i32, tile_x: i32) -> String {
        format!("{KEY_PREFIX}{world_id}:{tile_y}:{tile_x}")
    }

    pub fn get(&self, world_id: i64, tile_y: i32, tile_x: i32) -> Option<CachedTilePayload> {
        let mut conn = self.client.get_connection().ok()?;
        let raw: String = conn.get(Self::key(world_id, tile_y, tile_x)).ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        Some(CachedTilePayload {
            content: v.get("content")?.as_str()?.to_string(),
            properties: v.get("properties").cloned().unwrap_or(Value::Object(Default::default())),
            writability: v.get("writability").and_then(|x| x.as_i64()).map(|x| x as i32),
            created_at: v.get("created_at").and_then(|x| x.as_i64()).unwrap_or(0),
        })
    }

    pub fn set(&self, world_id: i64, tile_y: i32, tile_x: i32, tile: &CachedTilePayload) {
        let Ok(mut conn) = self.client.get_connection() else {
            return;
        };
        let payload = serde_json::json!({
            "content": tile.content,
            "properties": tile.properties,
            "writability": tile.writability,
            "created_at": tile.created_at
        });
        let key = Self::key(world_id, tile_y, tile_x);
        let _: Result<(), _> = conn.set_ex(key, payload.to_string(), self.ttl_secs);
    }
}

pub type SharedTileRedisCache = Arc<TileRedisCache>;
