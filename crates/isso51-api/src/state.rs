//! Application state shared across handlers.

use sqlx::SqlitePool;

use crate::auth::JwksCache;

/// Default path to the `ifc-tool` executable inside the Docker container.
const DEFAULT_IFC_TOOL_PATH: &str = "/opt/ifc-tool-venv/bin/ifc-tool";

/// Shared application state injected into handlers via Axum's `State` extractor.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub jwks: Option<JwksCache>,
    pub http_client: reqwest::Client,
    pub reports_api_url: Option<String>,
    pub reports_api_key: Option<String>,
    /// Path to the `ifc-tool` CLI for server-side IFC import.
    pub ifc_tool_path: String,
}

impl AppState {
    pub fn new(
        db: SqlitePool,
        jwks: Option<JwksCache>,
        reports_api_url: Option<String>,
        reports_api_key: Option<String>,
        ifc_tool_path: Option<String>,
    ) -> Self {
        Self {
            db,
            jwks,
            http_client: reqwest::Client::new(),
            reports_api_url,
            reports_api_key,
            ifc_tool_path: ifc_tool_path
                .unwrap_or_else(|| DEFAULT_IFC_TOOL_PATH.to_string()),
        }
    }
}

impl AsRef<Option<JwksCache>> for AppState {
    fn as_ref(&self) -> &Option<JwksCache> {
        &self.jwks
    }
}
