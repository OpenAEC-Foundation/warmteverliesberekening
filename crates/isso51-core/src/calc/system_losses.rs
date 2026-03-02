//! System losses for embedded heating (floor/wall/ceiling heating).
//! ISSO 51 §2.9.

/// Fraction of floor heating loss to ground/crawlspace.
/// [`ISSO_51_2023_TABEL2_17`](crate::formulas::ISSO_51_2023_TABEL2_17).
///
/// # Arguments
/// * `rc_floor` - Thermal resistance R_c of the floor in m²·K/W
///
/// # Returns
/// Fraction f_vvw for floor heating loss.
pub fn floor_heating_loss_fraction(rc_floor: f64) -> f64 {
    if rc_floor <= 0.35 {
        0.85
    } else if rc_floor <= 1.0 {
        0.40
    } else if rc_floor <= 2.0 {
        0.25
    } else if rc_floor <= 3.0 {
        0.15
    } else {
        0.10
    }
}

/// Fraction of wall heating loss to exterior/adjacent building.
/// [`ISSO_51_2023_TABEL2_18_ERRATUM`](crate::formulas::ISSO_51_2023_TABEL2_18_ERRATUM).
///
/// # Arguments
/// * `rc_wall` - Thermal resistance R_c of the wall in m²·K/W
///
/// # Returns
/// Fraction f_wvw for wall heating loss.
pub fn wall_heating_loss_fraction(rc_wall: f64) -> f64 {
    if rc_wall <= 0.35 {
        0.85
    } else if rc_wall <= 1.0 {
        0.40
    } else if rc_wall <= 2.0 {
        0.25
    } else if rc_wall <= 3.0 {
        0.15
    } else {
        0.10
    }
}

/// Ceiling heating loss fraction.
/// [`ISSO_51_2023_PARAG2_9_1_ERRATUM`](crate::formulas::ISSO_51_2023_PARAG2_9_1_ERRATUM).
///
/// # Arguments
/// * `rc_ceiling` - Thermal resistance R_c of the ceiling/roof in m²·K/W
///
/// # Returns
/// Fraction for ceiling heating loss.
pub fn ceiling_heating_loss_fraction(rc_ceiling: f64) -> f64 {
    if rc_ceiling >= 3.0 {
        0.20
    } else {
        0.50
    }
}

/// Calculate system losses for a room.
///
/// # Arguments
/// * `phi_hl` - Design heating power of the room Φ_HL,i in W
/// * `has_floor_heating` - Whether the room has floor heating on ground/crawlspace
/// * `rc_floor` - R_c value of the floor (if applicable)
/// * `has_wall_heating_exterior` - Whether wall heating faces exterior/adjacent building
/// * `rc_wall` - R_c value of the exterior wall (if applicable)
/// * `has_ceiling_heating_exterior` - Whether ceiling heating faces exterior/adjacent building
/// * `rc_ceiling` - R_c value of the ceiling/roof (if applicable)
///
/// # Returns
/// Tuple of (Φ_verlies1, Φ_verlies2, Φ_verlies3) in W.
pub fn calculate_system_losses(
    phi_hl: f64,
    has_floor_heating: bool,
    rc_floor: f64,
    has_wall_heating_exterior: bool,
    rc_wall: f64,
    has_ceiling_heating_exterior: bool,
    rc_ceiling: f64,
) -> (f64, f64, f64) {
    let phi_loss1 = if has_floor_heating {
        floor_heating_loss_fraction(rc_floor) * phi_hl
    } else {
        0.0
    };

    let phi_loss2 = if has_wall_heating_exterior {
        wall_heating_loss_fraction(rc_wall) * phi_hl
    } else {
        0.0
    };

    let phi_loss3 = if has_ceiling_heating_exterior {
        ceiling_heating_loss_fraction(rc_ceiling) * phi_hl
    } else {
        0.0
    };

    (phi_loss1, phi_loss2, phi_loss3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floor_loss_fractions() {
        assert_eq!(floor_heating_loss_fraction(0.2), 0.85);
        assert_eq!(floor_heating_loss_fraction(0.5), 0.40);
        assert_eq!(floor_heating_loss_fraction(1.5), 0.25);
        assert_eq!(floor_heating_loss_fraction(2.5), 0.15);
        assert_eq!(floor_heating_loss_fraction(4.0), 0.10);
    }

    #[test]
    fn test_no_embedded_heating() {
        let (l1, l2, l3) = calculate_system_losses(1000.0, false, 0.0, false, 0.0, false, 0.0);
        assert_eq!(l1, 0.0);
        assert_eq!(l2, 0.0);
        assert_eq!(l3, 0.0);
    }
}
