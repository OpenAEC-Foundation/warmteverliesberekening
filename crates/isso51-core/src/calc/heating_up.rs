//! Heating-up allowance (opwarmtoeslag) calculation.
//! ISSO 51 §2.5.8, §4.3.
//!
//! The heating-up allowance compensates for the extra energy needed
//! to bring the room back to design temperature after night setback.

use crate::model::enums::BuildingType;
use crate::tables::heating_up as table;

/// Calculate the heating-up allowance Φ_hu for a room.
/// [`ISSO_51_2023_PARAG4_3`](crate::formulas::ISSO_51_2023_PARAG4_3).
///
/// Method: For the main room (with thermostat), calculate f_RH × ΣA_accumulating.
/// For other rooms, apply the same percentage of (Φ_T + Φ_v).
///
/// # Arguments
/// * `building_type` - Type of building (for night cooling lookup)
/// * `warmup_time` - Desired warm-up time in hours
/// * `accumulating_area` - Total accumulating (masonry) surface area in m²
/// * `phi_t` - Transmission heat loss in W
/// * `phi_v` - Ventilation heat loss in W
/// * `is_main_room` - Whether this is the main room (first calculation)
/// * `main_room_percentage` - Percentage from main room calculation (for other rooms)
///
/// # Returns
/// Heating-up allowance Φ_hu in W and the f_RH factor used.
pub fn calculate_heating_up(
    building_type: BuildingType,
    warmup_time: f64,
    accumulating_area: f64,
    phi_t: f64,
    phi_v: f64,
    is_main_room: bool,
    main_room_percentage: Option<f64>,
) -> (f64, f64) {
    let delta_t = table::night_cooling(building_type);
    let f_rh = table::heating_up_factor(delta_t, warmup_time);

    if is_main_room {
        // Main room: Φ_hu = f_RH × ΣA_accumulating
        let phi_hu = f_rh * accumulating_area;
        (phi_hu, f_rh)
    } else if let Some(pct) = main_room_percentage {
        // Other rooms: Φ_hu = percentage × (Φ_T + Φ_v)
        let phi_hu = pct * (phi_t + phi_v);
        // Φ_hu must not be negative
        (phi_hu.max(0.0), f_rh)
    } else {
        // Fallback: use f_RH × area
        let phi_hu = f_rh * accumulating_area;
        (phi_hu, f_rh)
    }
}

/// Calculate the heating-up percentage for the main room.
/// This percentage is then applied to other rooms.
///
/// # Arguments
/// * `phi_hu_main` - Heating-up allowance of the main room in W
/// * `phi_t_main` - Transmission heat loss of the main room in W
/// * `phi_v_main` - Ventilation heat loss of the main room in W
///
/// # Returns
/// The percentage as a decimal (e.g., 0.087 for 8.7%).
pub fn main_room_percentage(phi_hu_main: f64, phi_t_main: f64, phi_v_main: f64) -> f64 {
    let total = phi_t_main + phi_v_main;
    if total.abs() < 1e-10 {
        return 0.0;
    }
    phi_hu_main / total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isso51_example_room1_heating_up() {
        // ISSO 51 Example 1, Room 1 (woonkamer):
        // Building type: Porch (gestapeld), Δt = 1.5K, warmup = 2h
        // f_RH = 1.7 W/m²
        // ΣA_accumulating = 7.65 + 27.83 + 74.49 = 109.97 m²
        // Φ_hu = 109.97 × 1.7 = 186.95 ≈ 187 W
        // Percentage = 187 / (1247 + 914) = 0.0866 ≈ 8.7%

        let (phi_hu, f_rh) = calculate_heating_up(
            BuildingType::Porch,
            2.0,
            109.97,
            1247.0,
            914.0,
            true,
            None,
        );

        assert!((f_rh - 1.7).abs() < 0.01, "f_RH = {f_rh}");
        assert!((phi_hu - 187.0).abs() < 1.0, "Φ_hu = {phi_hu}");

        let pct = main_room_percentage(phi_hu, 1247.0, 914.0);
        assert!((pct - 0.087).abs() < 0.002, "percentage = {pct}");
    }

    #[test]
    fn test_isso51_example_room2_heating_up() {
        // Room 2 (keuken): Φ_hu = 0.087 × (619 + 43) = 58 W
        let pct = 0.087;
        let (phi_hu, _) = calculate_heating_up(
            BuildingType::Porch,
            2.0,
            0.0,
            619.0,
            43.0,
            false,
            Some(pct),
        );
        assert!((phi_hu - 58.0).abs() < 2.0, "Φ_hu = {phi_hu}");
    }

    #[test]
    fn test_negative_clamped_to_zero() {
        // Rooms with negative (Φ_T + Φ_v) should get Φ_hu = 0
        let (phi_hu, _) = calculate_heating_up(
            BuildingType::Porch,
            2.0,
            0.0,
            -240.0,
            210.0,
            false,
            Some(0.087),
        );
        assert!(phi_hu >= 0.0, "Φ_hu should not be negative, got {phi_hu}");
    }
}
