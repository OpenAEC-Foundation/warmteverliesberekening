//! Infiltration heat loss calculations.
//! ISSO 51 §2.5.6, §3.2.1, §4.2.1.
//!
//! [`ISSO_51_2023_FORMULE_E5_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE_E5_ERRATUM):
//! H_i = 1.2 × q_i,spec × z × ΣA_g  (building level)
//!
//! [`ISSO_51_2023_FORMULE4_1_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE4_1_ERRATUM):
//! Φ_i = z_i × H_i × (θ_i - θ_e)    (room level)

/// Calculate the infiltration volume flow rate for a room.
/// [`ISSO_51_2023_TABEL4_3`](crate::formulas::ISSO_51_2023_TABEL4_3):
/// q_i = q_i,spec × ΣA_exterior
///
/// # Arguments
/// * `qi_spec` - Specific infiltration rate in dm³/s per m² exterior area
/// * `total_exterior_area` - Total exterior construction area of the room in m²
///
/// # Returns
/// Infiltration volume flow rate in dm³/s.
pub fn infiltration_flow_rate(qi_spec: f64, total_exterior_area: f64) -> f64 {
    qi_spec * total_exterior_area
}

/// Calculate the specific heat loss by infiltration H_i.
/// [`ISSO_51_2023_FORMULE_E5_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE_E5_ERRATUM):
/// H_i = 1.2 × q_i (where q_i in dm³/s)
///
/// The factor 1.2 comes from ρ × c_p = 1.2 kJ/(m³·K) = 1.2 W·s/(dm³·K).
///
/// # Arguments
/// * `q_i` - Infiltration volume flow rate in dm³/s
///
/// # Returns
/// Specific heat loss H_i in W/K.
pub fn h_infiltration(q_i: f64) -> f64 {
    1.2 * q_i
}

/// Calculate infiltration heat loss Φ_i for a room.
/// [`ISSO_51_2023_FORMULE4_1_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE4_1_ERRATUM):
/// Φ_i = z_i × H_i × (θ_i - θ_e)
///
/// # Arguments
/// * `h_i` - Specific heat loss by infiltration in W/K
/// * `z_i` - Infiltration fraction (typically 1.0 for rooms, see erratum)
/// * `theta_i` - Design indoor temperature in °C
/// * `theta_e` - Design outdoor temperature in °C
///
/// # Returns
/// Infiltration heat loss Φ_i in W.
pub fn phi_infiltration(h_i: f64, z_i: f64, theta_i: f64, theta_e: f64) -> f64 {
    z_i * h_i * (theta_i - theta_e)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isso51_example_room1_infiltration() {
        // ISSO 51 Example 1, Room 1 (woonkamer):
        // qi_spec = 16 × 10⁻⁵ m³/s per m² = 0.16 dm³/s per m²
        // ΣA_totaal = 14.13 m²
        // q_i = 0.16 × 14.13 = 2.2608... ≈ 0.00226 m³/s = 2.26 dm³/s
        // The example gives 0.0023 m³/s = 2.3 dm³/s (rounded)

        let qi_spec = 0.16; // dm³/s per m²
        let total_exterior_area = 14.13; // m²
        let q_i = infiltration_flow_rate(qi_spec, total_exterior_area);

        assert!(
            (q_i - 2.26).abs() < 0.1,
            "q_i = {q_i} dm³/s, expected ~2.26"
        );
    }

    #[test]
    fn test_infiltration_less_than_ventilation() {
        // In the ISSO 51 example, infiltration (2.26 dm³/s) is less than
        // ventilation (25.38 dm³/s), so ventilation is governing.
        let q_i = infiltration_flow_rate(0.16, 14.13);
        let q_v = 25.38; // ventilation requirement
        assert!(q_i < q_v);
    }
}
