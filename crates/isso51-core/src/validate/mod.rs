//! Input validation for ISSO 51 calculations.

use crate::error::{Isso51Error, Result};
use crate::model::building::Project;

/// Validate a complete project input.
/// Returns Ok(()) if valid, or an error describing what's wrong.
pub fn validate_project(project: &Project) -> Result<()> {
    if project.rooms.is_empty() {
        return Err(Isso51Error::InvalidInput(
            "project must have at least one room".to_string(),
        ));
    }

    for room in &project.rooms {
        if room.floor_area <= 0.0 {
            return Err(Isso51Error::InvalidInput(format!(
                "room '{}' has invalid floor area: {}",
                room.name, room.floor_area
            )));
        }

        if room.height <= 0.0 {
            return Err(Isso51Error::InvalidInput(format!(
                "room '{}' has invalid height: {}",
                room.name, room.height
            )));
        }

        for element in &room.constructions {
            if element.area <= 0.0 {
                return Err(Isso51Error::InvalidInput(format!(
                    "room '{}', element '{}' has invalid area: {}",
                    room.name, element.description, element.area
                )));
            }

            if element.u_value < 0.0 {
                return Err(Isso51Error::InvalidInput(format!(
                    "room '{}', element '{}' has negative U-value: {}",
                    room.name, element.description, element.u_value
                )));
            }
        }
    }

    if project.building.qv10 < 0.0 {
        return Err(Isso51Error::InvalidInput(format!(
            "qv10 must be non-negative, got {}",
            project.building.qv10
        )));
    }

    if project.building.total_floor_area <= 0.0 {
        return Err(Isso51Error::InvalidInput(format!(
            "total floor area must be positive, got {}",
            project.building.total_floor_area
        )));
    }

    Ok(())
}
