//! Application state shared across handlers.

use sqlx::SqlitePool;

use crate::auth::JwksCache;

/// Shared application state injected into handlers via Axum's `State` extractor.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub jwks: Option<JwksCache>,
    pub http_client: reqwest::Client,
    pub reports_api_url: Option<String>,
    pub reports_api_key: Option<String>,
}

impl AppState {
    pub fn new(
        db: SqlitePool,
        jwks: Option<JwksCache>,
        reports_api_url: Option<String>,
        reports_api_key: Option<String>,
    ) -> Self {
        Self {
            db,
            jwks,
            http_client: reqwest::Client::new(),
            reports_api_url,
            reports_api_key,
        }
    }
}

impl AsRef<Option<JwksCache>> for AppState {
    fn as_ref(&self) -> &Option<JwksCache> {
        &self.jwks
    }
}
