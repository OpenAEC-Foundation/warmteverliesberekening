//! Infiltration rate lookup tables.
//! ISSO 51 §2.5.6, Tables 2.8, 4.3.

/// Specific infiltration air flow rate q_i,spec per m² of exterior
/// construction area.
/// ISSO 51 Table 4.3.
///
/// # Arguments
/// * `qv10` - Air tightness qv,10 of the building in dm³/s
///
/// # Returns
/// q_i,spec in dm³/s per m² of exterior construction area.
pub fn qi_spec_per_exterior_area(qv10: f64) -> f64 {
    // ISSO 51 Table 4.3: qi,spec in dm³/s per m² exterior construction
    if qv10 <= 50.0 {
        0.08
    } else if qv10 <= 100.0 {
        0.16
    } else if qv10 <= 150.0 {
        0.24
    } else {
        0.32
    }
}

/// Specific infiltration air flow rate q_i,spec per m² of usable floor area.
/// ISSO 51 Table 2.8 (building-level calculation).
///
/// # Arguments
/// * `qv10` - Air tightness qv,10 of the building in dm³/s
///
/// # Returns
/// q_i,spec in dm³/s per m² of usable floor area (gebruiksoppervlak).
pub fn qi_spec_per_floor_area(qv10: f64) -> f64 {
    // ISSO 51 Table 2.8
    if qv10 <= 50.0 {
        0.04
    } else if qv10 <= 100.0 {
        0.08
    } else if qv10 <= 150.0 {
        0.12
    } else {
        0.16
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qi_spec_qv10_100() {
        // ISSO 51 example: qv10=100 → 16 × 10⁻⁵ m³/s per m² = 0.16 dm³/s per m²
        let qi = qi_spec_per_exterior_area(100.0);
        assert!((qi - 0.16).abs() < 0.001);
    }

    #[test]
    fn test_qi_spec_qv10_50() {
        let qi = qi_spec_per_exterior_area(50.0);
        assert!((qi - 0.08).abs() < 0.001);
    }
}
