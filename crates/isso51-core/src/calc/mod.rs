//! Calculation modules for ISSO 51 heat loss calculations.
//!
//! Each module implements a specific part of the heat loss calculation.
//! The `room_load` module orchestrates all calculations for a single room.

pub mod heating_up;
pub mod infiltration;
pub mod quadratic_sum;
pub mod room_load;
pub mod system_losses;
pub mod transmission;
pub mod ventilation;
