//! Ventilation system configuration for ISSO 51.
//!
//! Defines the building-level ventilation system parameters
//! used in the ventilation heat loss calculation (§2.5.7).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::enums::{FrostProtectionType, VentilationSystemType};

/// Building-level ventilation system configuration.
/// ISSO 51 §2.5.7.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct VentilationConfig {
    /// Type of ventilation system (A through E).
    pub system_type: VentilationSystemType,

    /// Whether heat recovery (WTW) is installed.
    #[serde(default)]
    pub has_heat_recovery: bool,

    /// Heat recovery efficiency (0.0 to 1.0).
    /// E.g., 0.85 for 85% efficiency.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heat_recovery_efficiency: Option<f64>,

    /// Frost protection type for the heat recovery unit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frost_protection: Option<FrostProtectionType>,

    /// Supply air temperature θ_t in °C after heat recovery.
    /// If not set, will be calculated from efficiency and frost protection.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supply_temperature: Option<f64>,

    /// Whether there is pre-heating of supply air (without WTW).
    #[serde(default)]
    pub has_preheating: bool,

    /// Pre-heating supply temperature in °C.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preheating_temperature: Option<f64>,
}

impl VentilationConfig {
    /// Returns the supply air temperature θ_t in °C.
    /// ISSO 51 Table 2.14 (erratum) for systems with heat recovery.
    /// For natural supply: returns the design outdoor temperature (passed as parameter).
    pub fn effective_supply_temperature(&self, theta_e: f64) -> f64 {
        // If explicitly set, use that
        if let Some(t) = self.supply_temperature {
            return t;
        }

        // If pre-heating without WTW
        if self.has_preheating {
            return self.preheating_temperature.unwrap_or(5.0);
        }

        // If heat recovery is installed, use frost protection table
        if self.has_heat_recovery {
            if let Some(fp) = &self.frost_protection {
                return fp.supply_temperature();
            }
            // Default for unknown frost protection
            return 10.0;
        }

        // Natural supply: air comes in at outdoor temperature
        theta_e
    }
}

impl FrostProtectionType {
    /// Returns the supply temperature θ_t in °C.
    /// ISSO 51 Table 2.14 (erratum 2023).
    pub fn supply_temperature(&self) -> f64 {
        match self {
            FrostProtectionType::Unknown => 10.0,
            FrostProtectionType::CentralReducedSpeed => 10.0,
            FrostProtectionType::CentralEnthalpy => 12.0,
            FrostProtectionType::CentralPreheating => 16.0,
            FrostProtectionType::DecentralReducedSpeed => 10.0,
            FrostProtectionType::DecentralEnthalpy => 12.0,
            FrostProtectionType::DecentralPreheating => 14.0,
            FrostProtectionType::ElectricPreheating => 5.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_natural_supply_temperature() {
        let config = VentilationConfig {
            system_type: VentilationSystemType::SystemC,
            has_heat_recovery: false,
            heat_recovery_efficiency: None,
            frost_protection: None,
            supply_temperature: None,
            has_preheating: false,
            preheating_temperature: None,
        };
        assert_eq!(config.effective_supply_temperature(-10.0), -10.0);
    }

    #[test]
    fn test_wtw_supply_temperature() {
        let config = VentilationConfig {
            system_type: VentilationSystemType::SystemD,
            has_heat_recovery: true,
            heat_recovery_efficiency: Some(0.85),
            frost_protection: Some(FrostProtectionType::CentralReducedSpeed),
            supply_temperature: None,
            has_preheating: false,
            preheating_temperature: None,
        };
        assert_eq!(config.effective_supply_temperature(-10.0), 10.0);
    }

    #[test]
    fn test_explicit_supply_temperature() {
        let config = VentilationConfig {
            system_type: VentilationSystemType::SystemD,
            has_heat_recovery: true,
            heat_recovery_efficiency: Some(0.85),
            frost_protection: None,
            supply_temperature: Some(15.0),
            has_preheating: false,
            preheating_temperature: None,
        };
        assert_eq!(config.effective_supply_temperature(-10.0), 15.0);
    }
}
