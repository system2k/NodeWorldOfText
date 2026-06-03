use crate::db::DbPool;
use anyhow::Context;
use serde_json::Value;

#[derive(Clone, Debug, Default)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub level: i32,
    pub authenticated: bool,
    pub superuser: bool,
    pub staff: bool,
    pub operator: bool,
}

pub fn parse_cookies(header: Option<&str>) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    let Some(raw) = header else {
        return out;
    };
    for part in raw.split(';') {
        let part = part.trim();
        if let Some((k, v)) = part.split_once('=') {
            out.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    out
}

pub fn load_user(db: &DbPool, cookies: &std::collections::HashMap<String, String>) -> anyhow::Result<UserInfo> {
    let mut user = UserInfo::default();
    let Some(session_key) = cookies.get("sessionid") else {
        return Ok(user);
    };
    let conn = db.get()?;
    let mut stmt = conn.prepare(
        "SELECT session_data, expire_date FROM auth_session WHERE session_key = ?1",
    )?;
    let row = stmt.query_row([session_key], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    });
    let Ok((session_data, expire_date)) = row else {
        return Ok(user);
    };
    if expire_date <= chrono::Utc::now().timestamp_millis() {
        return Ok(user);
    }
    let data: Value = serde_json::from_str(&session_data).context("parse session json")?;
    if data.get("type").and_then(|v| v.as_str()) != Some("sessionid_auth") {
        return Ok(user);
    }
    let id = data.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
    if id <= 0 {
        return Ok(user);
    }
    let mut ustmt = conn.prepare("SELECT username, level, is_active FROM auth_user WHERE id = ?1")?;
    let (username, level, is_active): (String, i32, i64) =
        ustmt.query_row([id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
    if is_active == 0 {
        return Ok(user);
    }
    user.id = id;
    user.username = username;
    user.level = level;
    user.authenticated = true;
    user.operator = level == 3;
    user.superuser = level == 2 || level == 3;
    user.staff = level >= 1;
    Ok(user)
}
