//! Import module for converting external thermal export data into ISSO 51 Project models.
//!
//! Supports importing from Revit thermal exports (via PyRevit ThermalExport).

pub mod thermal;

pub use thermal::{map_thermal_import, ThermalImport, ThermalImportResult};
