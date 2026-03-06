//! Report generation proxy handler.
//!
//! Forwards report JSON to the OpenAEC Reports API, adding the API key
//! server-side so it is never exposed to the frontend.

use std::time::Duration;

use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};

use crate::error::ApiError;
use crate::state::AppState;

/// POST /report/generate — proxy report generation to OpenAEC Reports API.
///
/// Accepts the raw BM Reports JSON body, forwards it to the upstream API
/// with the configured API key, and streams the resulting PDF back to the client.
pub async fn generate_report(
    State(state): State<AppState>,
    body: String,
) -> Result<Response, ApiError> {
    let base_url = state.reports_api_url.as_deref().ok_or_else(|| {
        ApiError::ServiceUnavailable(
            "Rapportgeneratie is niet geconfigureerd (REPORTS_API_URL ontbreekt)".to_string(),
        )
    })?;

    let api_key = state.reports_api_key.as_deref().ok_or_else(|| {
        ApiError::ServiceUnavailable(
            "Rapportgeneratie is niet geconfigureerd (REPORTS_API_KEY ontbreekt)".to_string(),
        )
    })?;

    let url = format!("{}/api/generate/v2", base_url.trim_end_matches('/'));

    let upstream = state
        .http_client
        .post(&url)
        .header("X-API-Key", api_key)
        .header(header::CONTENT_TYPE.as_str(), "application/json")
        .timeout(Duration::from_secs(30))
        .body(body)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Reports API request failed: {e}");
            ApiError::ReportService(format!("Rapport service niet bereikbaar: {e}"))
        })?;

    if !upstream.status().is_success() {
        let status = upstream.status();
        let detail = upstream.text().await.unwrap_or_default();
        tracing::error!("Reports API returned {status}: {detail}");
        return Err(ApiError::ReportService(format!(
            "Rapport generatie mislukt ({status}): {detail}"
        )));
    }

    let pdf_bytes = upstream.bytes().await.map_err(|e| {
        tracing::error!("Failed to read report PDF: {e}");
        ApiError::ReportService("Fout bij ophalen van rapport PDF".to_string())
    })?;

    Ok((
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"rapport.pdf\"",
            ),
        ],
        pdf_bytes,
    )
        .into_response())
}
