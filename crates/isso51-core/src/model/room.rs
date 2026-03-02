//! Room model for ISSO 51 heat loss calculations.
//!
//! A room (vertrek) is the basic unit of calculation. Each room has
//! construction elements forming its boundaries, and ventilation properties.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::construction::ConstructionElement;
use super::enums::{HeatingSystem, RoomFunction};

/// A single room (vertrek) in the dwelling.
/// ISSO 51 Chapter 4 — per-room heat loss calculation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Room {
    /// Unique identifier for this room.
    pub id: String,

    /// Human-readable name (e.g., "Woonkamer", "Slaapkamer 1").
    pub name: String,

    /// Room function determines the design indoor temperature.
    pub function: RoomFunction,

    /// Custom design indoor temperature θ_i in °C.
    /// If set, overrides the temperature from RoomFunction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_temperature: Option<f64>,

    /// Floor area (gebruiksoppervlak) in m².
    /// Used for ventilation rate calculations.
    pub floor_area: f64,

    /// Room height in m.
    #[serde(default = "default_room_height")]
    pub height: f64,

    /// Construction elements forming the room boundaries.
    pub constructions: Vec<ConstructionElement>,

    /// Heating system installed in this room.
    pub heating_system: HeatingSystem,

    /// Ventilation volume flow rate q_v in dm³/s.
    /// From ventilation requirements (ISSO 51 Table 2.9/2.10).
    pub ventilation_rate: f64,

    /// Whether this room has mechanical exhaust.
    /// Affects ventilation loss calculation (formule 4.7).
    #[serde(default)]
    pub has_mechanical_exhaust: bool,

    /// Whether this room has mechanical supply.
    #[serde(default)]
    pub has_mechanical_supply: bool,

    /// Fraction of ventilation air coming directly from outside (factor a).
    /// For rooms with both outside and internal air supply.
    /// ISSO 51 formule 4.7: H_v = 1.2 × ((a × q_v × f_v1) + (1-a) × q_v × f_v2)
    #[serde(default = "default_one")]
    pub fraction_outside_air: f64,

    /// Temperature of the supply air θ_t in °C.
    /// For natural supply: θ_t = θ_e (design outdoor temperature).
    /// For mechanical supply with heat recovery: depends on system.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supply_air_temperature: Option<f64>,

    /// Temperature of the internal air source θ_a in °C.
    /// For rooms receiving air from a hallway or other internal space.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub internal_air_temperature: Option<f64>,

    /// Whether this room is part of a heated zone that should not
    /// have negative heat loss (i.e., minimum Φ = 0).
    #[serde(default = "default_true")]
    pub clamp_positive: bool,
}

impl Room {
    /// Returns the design indoor temperature θ_i in °C.
    /// Uses custom_temperature if set, otherwise derives from room function.
    pub fn design_temperature(&self) -> f64 {
        self.custom_temperature
            .unwrap_or_else(|| self.function.design_temperature())
    }
}

fn default_room_height() -> f64 {
    2.6
}

fn default_one() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_design_temperature_from_function() {
        let room = Room {
            id: "r1".to_string(),
            name: "Woonkamer".to_string(),
            function: RoomFunction::LivingRoom,
            custom_temperature: None,
            floor_area: 28.2,
            height: 2.6,
            constructions: vec![],
            heating_system: HeatingSystem::RadiatorLt,
            ventilation_rate: 25.38,
            has_mechanical_exhaust: false,
            has_mechanical_supply: false,
            fraction_outside_air: 1.0,
            supply_air_temperature: None,
            internal_air_temperature: None,
            clamp_positive: true,
        };
        assert_eq!(room.design_temperature(), 20.0);
    }

    #[test]
    fn test_design_temperature_custom() {
        let room = Room {
            id: "r1".to_string(),
            name: "Custom".to_string(),
            function: RoomFunction::Custom,
            custom_temperature: Some(18.0),
            floor_area: 10.0,
            height: 2.6,
            constructions: vec![],
            heating_system: HeatingSystem::RadiatorLt,
            ventilation_rate: 0.0,
            has_mechanical_exhaust: false,
            has_mechanical_supply: false,
            fraction_outside_air: 1.0,
            supply_air_temperature: None,
            internal_air_temperature: None,
            clamp_positive: true,
        };
        assert_eq!(room.design_temperature(), 18.0);
    }
}
