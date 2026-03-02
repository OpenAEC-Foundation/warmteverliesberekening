//! Heating-up allowance (opwarmtoeslag) lookup tables.
//! ISSO 51 §2.5.8, Table 4.6, Figure 4.2.

use crate::model::enums::BuildingType;

/// Cooling during a normal night setback period (max 8 hours).
/// ISSO 51 Figure 4.2.
/// Returns the temperature drop in K during the night setback.
pub fn night_cooling(building_type: BuildingType) -> f64 {
    match building_type {
        BuildingType::Detached => 3.0,
        BuildingType::SemiDetached | BuildingType::EndOfTerrace => 2.0,
        BuildingType::Terraced => 1.5,
        BuildingType::Porch | BuildingType::Gallery | BuildingType::Stacked => 1.5,
    }
}

/// Heating-up allowance factor f_RH in W/m² accumulating surface.
/// ISSO 51 Table 4.6.
///
/// # Arguments
/// * `delta_t` - Temperature drop during night setback in K (from Figure 4.2)
/// * `warmup_time` - Desired warm-up time in hours (typically 1 or 2)
///
/// # Returns
/// f_RH in W/m² of accumulating (masonry) surface area.
pub fn heating_up_factor(delta_t: f64, warmup_time: f64) -> f64 {
    // ISSO 51 Table 4.6 simplified lookup
    // Rows: delta_t = 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0
    // Columns: warmup_time = 1h, 2h, 3h
    let table: &[(f64, [f64; 3])] = &[
        (0.5, [1.4, 0.7, 0.5]),
        (1.0, [2.8, 1.4, 0.9]),
        (1.5, [3.4, 1.7, 1.1]),
        (2.0, [4.5, 2.3, 1.5]),
        (2.5, [5.6, 2.8, 1.9]),
        (3.0, [6.8, 3.4, 2.3]),
        (3.5, [7.9, 4.0, 2.6]),
        (4.0, [9.0, 4.5, 3.0]),
    ];

    // Determine column index (warmup time)
    let col = if warmup_time <= 1.5 {
        0 // 1 hour
    } else if warmup_time <= 2.5 {
        1 // 2 hours
    } else {
        2 // 3 hours
    };

    // Find the closest row by delta_t (linear interpolation)
    if delta_t <= table[0].0 {
        return table[0].1[col];
    }
    if delta_t >= table[table.len() - 1].0 {
        return table[table.len() - 1].1[col];
    }

    for i in 0..table.len() - 1 {
        let (t0, v0) = &table[i];
        let (t1, v1) = &table[i + 1];
        if delta_t >= *t0 && delta_t <= *t1 {
            let fraction = (delta_t - t0) / (t1 - t0);
            return v0[col] + fraction * (v1[col] - v0[col]);
        }
    }

    // Should not reach here, but return 0 as fallback
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_portiekwoning_heating_up() {
        // ISSO 51 example: stacked building, Δt = 1.5K, 2h warmup → f_RH = 1.7
        let delta_t = night_cooling(BuildingType::Porch);
        assert_eq!(delta_t, 1.5);

        let f_rh = heating_up_factor(delta_t, 2.0);
        assert!((f_rh - 1.7).abs() < 0.01);
    }

    #[test]
    fn test_detached_heating_up() {
        let delta_t = night_cooling(BuildingType::Detached);
        assert_eq!(delta_t, 3.0);

        let f_rh = heating_up_factor(delta_t, 2.0);
        assert!((f_rh - 3.4).abs() < 0.01);
    }
}
