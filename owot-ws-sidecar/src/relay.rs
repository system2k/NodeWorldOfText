use crate::auth::UserInfo;
use crate::world::WorldInfo;
use reqwest::Client;
use serde_json::{json, Value};

#[derive(Clone)]
pub struct NodeRelay {
    client: Client,
    url: String,
}

impl NodeRelay {
    pub fn new(url: String) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            url,
        }
    }

    pub async fn forward(
        &self,
        kind: &str,
        msg: &Value,
        user: &UserInfo,
        world: &WorldInfo,
        channel: &str,
        client_id: i64,
        ip: &str,
        mem_key: Option<&str>,
    ) -> anyhow::Result<RelayResponse> {
        let body = json!({
            "kind": kind,
            "msg": msg,
            "ctx": {
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "authenticated": user.authenticated,
                    "superuser": user.superuser,
                    "staff": user.staff,
                    "operator": user.operator,
                    "level": user.level
                },
                "worldId": world.id,
                "worldName": world.name,
                "channel": channel,
                "clientId": client_id,
                "ipAddress": ip,
                "memKey": mem_key
            }
        });
        let resp = self
            .client
            .post(&self.url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json::<RelayResponse>()
            .await?;
        Ok(resp)
    }
}

#[derive(Debug, Clone, serde::Deserialize, Default)]
pub struct RelayResponse {
    #[serde(default)]
    pub responses: Vec<String>,
    #[serde(default)]
    pub broadcasts: Vec<RelayBroadcast>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct RelayBroadcast {
    pub world_id: Option<i64>,
    pub payload: String,
    #[serde(default)]
    pub global: bool,
}
