//! Quadratic summation of non-simultaneous heat losses.
//! [`ISSO_51_2023_FORMULE3_11_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE3_11_ERRATUM).
//!
//! New in ISSO 51:2023 — non-simultaneous losses are combined
//! via quadratic summation rather than simple addition.
//!
//! Φ_extra = √(Φ_vent² + Φ_T,iaBE² + Φ_hu²)

/// Calculate the quadratic sum of non-simultaneous heat losses.
/// [`ISSO_51_2023_FORMULE3_11_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE3_11_ERRATUM):
/// Φ_extra = √(Φ_vent² + Φ_T,iaBE² + Φ_hu²)
///
/// # Arguments
/// * `phi_vent` - Ventilation heat loss (after subtracting infiltration) in W
/// * `phi_t_adj_building` - Transmission loss to adjacent buildings in W
/// * `phi_hu` - Heating-up allowance in W
///
/// # Returns
/// Combined extra heat loss Φ_extra in W.
pub fn quadratic_sum(phi_vent: f64, phi_t_adj_building: f64, phi_hu: f64) -> f64 {
    (phi_vent.powi(2) + phi_t_adj_building.powi(2) + phi_hu.powi(2)).sqrt()
}

/// Calculate the total heat loss for a room.
/// [`ISSO_51_2023_PARAG4_5_3`](crate::formulas::ISSO_51_2023_PARAG4_5_3):
/// Φ_HL,i = Φ_basis + Φ_extra
///
/// Where:
/// - Φ_basis = Φ_T,exterior + Φ_T,unheated + Φ_T,ground + Φ_infiltration + Φ_system_losses
/// - Φ_extra = √(Φ_vent² + Φ_T,iaBE² + Φ_hu²)
///
/// # Arguments
/// * `phi_basis` - Always-occurring heat losses in W
/// * `phi_extra` - Non-simultaneous heat losses (quadratic sum) in W
///
/// # Returns
/// Total design heat loss Φ_HL,i in W.
pub fn total_heat_loss(phi_basis: f64, phi_extra: f64) -> f64 {
    phi_basis + phi_extra
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_quadratic_sum_basic() {
        // Simple 3-4-5 triangle check
        let result = quadratic_sum(3.0, 4.0, 0.0);
        assert_relative_eq!(result, 5.0, epsilon = 0.001);
    }

    #[test]
    fn test_quadratic_sum_all_zero() {
        let result = quadratic_sum(0.0, 0.0, 0.0);
        assert_eq!(result, 0.0);
    }

    #[test]
    fn test_quadratic_sum_single_component() {
        let result = quadratic_sum(100.0, 0.0, 0.0);
        assert_relative_eq!(result, 100.0, epsilon = 0.001);
    }

    #[test]
    fn test_total_heat_loss() {
        let phi_basis = 1000.0;
        let phi_extra = quadratic_sum(500.0, 300.0, 200.0);
        let total = total_heat_loss(phi_basis, phi_extra);
        // √(500² + 300² + 200²) = √(250000 + 90000 + 40000) = √380000 ≈ 616.4
        assert!(total > 1600.0);
        assert!(total < 1620.0);
    }
}
