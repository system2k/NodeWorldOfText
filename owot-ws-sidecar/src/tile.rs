use crate::char_prot::{decode_char_prot, encode_char_prot, prop_char_all_null, prop_char_is_consistent};
use crate::config::{TILE_AREA, TILE_COLS, TILE_ROWS};
use crate::storage::WorldDbBackend;
use crate::tile_redis::{CachedTilePayload, SharedTileRedisCache};
use crate::world::{WorldInfo, WorldPermissions};
use crate::auth::UserInfo;
use anyhow::Context;
use dashmap::DashMap;
use serde_json::{json, Map, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
pub struct TileCache {
    backend: WorldDbBackend,
    redis_cache: Option<SharedTileRedisCache>,
    tiles: Arc<DashMap<(i64, i32, i32), CachedTile>>,
    dirty: Arc<DashMap<(i64, i32, i32), ()>>,
    flushing: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct CachedTile {
    pub content: String,
    pub properties: Value,
    pub writability: Option<i32>,
    pub created_at: i64,
}

fn tile_payload_from(tile: &CachedTile) -> CachedTilePayload {
    CachedTilePayload {
        content: tile.content.clone(),
        properties: tile.properties.clone(),
        writability: tile.writability,
        created_at: tile.created_at,
    }
}

fn tile_from_payload(payload: CachedTilePayload) -> CachedTile {
    CachedTile {
        content: payload.content,
        properties: payload.properties,
        writability: payload.writability,
        created_at: payload.created_at,
    }
}

impl TileCache {
    pub fn new(backend: WorldDbBackend, redis_cache: Option<SharedTileRedisCache>) -> Self {
        Self {
            backend,
            redis_cache,
            tiles: Arc::new(DashMap::new()),
            dirty: Arc::new(DashMap::new()),
            flushing: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn spawn_background_tasks(&self) {
        let backend = self.backend.clone();
        let tiles = self.tiles.clone();
        let dirty = self.dirty.clone();
        let flushing = self.flushing.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                if flushing
                    .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
                    .is_err()
                {
                    continue;
                }
                let batch = collect_dirty_batch(&tiles, &dirty);
                let result = backend.flush_tiles_async(batch).await;
                match result {
                    Ok(count) if count > 0 => {
                        tracing::debug!("flushed {count} dirty tiles to database");
                    }
                    Ok(_) => {}
                    Err(err) => tracing::error!("tile flush: {err:#}"),
                }
                flushing.store(false, Ordering::Release);
            }
        });
    }

    pub fn fetch_rectangles(
        &self,
        world_id: i64,
        rectangles: &[FetchRect],
    ) -> anyhow::Result<Map<String, Value>> {
        let mut tiles = Map::new();
        for rect in rectangles {
            for ty in rect.min_y..=rect.max_y {
                for tx in rect.min_x..=rect.max_x {
                    let key = format!("{ty},{tx}");
                    tiles.insert(key, Value::Null);
                }
            }
        }
        for (key, _) in tiles.clone() {
            let mut parts = key.split(',');
            let ty: i32 = parts.next().context("y")?.parse()?;
            let tx: i32 = parts.next().context("x")?.parse()?;
            if let Some(normalized) = self.get_normalized(world_id, ty, tx)? {
                tiles.insert(key, normalized);
            }
        }
        Ok(tiles)
    }

    fn get_normalized(&self, world_id: i64, ty: i32, tx: i32) -> anyhow::Result<Option<Value>> {
        let tile = self.load_tile(world_id, ty, tx)?;
        let Some(tile) = tile else {
            return Ok(None);
        };
        let mut props = tile.properties.clone();
        if let Some(w) = tile.writability {
            props["writability"] = json!(w);
        }
        Ok(Some(json!({
            "content": tile.content,
            "properties": props
        })))
    }

    fn load_tile(&self, world_id: i64, ty: i32, tx: i32) -> anyhow::Result<Option<CachedTile>> {
        let cache_key = (world_id, ty, tx);
        if let Some(hit) = self.tiles.get(&cache_key) {
            return Ok(Some(hit.clone()));
        }
        if let Some(redis) = &self.redis_cache {
            if let Some(payload) = redis.get(world_id, ty, tx) {
                let tile = tile_from_payload(payload);
                self.tiles.insert(cache_key, tile.clone());
                return Ok(Some(tile));
            }
        }
        if let Some(tile) = self.backend.load_tile(world_id, ty, tx)? {
            self.tiles.insert(cache_key, tile.clone());
            if let Some(redis) = &self.redis_cache {
                redis.set(world_id, ty, tx, &tile_payload_from(&tile));
            }
            return Ok(Some(tile));
        }
        Ok(None)
    }

    pub fn apply_writes(
        &self,
        world: &WorldInfo,
        perms: &WorldPermissions,
        user: &UserInfo,
        edits: &[Value],
    ) -> (Vec<i64>, Map<String, Value>, Map<String, Value>) {
        let mut accepted = Vec::new();
        let mut rejected = Map::new();
        let mut updated_tiles: Map<String, Value> = Map::new();
        let now = chrono::Utc::now().timestamp_millis();

        for edit in edits {
            let Some(arr) = edit.as_array() else { continue };
            if arr.len() < 7 {
                continue;
            }
            let tile_y = json_num(&arr[0]);
            let tile_x = json_num(&arr[1]);
            let char_y = json_num(&arr[2]);
            let char_x = json_num(&arr[3]);
            let ch = arr[5].as_str().unwrap_or(" ").chars().next().unwrap_or(' ');
            let edit_id = json_num(&arr[6]) as i64;
            let color = arr.get(7).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let bg_color = arr.get(8).and_then(|v| v.as_i64()).unwrap_or(-1) as i32;

            if char_y < 0 || char_y >= 8 || char_x < 0 || char_x >= 16 {
                rejected.insert(edit_id.to_string(), json!(1));
                continue;
            }

            if !self.can_write_cell(world, perms, user, tile_x, tile_y, char_x, char_y) {
                rejected.insert(edit_id.to_string(), json!(1));
                continue;
            }

            match self.write_cell(
                world.id,
                tile_y,
                tile_x,
                char_y,
                char_x,
                ch,
                color,
                bg_color,
                now,
            ) {
                Ok(update) => {
                    accepted.push(edit_id);
                    updated_tiles.insert(format!("{tile_y},{tile_x}"), update);
                }
                Err(_) => {
                    rejected.insert(edit_id.to_string(), json!(1));
                }
            }
        }

        (accepted, rejected, updated_tiles)
    }

    pub fn clear_tile(
        &self,
        world: &WorldInfo,
        perms: &WorldPermissions,
        user: &UserInfo,
        mem_key: Option<&str>,
        msg: &Value,
    ) -> Option<Map<String, Value>> {
        let (is_owner, is_member) =
            crate::world::effective_clear_perms(world, perms, user, mem_key);
        let can_member = is_member && world.quick_erase != 0;
        if !is_owner && !can_member {
            return None;
        }
        if world.quick_erase == 2 && !is_owner {
            return None;
        }
        if world.quick_erase == 1 && !is_member && !is_owner {
            return None;
        }

        let data = msg.get("data").and_then(|v| v.as_object())?;
        let tile_x = json_num(data.get("tileX").unwrap_or(&Value::Null));
        let tile_y = json_num(data.get("tileY").unwrap_or(&Value::Null));
        let mut char_x = json_num(data.get("charX").unwrap_or(&Value::Null));
        let mut char_y = json_num(data.get("charY").unwrap_or(&Value::Null));
        let mut char_width = json_num(data.get("charWidth").unwrap_or(&Value::Null));
        let mut char_height = json_num(data.get("charHeight").unwrap_or(&Value::Null));

        let char_idx = char_y * TILE_COLS + char_x;
        char_x = char_idx % TILE_COLS;
        char_y = char_idx / TILE_COLS;
        if char_idx < 0 || char_idx >= TILE_AREA {
            return None;
        }

        if char_width == 0 && char_height == 0 {
            char_width = TILE_COLS;
            char_height = TILE_ROWS;
        }
        if char_width <= 0 {
            char_width = 1;
        }
        if char_height <= 0 {
            char_height = 1;
        }
        if char_width > TILE_COLS {
            char_width = TILE_COLS;
        }
        if char_height > TILE_ROWS {
            char_height = TILE_ROWS;
        }

        let now = chrono::Utc::now().timestamp_millis();
        let mut tile = self
            .load_tile(world.id, tile_y, tile_x)
            .ok()
            .flatten()
            .unwrap_or_else(|| CachedTile {
                content: " ".repeat(TILE_AREA as usize),
                properties: json!({}),
                writability: None,
                created_at: now,
            });

        let mut chars: Vec<char> = tile.content.chars().collect();
        if chars.len() < TILE_AREA as usize {
            chars.resize(TILE_AREA as usize, ' ');
        }

        let mut props = if tile.properties.is_object() {
            tile.properties.clone()
        } else {
            json!({})
        };
        let props_obj = props.as_object_mut().unwrap();
        let tile_writability = tile.writability.unwrap_or(world.writability);
        let mut cleared_cells: Vec<(i32, i32)> = Vec::new();
        let mut cleared_indices: Vec<usize> = Vec::new();

        {
            let colors = props_obj
                .entry("color")
                .or_insert_with(|| json!(vec![0i32; TILE_AREA as usize]));
            if let Some(arr) = colors.as_array_mut() {
                while arr.len() < TILE_AREA as usize {
                    arr.push(json!(0));
                }
            }
            let bg = props_obj
                .entry("bgcolor")
                .or_insert_with(|| json!(vec![-1i32; TILE_AREA as usize]));
            if bg.is_null() {
                *bg = json!(vec![-1i32; TILE_AREA as usize]);
            }
            if let Some(arr) = bg.as_array_mut() {
                while arr.len() < TILE_AREA as usize {
                    arr.push(json!(-1));
                }
            }
        }

        for y in 0..char_height {
            let cy = y + char_y;
            if cy >= TILE_ROWS {
                break;
            }
            for x in 0..char_width {
                let cx = x + char_x;
                if cx >= TILE_COLS {
                    break;
                }
                let idx = (cy * TILE_COLS + cx) as usize;
                if tile_writability == 2 && !is_owner {
                    continue;
                }
                chars[idx] = ' ';
                cleared_indices.push(idx);
                cleared_cells.push((cy, cx));
            }
        }

        if let Some(arr) = props_obj
            .get_mut("color")
            .and_then(|v| v.as_array_mut())
        {
            for idx in &cleared_indices {
                arr[*idx] = json!(0);
            }
        }
        if let Some(arr) = props_obj
            .get_mut("bgcolor")
            .and_then(|v| v.as_array_mut())
        {
            for idx in &cleared_indices {
                arr[*idx] = json!(-1);
            }
            if arr.iter().all(|v| v.as_i64() == Some(-1)) {
                props_obj.remove("bgcolor");
            }
        }

        if let Some(cell_props) = props_obj.get_mut("cell_props").and_then(|v| v.as_object_mut()) {
            for (cy, cx) in cleared_cells {
                if let Some(row) = cell_props.get_mut(&cy.to_string()).and_then(|v| v.as_object_mut()) {
                    row.remove(&cx.to_string());
                    if row.is_empty() {
                        cell_props.remove(&cy.to_string());
                    }
                }
            }
        }

        tile.content = chars.into_iter().collect();
        tile.properties = props;

        self.tiles.insert((world.id, tile_y, tile_x), tile.clone());
        self.dirty.insert((world.id, tile_y, tile_x), ());

        let mut updated = Map::new();
        let mut out_props = tile.properties.clone();
        if let Some(w) = tile.writability {
            out_props["writability"] = json!(w);
        }
        updated.insert(
            format!("{tile_y},{tile_x}"),
            json!({
                "content": tile.content,
                "properties": out_props
            }),
        );
        Some(updated)
    }

    pub fn protect_tile(
        &self,
        world: &WorldInfo,
        perms: &WorldPermissions,
        user: &UserInfo,
        mem_key: Option<&str>,
        msg: &Value,
    ) -> Option<Map<String, Value>> {
        let (can_owner, can_member) =
            crate::world::effective_area_perms(world, perms, user, mem_key);
        if !can_owner && !can_member {
            return None;
        }

        let data = msg.get("data").and_then(|v| v.as_object())?;
        let action = msg.get("action").and_then(|v| v.as_str()).unwrap_or("protect");
        let tile_x = json_num(data.get("tileX").unwrap_or(&Value::Null));
        let tile_y = json_num(data.get("tileY").unwrap_or(&Value::Null));
        let mut char_x = json_num(data.get("charX").unwrap_or(&Value::Null));
        let mut char_y = json_num(data.get("charY").unwrap_or(&Value::Null));
        let mut char_width = json_num(data.get("charWidth").unwrap_or(&Value::Null));
        let mut char_height = json_num(data.get("charHeight").unwrap_or(&Value::Null));
        let precise = data.get("precise").and_then(|v| v.as_bool()).unwrap_or(false);
        let protect_type_str = data.get("type").and_then(|v| v.as_str());

        let protect_type: Option<i32> = if action == "unprotect" {
            None
        } else {
            match protect_type_str {
                Some("owner-only") => Some(2),
                Some("member-only") => Some(1),
                Some("public") => Some(0),
                _ => return None,
            }
        };

        let char_idx = char_y * TILE_COLS + char_x;
        char_x = char_idx % TILE_COLS;
        char_y = char_idx / TILE_COLS;
        if char_idx < 0 || char_idx >= TILE_AREA {
            return None;
        }

        if char_width <= 0 {
            char_width = 1;
        }
        if char_height <= 0 {
            char_height = 1;
        }
        if char_width > TILE_COLS {
            char_width = TILE_COLS;
        }
        if char_height > TILE_ROWS {
            char_height = TILE_ROWS;
        }

        let now = chrono::Utc::now().timestamp_millis();
        let mut tile = self
            .load_tile(world.id, tile_y, tile_x)
            .ok()
            .flatten()
            .unwrap_or_else(|| CachedTile {
                content: " ".repeat(TILE_AREA as usize),
                properties: json!({}),
                writability: None,
                created_at: now,
            });

        let tile_writability = tile.writability.unwrap_or(world.writability);
        let mut prop_char = load_prop_char(&tile);
        let mut has_modified = false;

        if precise {
            if protect_type.is_none() {
                let idx = (char_y * TILE_COLS + char_x) as usize;
                let char_writability = prop_char[idx].unwrap_or(tile_writability);
                let area_perm = can_owner || (can_member && char_writability < 2);
                if area_perm && can_member && tile.writability.is_some() {
                    for val in prop_char.iter_mut() {
                        if val.is_none() {
                            *val = tile.writability;
                        }
                    }
                    tile.writability = None;
                    has_modified = true;
                }
            }
            for y in 0..char_height {
                let cur_char_y = char_y + y;
                if char_y >= TILE_ROWS {
                    break;
                }
                for x in 0..char_width {
                    let cur_char_x = char_x + x;
                    if char_x >= TILE_COLS {
                        break;
                    }
                    if set_cell_protection(
                        &mut prop_char,
                        cur_char_x,
                        cur_char_y,
                        protect_type,
                        tile_writability,
                        can_owner,
                        can_member,
                    ) {
                        has_modified = true;
                    }
                }
            }
            if prop_char[0].is_some() && prop_char_is_consistent(&prop_char) {
                tile.writability = prop_char[0];
                for val in prop_char.iter_mut() {
                    *val = None;
                }
                has_modified = true;
            }
        } else {
            let mut full_protection_complete = true;
            for i in 0..TILE_AREA as usize {
                let char_writability = prop_char[i].unwrap_or(tile_writability);
                let area_perm = can_owner || (can_member && char_writability < 2);
                let applied = match protect_type {
                    Some(2) => area_perm && can_owner,
                    Some(1) => area_perm && can_member,
                    Some(0) => area_perm && can_member,
                    None => area_perm && can_member,
                    Some(_) => false,
                };
                if applied {
                    prop_char[i] = protect_type;
                    has_modified = true;
                } else {
                    full_protection_complete = false;
                }
            }
            if full_protection_complete {
                for val in prop_char.iter_mut() {
                    *val = None;
                }
                tile.writability = protect_type;
                has_modified = true;
            }
        }

        if !has_modified {
            return None;
        }

        store_prop_char(&mut tile, &prop_char);
        self.save_tile(world.id, tile_y, tile_x, tile);
        self.tile_update_map(world.id, tile_y, tile_x)
    }

    pub fn set_link(
        &self,
        world: &WorldInfo,
        perms: &WorldPermissions,
        user: &UserInfo,
        mem_key: Option<&str>,
        msg: &Value,
    ) -> Option<Map<String, Value>> {
        let link_type = msg.get("type").and_then(|v| v.as_str())?;
        if link_type != "url" && link_type != "coord" {
            return None;
        }
        if !crate::world::can_set_link(world, perms, user, mem_key, link_type) {
            return None;
        }

        let data = msg.get("data").and_then(|v| v.as_object())?;
        let tile_x = json_num(data.get("tileX").unwrap_or(&Value::Null));
        let tile_y = json_num(data.get("tileY").unwrap_or(&Value::Null));
        let mut char_x = json_num(data.get("charX").unwrap_or(&Value::Null));
        let mut char_y = json_num(data.get("charY").unwrap_or(&Value::Null));

        let char_idx = char_y * TILE_COLS + char_x;
        char_x = char_idx % TILE_COLS;
        char_y = char_idx / TILE_COLS;
        if char_idx < 0 || char_idx >= TILE_AREA {
            return None;
        }

        let (is_owner, is_member) =
            crate::world::effective_clear_perms(world, perms, user, mem_key);

        let now = chrono::Utc::now().timestamp_millis();
        let mut tile = self
            .load_tile(world.id, tile_y, tile_x)
            .ok()
            .flatten()
            .unwrap_or_else(|| CachedTile {
                content: " ".repeat(TILE_AREA as usize),
                properties: json!({}),
                writability: None,
                created_at: now,
            });

        let prop_char = load_prop_char(&tile);
        let idx = (char_y * TILE_COLS + char_x) as usize;
        let char_writability = prop_char[idx]
            .unwrap_or(tile.writability.unwrap_or(world.writability));
        if char_writability == 2 && !is_owner {
            return None;
        }
        if char_writability == 1 && !is_member {
            return None;
        }

        if !tile.properties.is_object() {
            tile.properties = json!({});
        }

        let (mut url_cells, mut url_bytes) = {
            let props_obj = tile.properties.as_object().unwrap();
            let cell_props = props_obj.get("cell_props").and_then(|v| v.as_object());
            let mut cells = 0;
            let mut bytes = 0;
            if let Some(cp) = cell_props {
                (cells, bytes) = count_url_stats(cp);
                if let Some(existing) = cp
                    .get(&char_y.to_string())
                    .and_then(|row| row.get(&char_x.to_string()))
                    .and_then(|cell| cell.get("link"))
                    .and_then(|v| v.as_object())
                {
                    if existing.get("type").and_then(|v| v.as_str()) == Some("url") {
                        cells -= 1;
                        if let Some(old_url) = existing.get("url").and_then(|v| v.as_str()) {
                            bytes -= old_url.len() as i32;
                        }
                    }
                }
            }
            (cells, bytes)
        };

        let props_obj = tile.properties.as_object_mut().unwrap();
        let cell_props = props_obj
            .entry("cell_props")
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .unwrap();
        let row = cell_props
            .entry(char_y.to_string())
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .unwrap();
        let cell = row
            .entry(char_x.to_string())
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .unwrap();

        if link_type == "url" {
            let mut url = data
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let byte_len = url.len() as i32;
            let byte_max = 65536;
            let max_bytes_guarantee = 100;
            let link_bytes_max = 10000;
            let mut new_byte_len = byte_len.min(link_bytes_max);
            url_cells += 1;
            let remaining_cells = TILE_AREA - url_cells;
            let peek = (byte_max - url_bytes - new_byte_len) / remaining_cells.max(1);
            if peek < max_bytes_guarantee {
                let remaining_bytes =
                    byte_max - url_bytes - (max_bytes_guarantee * remaining_cells);
                if remaining_bytes < new_byte_len {
                    new_byte_len = remaining_bytes;
                }
                if new_byte_len < max_bytes_guarantee {
                    new_byte_len = max_bytes_guarantee;
                }
            }
            if new_byte_len < byte_len {
                url.truncate(new_byte_len as usize);
            }
            cell.insert("link".to_string(), json!({"type": "url", "url": url}));
        } else {
            let link_tile_x = json_f64(data.get("link_tileX").unwrap_or(&Value::Null));
            let link_tile_y = json_f64(data.get("link_tileY").unwrap_or(&Value::Null));
            let relative = data
                .get("relative")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            cell.insert(
                "link".to_string(),
                json!({
                    "type": "coord",
                    "link_tileX": link_tile_x,
                    "link_tileY": link_tile_y,
                    "relative": relative
                }),
            );
        }

        self.save_tile(world.id, tile_y, tile_x, tile);
        self.tile_update_map(world.id, tile_y, tile_x)
    }

    fn save_tile(&self, world_id: i64, tile_y: i32, tile_x: i32, tile: CachedTile) {
        self.tiles.insert((world_id, tile_y, tile_x), tile.clone());
        self.dirty.insert((world_id, tile_y, tile_x), ());
        if let Some(redis) = &self.redis_cache {
            redis.set(world_id, tile_y, tile_x, &tile_payload_from(&tile));
        }
    }

    fn tile_update_map(
        &self,
        world_id: i64,
        tile_y: i32,
        tile_x: i32,
    ) -> Option<Map<String, Value>> {
        let tile = self.tiles.get(&(world_id, tile_y, tile_x))?;
        let mut updated = Map::new();
        let mut out_props = tile.properties.clone();
        if let Some(w) = tile.writability {
            out_props["writability"] = json!(w);
        }
        updated.insert(
            format!("{tile_y},{tile_x}"),
            json!({
                "content": tile.content,
                "properties": out_props
            }),
        );
        Some(updated)
    }

    fn can_write_cell(
        &self,
        world: &WorldInfo,
        perms: &WorldPermissions,
        user: &UserInfo,
        _tile_x: i32,
        _tile_y: i32,
        _char_x: i32,
        _char_y: i32,
    ) -> bool {
        if user.superuser {
            return true;
        }
        match world.writability {
            2 => perms.owner,
            1 => perms.member,
            _ => true,
        }
    }

    fn write_cell(
        &self,
        world_id: i64,
        tile_y: i32,
        tile_x: i32,
        char_y: i32,
        char_x: i32,
        ch: char,
        color: i32,
        bg_color: i32,
        now: i64,
    ) -> anyhow::Result<Value> {
        let idx = (char_y * TILE_COLS + char_x) as usize;
        let mut tile = self
            .load_tile(world_id, tile_y, tile_x)?
            .unwrap_or_else(|| CachedTile {
                content: " ".repeat(TILE_AREA as usize),
                properties: json!({}),
                writability: None,
                created_at: now,
            });

        let mut chars: Vec<char> = tile.content.chars().collect();
        if chars.len() < TILE_AREA as usize {
            chars.resize(TILE_AREA as usize, ' ');
        }
        chars[idx] = if ch == '\0' { ' ' } else { ch };
        tile.content = chars.into_iter().collect();

        let mut props = if tile.properties.is_object() {
            tile.properties.clone()
        } else {
            json!({})
        };
        let props_obj = props.as_object_mut().unwrap();
        let colors = props_obj
            .entry("color")
            .or_insert_with(|| json!(vec![0i32; TILE_AREA as usize]));
        if let Some(arr) = colors.as_array_mut() {
            while arr.len() < TILE_AREA as usize {
                arr.push(json!(0));
            }
            arr[idx] = json!(color.max(0).min(16777215));
        }
        if bg_color >= 0 {
            let bg = props_obj
                .entry("bgcolor")
                .or_insert_with(|| json!(vec![-1i32; TILE_AREA as usize]));
            if let Some(arr) = bg.as_array_mut() {
                while arr.len() < TILE_AREA as usize {
                    arr.push(json!(-1));
                }
                arr[idx] = json!(bg_color.max(0).min(16777215));
            }
        }
        tile.properties = props;

        self.tiles.insert((world_id, tile_y, tile_x), tile.clone());
        self.dirty.insert((world_id, tile_y, tile_x), ());

        let mut out_props = tile.properties.clone();
        if let Some(w) = tile.writability {
            out_props["writability"] = json!(w);
        }
        Ok(json!({
            "content": tile.content,
            "properties": out_props
        }))
    }

    pub fn apply_remote_updates(&self, world_id: i64, tiles: &Map<String, Value>) {
        let now = chrono::Utc::now().timestamp_millis();
        for (key, tile_val) in tiles {
            let Some(obj) = tile_val.as_object() else {
                continue;
            };
            let mut parts = key.split(',');
            let Some(ty) = parts.next().and_then(|s| s.parse().ok()) else {
                continue;
            };
            let Some(tx) = parts.next().and_then(|s| s.parse().ok()) else {
                continue;
            };
            let content = obj
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut properties = obj
                .get("properties")
                .cloned()
                .unwrap_or(json!({}));
            let writability = properties
                .get("writability")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32);
            if properties.is_object() {
                if let Some(props) = properties.as_object_mut() {
                    props.remove("writability");
                }
            }
            let cached = CachedTile {
                content,
                properties,
                writability,
                created_at: now,
            };
            self.tiles.insert((world_id, ty, tx), cached.clone());
            if let Some(redis) = &self.redis_cache {
                redis.set(world_id, ty, tx, &tile_payload_from(&cached));
            }
        }
    }
}

fn collect_dirty_batch(
    tiles: &DashMap<(i64, i32, i32), CachedTile>,
    dirty: &DashMap<(i64, i32, i32), ()>,
) -> Vec<(i64, i32, i32, CachedTile)> {
    let keys: Vec<(i64, i32, i32)> = dirty.iter().map(|entry| *entry.key()).collect();
    let mut batch = Vec::with_capacity(keys.len());
    for key in keys {
        let Some(tile) = tiles.get(&key).map(|entry| entry.clone()) else {
            dirty.remove(&key);
            continue;
        };
        dirty.remove(&key);
        batch.push((key.0, key.1, key.2, tile));
    }
    batch
}

#[derive(Clone, Copy, Debug)]
pub struct FetchRect {
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
}

pub fn parse_fetch_rectangles(msg: &Value) -> Result<Vec<FetchRect>, String> {
    let Some(rects) = msg.get("fetchRectangles").and_then(|v| v.as_array()) else {
        return Err("Invalid parameters".into());
    };
    if rects.len() > 50 {
        return Err("Too many tiles".into());
    }
    let mut out = Vec::new();
    let mut total_area = 0i64;
    for rect in rects.iter().take(50) {
        let Some(obj) = rect.as_object() else {
            return Err("Invalid parameters".into());
        };
        let mut min_x = json_num(obj.get("minX").unwrap_or(&Value::Null));
        let mut min_y = json_num(obj.get("minY").unwrap_or(&Value::Null));
        let mut max_x = json_num(obj.get("maxX").unwrap_or(&Value::Null));
        let mut max_y = json_num(obj.get("maxY").unwrap_or(&Value::Null));
        if min_x > max_x {
            std::mem::swap(&mut min_x, &mut max_x);
        }
        if min_y > max_y {
            std::mem::swap(&mut min_y, &mut max_y);
        }
        let area = (max_x - min_x + 1) as i64 * (max_y - min_y + 1) as i64;
        if area > 50 * 50 {
            return Err("Too many tiles".into());
        }
        total_area += area;
        if total_area > 5000 {
            return Err("Too many tiles".into());
        }
        out.push(FetchRect {
            min_x,
            min_y,
            max_x,
            max_y,
        });
    }
    Ok(out)
}

fn json_num(v: &Value) -> i32 {
    v.as_i64()
        .or_else(|| v.as_f64().map(|f| f as i64))
        .unwrap_or(0) as i32
}

fn json_f64(v: &Value) -> f64 {
    v.as_f64()
        .or_else(|| v.as_i64().map(|n| n as f64))
        .unwrap_or(0.0)
}

fn load_prop_char(tile: &CachedTile) -> Vec<Option<i32>> {
    if let Some(raw) = tile
        .properties
        .get("char")
        .and_then(|v| v.as_str())
    {
        decode_char_prot(raw)
    } else {
        vec![None; TILE_AREA as usize]
    }
}

fn store_prop_char(tile: &mut CachedTile, prop_char: &[Option<i32>]) {
    if !tile.properties.is_object() {
        tile.properties = json!({});
    }
    let props_obj = tile.properties.as_object_mut().unwrap();
    if prop_char_all_null(prop_char) {
        props_obj.remove("char");
    } else {
        props_obj.insert(
            "char".to_string(),
            json!(encode_char_prot(prop_char)),
        );
    }
}

fn set_cell_protection(
    prop_char: &mut [Option<i32>],
    char_x: i32,
    char_y: i32,
    protect_type: Option<i32>,
    default_writability: i32,
    can_owner: bool,
    can_member: bool,
) -> bool {
    let idx = (char_y * TILE_COLS + char_x) as usize;
    if idx >= prop_char.len() {
        return false;
    }
    let char_writability = prop_char[idx].unwrap_or(default_writability);
    let area_perm = can_owner || (can_member && char_writability < 2);
    let applied = match protect_type {
        Some(2) => area_perm && can_owner,
        Some(1) => area_perm && can_member,
        Some(0) => area_perm && can_member,
        None => area_perm && can_member,
        Some(_) => false,
    };
    if applied {
        prop_char[idx] = protect_type;
        true
    } else {
        false
    }
}

fn count_url_stats(cell_props: &serde_json::Map<String, Value>) -> (i32, i32) {
    let mut url_cells = 0;
    let mut url_bytes = 0;
    for row in cell_props.values() {
        let Some(row_obj) = row.as_object() else {
            continue;
        };
        for cell in row_obj.values() {
            let Some(link) = cell.get("link").and_then(|v| v.as_object()) else {
                continue;
            };
            if link.get("type").and_then(|v| v.as_str()) == Some("url") {
                url_cells += 1;
                if let Some(url) = link.get("url").and_then(|v| v.as_str()) {
                    url_bytes += url.len() as i32;
                }
            }
        }
    }
    (url_cells, url_bytes)
}
