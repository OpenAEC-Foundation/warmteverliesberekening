//! Building/project model for ISSO 51 heat loss calculations.
//!
//! The project is the top-level container holding all information needed
//! for a complete heat loss calculation of a dwelling.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::climate::DesignConditions;
use super::enums::{BuildingType, SecurityClass};
use super::room::Room;
use super::ventilation::VentilationConfig;

/// Top-level project containing all input data for the calculation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Project {
    /// Project metadata.
    pub info: ProjectInfo,

    /// Building characteristics.
    pub building: Building,

    /// Climate/design conditions.
    pub climate: DesignConditions,

    /// Ventilation system configuration.
    pub ventilation: VentilationConfig,

    /// All rooms in the dwelling.
    pub rooms: Vec<Room>,
}

/// Project metadata.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectInfo {
    /// Project name.
    pub name: String,

    /// Project number/reference.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_number: Option<String>,

    /// Address of the building.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,

    /// Client name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client: Option<String>,

    /// Calculation date (ISO 8601).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,

    /// Engineer performing the calculation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engineer: Option<String>,

    /// Additional notes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// Building characteristics that affect the calculation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Building {
    /// Type of building.
    pub building_type: BuildingType,

    /// Air tightness: q_v,10 value in dm³/s.
    /// Measured air volume flow at 10 Pa pressure difference.
    pub qv10: f64,

    /// Total usable floor area (gebruiksoppervlak) A_g in m².
    pub total_floor_area: f64,

    /// Security class for heat loss to neighbors.
    pub security_class: SecurityClass,

    /// Whether night setback / operational reduction is used.
    #[serde(default)]
    pub has_night_setback: bool,

    /// Desired warm-up time in hours (typically 1 or 2).
    #[serde(default = "default_warmup_time")]
    pub warmup_time: f64,

    /// Building height in m (buitenafmetingen).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub building_height: Option<f64>,

    /// Number of floors above ground.
    #[serde(default = "default_floors")]
    pub num_floors: u32,
}

fn default_warmup_time() -> f64 {
    2.0
}

fn default_floors() -> u32 {
    1
}
