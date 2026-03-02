//! Thermal bridge correction values (ΔU_TB).
//! ISSO 51 — forfaitaire methode.

/// Default thermal bridge correction ΔU_TB for the forfaitaire method.
/// Applied to exterior construction elements: U_eff = U + ΔU_TB.
/// ISSO 51 §2.5.1, formule (4.3a).
pub const DELTA_U_TB_FORFAITAIRE: f64 = 0.1;

/// Returns the thermal bridge correction ΔU_TB in W/(m²·K)
/// for a given construction element.
///
/// In the forfaitaire method, ΔU_TB = 0.1 W/(m²·K) for all
/// exterior construction elements.
pub fn delta_u_tb(use_forfaitaire: bool, custom_value: Option<f64>) -> f64 {
    if let Some(custom) = custom_value {
        return custom;
    }
    if use_forfaitaire {
        DELTA_U_TB_FORFAITAIRE
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_forfaitaire_default() {
        assert_eq!(delta_u_tb(true, None), 0.1);
    }

    #[test]
    fn test_no_thermal_bridge() {
        assert_eq!(delta_u_tb(false, None), 0.0);
    }

    #[test]
    fn test_custom_value() {
        assert_eq!(delta_u_tb(true, Some(0.05)), 0.05);
    }
}
