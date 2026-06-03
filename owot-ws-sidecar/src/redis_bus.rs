use redis::AsyncCommands;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct RedisBus {
    client: redis::aio::ConnectionManager,
    local_tx: Arc<broadcast::Sender<BusMessage>>,
}

#[derive(Clone, Debug)]
pub struct BusMessage {
    pub world_id: i64,
    pub payload: String,
}

impl RedisBus {
    pub async fn connect(redis_url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let manager = client.get_connection_manager().await?;
        let (local_tx, _) = broadcast::channel(4096);
        Ok(Self {
            client: manager,
            local_tx: Arc::new(local_tx),
        })
    }

    pub fn subscribe_local(&self) -> broadcast::Receiver<BusMessage> {
        self.local_tx.subscribe()
    }

    pub async fn publish_broadcast(&self, world_id: i64, payload: String) -> anyhow::Result<()> {
        let envelope = serde_json::json!({ "world_id": world_id, "payload": payload }).to_string();
        let mut conn = self.client.clone();
        conn.publish::<_, _, ()>("owot:ws:broadcast", envelope).await?;
        Ok(())
    }

    pub async fn next_client_id(&self, world_id: i64) -> anyhow::Result<i64> {
        let mut conn = self.client.clone();
        let id: i64 = conn
            .incr(format!("owot:clientid:{world_id}"), 1i64)
            .await?;
        Ok(((id - 1) % 9999) + 1)
    }

    pub fn spawn_subscriber(self: Arc<Self>, redis_url: &str) {
        let url = redis_url.to_string();
        tokio::spawn(async move {
            loop {
                if let Err(err) = self.run_subscriber(&url).await {
                    tracing::error!("redis subscriber error: {err:#}");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            }
        });
    }

    async fn run_subscriber(&self, redis_url: &str) -> anyhow::Result<()> {
        let client = redis::Client::open(redis_url)?;
        let mut pubsub = client.get_async_pubsub().await?;
        pubsub.subscribe("owot:ws:broadcast").await?;
        let mut stream = pubsub.into_on_message();
        use futures_util::StreamExt;
        while let Some(msg) = stream.next().await {
            let payload: String = msg.get_payload()?;
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&payload) {
                let world_id = v.get("world_id").and_then(|x| x.as_i64()).unwrap_or(0);
                let body = v
                    .get("payload")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                if world_id > 0 && !body.is_empty() {
                    let _ = self.local_tx.send(BusMessage {
                        world_id,
                        payload: body,
                    });
                }
            }
        }
        Ok(())
    }
}
