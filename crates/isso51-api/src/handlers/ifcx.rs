//! IFCX calculation handler (public, no auth required).

use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::error;

/// Query parameters for the IFCX calculate endpoint.
#[derive(Debug, Deserialize)]
pub struct IfcxQueryParams {
    /// If true, compose input + result into a single IFCX document.
    #[serde(default)]
    pub compose: bool,
}

/// POST /calculate/ifcx — Run heat loss calculation on an IFCX document.
///
/// Accepts an IFCX JSON body with isso51:: namespace attributes,
/// runs the calculation, and returns an IFCX overlay with results.
/// Pass `?compose=true` to get a merged document with both input and output.
pub async fn calculate_ifcx_handler(
    Query(params): Query<IfcxQueryParams>,
    body: String,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let doc: isso51_ifcx::IfcxDocument = serde_json::from_str(&body)
            .map_err(|e| isso51_ifcx::IfcxError::Json(e))?;

        let result_doc = isso51_ifcx::calculate_ifcx(&doc)?;

        if params.compose {
            let composed = isso51_ifcx::compose(&[&doc, &result_doc]);
            // Wrap composed entries in a document structure.
            let mut merged_doc = doc;
            merged_doc.data = composed;
            serde_json::to_string(&merged_doc)
                .map_err(|e| isso51_ifcx::IfcxError::Json(e))
        } else {
            serde_json::to_string(&result_doc)
                .map_err(|e| isso51_ifcx::IfcxError::Json(e))
        }
    })
    .await;

    match result {
        Ok(Ok(json)) => (
            StatusCode::OK,
            [("content-type", "application/json")],
            json,
        )
            .into_response(),
        Ok(Err(ifcx_err)) => error::into_ifcx_response(ifcx_err),
        Err(join_err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": "internal_error",
                "detail": join_err.to_string()
            })),
        )
            .into_response(),
    }
}
