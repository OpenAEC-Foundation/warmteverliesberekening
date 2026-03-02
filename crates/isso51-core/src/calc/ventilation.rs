//! Ventilation heat loss calculations.
//! ISSO 51 §2.5.7, §4.2.2.
//!
//! H_v = 1.2 × q_v × f_v
//! Φ_v = H_v × (θ_i - θ_e)

/// Calculate the temperature correction factor f_v for ventilation.
/// [`ISSO_51_2023_FORMULE4_6A_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE4_6A_ERRATUM):
/// f_v = ((θ_i + Δθ_v) - θ_t) / (θ_i - θ_e)
///
/// # Arguments
/// * `theta_i` - Design indoor temperature in °C
/// * `theta_e` - Design outdoor temperature in °C
/// * `theta_t` - Supply air temperature in °C
/// * `delta_v` - Δθ_v correction for heating system (Table 2.12)
///
/// # Returns
/// Temperature correction factor f_v (dimensionless).
pub fn f_v(theta_i: f64, theta_e: f64, theta_t: f64, delta_v: f64) -> f64 {
    let denom = theta_i - theta_e;
    if denom.abs() < 1e-10 {
        return 0.0;
    }
    ((theta_i + delta_v) - theta_t) / denom
}

/// Calculate the temperature correction factor f_v for air from an adjacent room.
/// [`ISSO_51_2023_FORMULE4_6B_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE4_6B_ERRATUM):
/// f_v = ((θ_i + Δθ_v) - θ_a) / (θ_i - θ_e)
///
/// # Arguments
/// * `theta_i` - Design indoor temperature in °C
/// * `theta_e` - Design outdoor temperature in °C
/// * `theta_a` - Temperature of adjacent room supplying air in °C
/// * `delta_v` - Δθ_v correction for heating system
///
/// # Returns
/// Temperature correction factor f_v for internal air source.
pub fn f_v_adjacent(theta_i: f64, theta_e: f64, theta_a: f64, delta_v: f64) -> f64 {
    let denom = theta_i - theta_e;
    if denom.abs() < 1e-10 {
        return 0.0;
    }
    ((theta_i + delta_v) - theta_a) / denom
}

/// Calculate the specific heat loss by ventilation H_v.
/// [`ISSO_51_2023_FORMULE4_3_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE4_3_ERRATUM):
/// H_v = 1.2 × q_v × f_v
///
/// # Arguments
/// * `q_v` - Ventilation volume flow rate in dm³/s
/// * `fv` - Temperature correction factor
///
/// # Returns
/// Specific heat loss H_v in W/K.
pub fn h_ventilation(q_v: f64, fv: f64) -> f64 {
    1.2 * q_v * fv
}

/// Calculate H_v for a room with mixed air supply.
/// [`ISSO_51_2023_FORMULE4_7_ERRATUM`](crate::formulas::ISSO_51_2023_FORMULE4_7_ERRATUM):
/// H_v = 1.2 × ((a × q_v × f_v1) + (1-a) × q_v × f_v2)
///
/// # Arguments
/// * `q_v` - Total ventilation volume flow rate in dm³/s
/// * `a` - Fraction of air from outside (0 to 1)
/// * `f_v1` - Temperature correction factor for outside air
/// * `f_v2` - Temperature correction factor for internal air
///
/// # Returns
/// Specific heat loss H_v in W/K.
pub fn h_ventilation_mixed(q_v: f64, a: f64, f_v1: f64, f_v2: f64) -> f64 {
    1.2 * ((a * q_v * f_v1) + ((1.0 - a) * q_v * f_v2))
}

/// Calculate ventilation heat loss Φ_v for a room.
/// Φ_v = H_v × (θ_i - θ_e)
///
/// # Arguments
/// * `h_v` - Specific heat loss by ventilation in W/K
/// * `theta_i` - Design indoor temperature in °C
/// * `theta_e` - Design outdoor temperature in °C
///
/// # Returns
/// Ventilation heat loss Φ_v in W.
pub fn phi_ventilation(h_v: f64, theta_i: f64, theta_e: f64) -> f64 {
    h_v * (theta_i - theta_e)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isso51_example_room1_ventilation() {
        // ISSO 51 Example 1, Room 1 (woonkamer):
        // q_v = 0.02538 m³/s = 25.38 dm³/s
        // f_v = 1.0 (natural supply, θ_t = θ_e)
        // H_v = 1.2 × 25.38 × 1.0 = 30.456
        // Φ_v = 30.456 × (20 - -10) = 913.7 ≈ 914 W

        let q_v = 25.38;
        let fv = f_v(20.0, -10.0, -10.0, 0.0);
        assert!((fv - 1.0).abs() < 0.001);

        let h_v = h_ventilation(q_v, fv);
        let phi_v = phi_ventilation(h_v, 20.0, -10.0);
        assert!(
            (phi_v - 914.0).abs() < 2.0,
            "Φ_v = {phi_v}, expected ~914"
        );
    }

    #[test]
    fn test_isso51_example_room2_ventilation_zero() {
        // Room 2 (keuken): f_v = 0 (all air comes from woonkamer)
        // Φ_v = 0.021 × 1200 × 0 × 30 = 0 W
        let fv = 0.0; // explicitly zero
        let h_v = h_ventilation(21.0, fv);
        let phi_v = phi_ventilation(h_v, 20.0, -10.0);
        assert_eq!(phi_v, 0.0);
    }

    #[test]
    fn test_isso51_example_room3_ventilation() {
        // Room 3 (badkamer, θ_i=22°C):
        // Air from entree at θ_a=15°C
        // f_v = (22-15)/(22--10) = 7/32 = 0.21875
        // q_v = 14 dm³/s
        // H_v = 1.2 × 14 × 0.21875 = 3.675
        // Φ_v = 3.675 × 32 = 117.6 ≈ 118 W

        let fv = f_v_adjacent(22.0, -10.0, 15.0, 0.0);
        assert!((fv - 0.21875).abs() < 0.001);

        let h_v = h_ventilation(14.0, fv);
        let phi_v = phi_ventilation(h_v, 22.0, -10.0);
        assert!(
            (phi_v - 118.0).abs() < 2.0,
            "Φ_v = {phi_v}, expected ~118"
        );
    }

    #[test]
    fn test_isso51_example_room4_ventilation() {
        // Room 4 (slaapkamer 1):
        // q_v = 7.88 dm³/s, f_v = 1.0
        // Φ_v = 1.2 × 7.88 × 1.0 × 30 = 283.7 ≈ 284 W

        let h_v = h_ventilation(7.88, 1.0);
        let phi_v = phi_ventilation(h_v, 20.0, -10.0);
        assert!(
            (phi_v - 284.0).abs() < 2.0,
            "Φ_v = {phi_v}, expected ~284"
        );
    }
}
