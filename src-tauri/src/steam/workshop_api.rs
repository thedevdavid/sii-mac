//! Steam Workshop metadata via the public `GetPublishedFileDetails` endpoint.
//!
//! Requires no API key. Rate-limited to 100k calls/day globally, so the cache
//! layer (`workshop_cache.rs`) is responsible for keeping repeat requests off
//! the wire. The parser is factored as a pure function so fixture-based tests
//! don't need an HTTP mock.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;

const ENDPOINT: &str = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const BATCH_SIZE: usize = 100;
const REQUEST_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkshopMetadata {
    pub workshop_id: String,
    pub title: String,
    pub description: String,
    pub preview_url: Option<String>,
    pub tags: Vec<String>,
    pub file_size: Option<u64>,
    pub subscribers: Option<u64>,
    pub time_updated: Option<u64>,
    pub votes_up: Option<u64>,
    pub votes_down: Option<u64>,
}

/// Fetch metadata for a batch of workshop IDs from Steam. Splits large lists
/// into 100-item batches. IDs that don't come back with `result == 1` are
/// silently dropped (private, deleted, or invalid). Missing keys in the result
/// map signal "Steam didn't know about this id."
pub async fn fetch_published_file_details(
    ids: &[String],
) -> Result<HashMap<String, WorkshopMetadata>, AppError> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::WorkshopApiError(format!("client build: {e}")))?;

    let mut result: HashMap<String, WorkshopMetadata> = HashMap::new();

    for batch in chunk_ids(ids, BATCH_SIZE) {
        let mut form: Vec<(String, String)> = Vec::with_capacity(batch.len() + 1);
        form.push(("itemcount".to_string(), batch.len().to_string()));
        for (i, id) in batch.iter().enumerate() {
            form.push((format!("publishedfileids[{i}]"), id.clone()));
        }

        let response = client.post(ENDPOINT).form(&form).send().await?;
        if !response.status().is_success() {
            return Err(AppError::WorkshopApiError(format!(
                "HTTP {}",
                response.status()
            )));
        }

        let body: Value = response.json().await?;
        let parsed = parse_workshop_response(&body);
        for m in parsed {
            result.insert(m.workshop_id.clone(), m);
        }
    }

    Ok(result)
}

/// Split ids into chunks of `size`. Pure helper for testability.
pub(crate) fn chunk_ids(ids: &[String], size: usize) -> Vec<Vec<String>> {
    ids.chunks(size).map(|c| c.to_vec()).collect()
}

/// Parse a `GetPublishedFileDetails` response into `WorkshopMetadata` entries.
/// Entries with `result != 1` are silently skipped.
pub(crate) fn parse_workshop_response(body: &Value) -> Vec<WorkshopMetadata> {
    let details = body
        .get("response")
        .and_then(|r| r.get("publishedfiledetails"))
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default();

    details
        .into_iter()
        .filter_map(|entry| parse_single_detail(&entry))
        .collect()
}

fn parse_single_detail(entry: &Value) -> Option<WorkshopMetadata> {
    let result_code = entry.get("result")?.as_u64()?;
    if result_code != 1 {
        return None;
    }

    let workshop_id = entry.get("publishedfileid")?.as_str()?.to_string();
    let title = entry
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let description = entry
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let preview_url = entry
        .get("preview_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());

    let tags = entry
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.get("tag").and_then(|v| v.as_str()).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    // file_size can come as either a number or a string. Be defensive.
    let file_size = entry
        .get("file_size")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())));

    let subscribers = entry.get("subscriptions").and_then(|v| v.as_u64());
    let time_updated = entry.get("time_updated").and_then(|v| v.as_u64());
    let votes_up = entry
        .get("vote_data")
        .and_then(|v| v.get("votes_up"))
        .and_then(|v| v.as_u64());
    let votes_down = entry
        .get("vote_data")
        .and_then(|v| v.get("votes_down"))
        .and_then(|v| v.as_u64());

    Some(WorkshopMetadata {
        workshop_id,
        title,
        description,
        preview_url,
        tags,
        file_size,
        subscribers,
        time_updated,
        votes_up,
        votes_down,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_ids_exact_multiple() {
        let ids: Vec<String> = (0..200).map(|n| n.to_string()).collect();
        let chunks = chunk_ids(&ids, 100);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), 100);
        assert_eq!(chunks[1].len(), 100);
    }

    #[test]
    fn test_chunk_ids_remainder() {
        let ids: Vec<String> = (0..250).map(|n| n.to_string()).collect();
        let chunks = chunk_ids(&ids, 100);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 100);
        assert_eq!(chunks[1].len(), 100);
        assert_eq!(chunks[2].len(), 50);
    }

    #[test]
    fn test_chunk_ids_empty() {
        let ids: Vec<String> = vec![];
        let chunks = chunk_ids(&ids, 100);
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_parse_workshop_response_valid() {
        let body: Value = serde_json::from_str(
            r#"{
                "response": {
                    "result": 1,
                    "resultcount": 1,
                    "publishedfiledetails": [{
                        "publishedfileid": "123456789",
                        "result": 1,
                        "creator": "76561198000000000",
                        "title": "Test Mod",
                        "description": "A cool mod",
                        "preview_url": "https://example.com/preview.jpg",
                        "file_size": "1048576",
                        "subscriptions": 42,
                        "time_updated": 1700000000,
                        "tags": [{"tag": "truck"}, {"tag": "interior"}],
                        "vote_data": {"votes_up": 100, "votes_down": 5}
                    }]
                }
            }"#,
        )
        .unwrap();

        let parsed = parse_workshop_response(&body);
        assert_eq!(parsed.len(), 1);
        let m = &parsed[0];
        assert_eq!(m.workshop_id, "123456789");
        assert_eq!(m.title, "Test Mod");
        assert_eq!(m.description, "A cool mod");
        assert_eq!(m.preview_url.as_deref(), Some("https://example.com/preview.jpg"));
        assert_eq!(m.file_size, Some(1048576));
        assert_eq!(m.subscribers, Some(42));
        assert_eq!(m.time_updated, Some(1700000000));
        assert_eq!(m.tags, vec!["truck".to_string(), "interior".to_string()]);
        assert_eq!(m.votes_up, Some(100));
        assert_eq!(m.votes_down, Some(5));
    }

    #[test]
    fn test_parse_workshop_response_skips_result_not_one() {
        let body: Value = serde_json::from_str(
            r#"{
                "response": {
                    "publishedfiledetails": [
                        {"publishedfileid": "1", "result": 1, "title": "OK"},
                        {"publishedfileid": "2", "result": 9, "title": "Gone"}
                    ]
                }
            }"#,
        )
        .unwrap();
        let parsed = parse_workshop_response(&body);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].workshop_id, "1");
    }

    #[test]
    fn test_parse_workshop_response_empty() {
        let body: Value = serde_json::from_str(r#"{"response": {}}"#).unwrap();
        assert!(parse_workshop_response(&body).is_empty());
    }
}
