use crate::auth::UserInfo;
use crate::storage::{hydrate_world, WorldDbBackend};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct WorldInfo {
    pub id: i64,
    pub name: String,
    pub owner_id: Option<i64>,
    pub readability: i32,
    pub writability: i32,
    pub chat_feature: i32,
    pub quick_erase: i32,
    pub member_tiles_addremove: bool,
    pub url_link: i32,
    pub coord_link: i32,
    pub mem_key: String,
    pub members: HashMap<i64, bool>,
}

#[derive(Clone, Debug)]
pub struct WorldPermissions {
    pub member: bool,
    pub owner: bool,
}

pub struct WorldCache {
    backend: WorldDbBackend,
    entries: dashmap::DashMap<String, (WorldInfo, Instant)>,
}

impl WorldCache {
    pub fn new(backend: WorldDbBackend) -> Self {
        Self {
            backend,
            entries: dashmap::DashMap::new(),
        }
    }

    pub fn get_or_create(&self, path: &str, allow_create: bool) -> anyhow::Result<Option<WorldInfo>> {
        let key = path.to_uppercase();
        if let Some(entry) = self.entries.get(&key) {
            if entry.1.elapsed() < Duration::from_secs(60) {
                return Ok(Some(entry.0.clone()));
            }
        }
        let name = path.to_string();
        let world = if allow_create {
            self.fetch_or_insert(&name)?
        } else {
            self.fetch(&name)?
        };
        if let Some(ref w) = world {
            self.entries.insert(key, (w.clone(), Instant::now()));
        }
        Ok(world)
    }

    fn fetch(&self, name: &str) -> anyhow::Result<Option<WorldInfo>> {
        let Some(row) = self.backend.fetch_world(name)? else {
            return Ok(None);
        };
        let members = self.backend.fetch_whitelist(row.id)?;
        Ok(Some(hydrate_world(row, members)))
    }

    fn fetch_or_insert(&self, name: &str) -> anyhow::Result<Option<WorldInfo>> {
        if let Some(w) = self.fetch(name)? {
            return Ok(Some(w));
        }
        let now = chrono::Utc::now().timestamp_millis();
        self.backend.insert_world(name, now)?;
        self.fetch(name)
    }
}

pub fn can_view_world(
    world: &WorldInfo,
    user: &UserInfo,
    mem_key: Option<&str>,
) -> Option<WorldPermissions> {
    let is_owner = world.owner_id == Some(user.id);
    if world.readability == 2 && !is_owner {
        return None;
    }
    let mut is_member = world.members.contains_key(&user.id);
    if let Some(key) = mem_key {
        if !world.mem_key.is_empty() && key == world.mem_key {
            is_member = true;
        }
    }
    if world.readability == 1 && !is_member && !is_owner {
        return None;
    }
    Some(WorldPermissions {
        member: is_member || is_owner,
        owner: is_owner,
    })
}

pub fn parse_world_path(url_path: &str) -> anyhow::Result<String> {
    let mut location = url_path.to_string();
    if location.ends_with('/') {
        location.pop();
    }
    if !location.to_ascii_lowercase().ends_with("/ws") {
        anyhow::bail!("invalid address");
    }
    location = location[..location.len() - 3].to_string();
    if location.starts_with('/') {
        location = location[1..].to_string();
    }
    Ok(location)
}

pub fn is_main_page(name: &str) -> bool {
    name.is_empty()
        || name.eq_ignore_ascii_case("main")
        || name.eq_ignore_ascii_case("owot")
}

pub fn effective_area_perms(
    world: &WorldInfo,
    perms: &WorldPermissions,
    user: &UserInfo,
    mem_key: Option<&str>,
) -> (bool, bool) {
    let (is_owner, is_member) = effective_clear_perms(world, perms, user, mem_key);
    let can_owner = is_owner;
    let can_member = (is_member && world.member_tiles_addremove) || is_owner;
    (can_owner, can_member)
}

pub fn can_set_link(
    world: &WorldInfo,
    perms: &WorldPermissions,
    user: &UserInfo,
    mem_key: Option<&str>,
    link_type: &str,
) -> bool {
    let (is_owner, is_member) = effective_clear_perms(world, perms, user, mem_key);
    let feature_mode = if link_type == "url" {
        world.url_link
    } else {
        world.coord_link
    };
    if feature_mode == 2 && is_owner {
        return true;
    }
    if feature_mode == 1 && is_member {
        return true;
    }
    feature_mode == 0
}

pub fn effective_clear_perms(
    world: &WorldInfo,
    perms: &WorldPermissions,
    user: &UserInfo,
    mem_key: Option<&str>,
) -> (bool, bool) {
    let mut is_owner = perms.owner;
    let mut is_member = perms.member;
    if user.superuser && is_main_page(&world.name) {
        is_owner = true;
        is_member = true;
    }
    if let Some(key) = mem_key {
        if !world.mem_key.is_empty() && key == world.mem_key {
            is_member = true;
        }
    }
    (is_owner, is_member)
}

pub fn client_ip(headers: &axum::http::HeaderMap, remote: Option<std::net::SocketAddr>) -> String {
    if let Some(v) = headers
        .get("cf-connecting-ip")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
    {
        if !v.is_empty() {
            return v.to_string();
        }
    }
    remote
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "0.0.0.0".to_string())
}
