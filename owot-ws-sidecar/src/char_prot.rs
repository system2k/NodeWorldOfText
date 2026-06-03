use crate::config::TILE_AREA;

const BASE64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Decode the `properties.char` protection string into per-cell writability.
/// null = inherit parent, 0 = public, 1 = members, 2 = owners.
pub fn decode_char_prot(raw: &str) -> Vec<Option<i32>> {
    let mut res = vec![None; TILE_AREA as usize];
    if raw.is_empty() {
        return res;
    }
    let Some(encoding) = raw.chars().next() else {
        return res;
    };
    let body = &raw[encoding.len_utf8()..];
    let mut encoded = vec![0i32; TILE_AREA as usize];

    match encoding {
        '@' => {
            for (i, ch) in body.chars().enumerate() {
                let code = BASE64_TABLE.iter().position(|&b| b as char == ch).unwrap_or(0) as i32;
                let char1 = (code / (4 * 4)) % 4;
                let char2 = (code / 4) % 4;
                let char3 = code % 4;
                let idx = i * 3;
                if idx < TILE_AREA as usize {
                    encoded[idx] = char1;
                }
                if idx + 1 < TILE_AREA as usize {
                    encoded[idx + 1] = char2;
                }
                if idx + 2 < TILE_AREA as usize {
                    encoded[idx + 2] = char3;
                }
            }
        }
        '#' => {
            for (i, part) in body.split(',').enumerate() {
                if i >= TILE_AREA as usize {
                    break;
                }
                encoded[i] = part.parse().unwrap_or(0);
            }
        }
        'x' => {
            let chars: Vec<char> = body.chars().collect();
            for i in 0..(chars.len() / 2).min(TILE_AREA as usize) {
                let hi = chars[i * 2];
                let lo = chars[i * 2 + 1];
                let code = i32::from_str_radix(&format!("{hi}{lo}"), 16).unwrap_or(0);
                encoded[i] = code;
            }
        }
        _ => {}
    }

    for (i, val) in encoded.into_iter().enumerate() {
        res[i] = match val {
            0 => None,
            1 => Some(0),
            2 => Some(1),
            3 => Some(2),
            _ => None,
        };
    }
    res
}

/// Encode per-cell protection into the compact `@` base64 format used in SQLite.
pub fn encode_char_prot(array: &[Option<i32>]) -> String {
    let mut array_com = vec![0i32; TILE_AREA as usize];
    for (i, val) in array.iter().enumerate().take(TILE_AREA as usize) {
        array_com[i] = match val {
            None => 0,
            Some(0) => 1,
            Some(1) => 2,
            Some(2) => 3,
            Some(_) => 0,
        };
    }
    let bytes = (TILE_AREA as usize).div_ceil(3);
    let mut out = String::from("@");
    for i in 0..bytes {
        let idx = i * 3;
        let char1 = (4 * 4) * array_com[idx];
        let mut char2 = 4 * array_com.get(idx + 1).copied().unwrap_or(0);
        let mut char3 = array_com.get(idx + 2).copied().unwrap_or(0);
        if idx + 1 > TILE_AREA as usize - 1 {
            char2 = 0;
        }
        if idx + 2 > TILE_AREA as usize - 1 {
            char3 = 0;
        }
        let code = (char1 + char2 + char3) as usize;
        out.push(BASE64_TABLE[code.min(63)] as char);
    }
    out
}

pub fn prop_char_all_null(array: &[Option<i32>]) -> bool {
    array.iter().all(|v| v.is_none())
}

pub fn prop_char_is_consistent(array: &[Option<i32>]) -> bool {
    let Some(first) = array.first().copied().flatten() else {
        return false;
    };
    array.iter().all(|v| *v == Some(first))
}
