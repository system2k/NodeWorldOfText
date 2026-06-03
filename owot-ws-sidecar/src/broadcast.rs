use crate::redis_bus::RedisBus;
use dashmap::DashMap;
use serde_json::{json, Map, Value};
use std::sync::Arc;
use std::time::Duration;

struct PendingWorldUpdate {
    channel: String,
    tiles: Map<String, Value>,
}

pub struct UpdateBatcher {
    queues: DashMap<i64, PendingWorldUpdate>,
    redis: Arc<RedisBus>,
}

impl UpdateBatcher {
    pub fn new(redis: Arc<RedisBus>) -> Arc<Self> {
        let batcher = Arc::new(Self {
            queues: DashMap::new(),
            redis,
        });
        let tick = batcher.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(33)).await;
                tick.flush().await;
            }
        });
        batcher
    }

    pub fn queue(&self, world_id: i64, channel: &str, tiles: Map<String, Value>) {
        if tiles.is_empty() {
            return;
        }
        self.queues
            .entry(world_id)
            .and_modify(|pending| {
                pending.channel = channel.to_string();
                for (key, value) in tiles.clone() {
                    pending.tiles.insert(key, value);
                }
            })
            .or_insert_with(|| PendingWorldUpdate {
                channel: channel.to_string(),
                tiles,
            });
    }

    async fn flush(&self) {
        let world_ids: Vec<i64> = self.queues.iter().map(|entry| *entry.key()).collect();
        for world_id in world_ids {
            let Some((_, pending)) = self.queues.remove(&world_id) else {
                continue;
            };
            if pending.tiles.is_empty() {
                continue;
            }
            let update = json!({
                "kind": "tileUpdate",
                "source": "write",
                "channel": pending.channel,
                "tiles": pending.tiles
            });
            if let Err(err) = self
                .redis
                .publish_broadcast(world_id, update.to_string())
                .await
            {
                tracing::warn!("broadcast flush world {world_id}: {err:#}");
            }
        }
    }
}
