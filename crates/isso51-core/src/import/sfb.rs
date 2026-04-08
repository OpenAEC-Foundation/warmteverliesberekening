//! SfB classification and material abbreviation mapping for construction naming.
//!
//! Generates construction descriptions in the format `{sfb}_{layer1}_{layer2}_{...}`
//! based on boundary type, orientation, and material layers.
//!
//! SfB codes follow NL-SfB Table 1 (element codes):
//! - 21: Buitenwand (exterior wall)
//! - 22: Binnenwand (interior wall)
//! - 23: Vloer (floor / interior ceiling)
//! - 27: Dak (exterior roof/ceiling)

use super::thermal::{ThermalLayer, ThermalLayerType, ThermalOrientation};
use crate::model::BoundaryType;

/// Determine the SfB element code based on boundary type and orientation.
///
/// | boundary_type                    | orientation | SfB |
/// |----------------------------------|-------------|-----|
/// | Exterior                         | Wall        | 21  |
/// | AdjacentRoom / UnheatedSpace     | Wall        | 22  |
/// | Any                              | Floor       | 23  |
/// | Ground                           | Floor       | 23  |
/// | Exterior                         | Ceiling     | 27  |
/// | AdjacentRoom / UnheatedSpace     | Ceiling     | 23  |
pub fn sfb_code(boundary_type: BoundaryType, orientation: ThermalOrientation) -> &'static str {
    match (boundary_type, orientation) {
        (BoundaryType::Exterior, ThermalOrientation::Wall) => "21",
        (BoundaryType::AdjacentRoom | BoundaryType::UnheatedSpace, ThermalOrientation::Wall) => {
            "22"
        }
        (_, ThermalOrientation::Floor) => "23",
        (BoundaryType::Exterior, ThermalOrientation::Ceiling | ThermalOrientation::Roof) => "27",
        (_, ThermalOrientation::Ceiling | ThermalOrientation::Roof) => "23",
        // Fallback for AdjacentBuilding or other boundary types with Wall
        (_, ThermalOrientation::Wall) => "22",
    }
}

/// Map a material name to a short abbreviation.
///
/// Uses case-insensitive substring matching against known Dutch construction materials.
/// If no match is found, returns the first 6 characters of the material name.
pub fn material_abbreviation(material: &str) -> String {
    let lower = material.to_lowercase();

    // Order matters: more specific matches first
    let mappings: &[(&[&str], &str)] = &[
        (&["kalkzandsteen"], "KZS"),
        (&["pir", "pur"], "PIR"),
        (&["eps"], "EPS"),
        (&["minerale wol", "mineraal"], "MW"),
        (&["gipskarton", "gipsplaat"], "Gips"),
        (&["beton gewapend", "gewapend beton"], "Beton"),
        (&["cellenbeton"], "CB"),
        (&["klinker", "baksteen", "gevelklinker"], "Klinker"),
        (&["osb"], "OSB"),
        (&["stucwerk", "stuc", "sierpleister"], "Stuc"),
        (&["breedplaat"], "Breedpl"),
        (&["kanaalplaat"], "Kanaalpl"),
        (&["bitumen"], "Bit"),
        (&["spouw", "luchtspouw"], "Spouw"),
        (&["naaldhout"], "Nhout"),
        (&["dekvloer", "cementdekvloer"], "Dekvloer"),
        (&["tegels"], "Tegels"),
        (&["parket"], "Parket"),
        (&["pe-folie", "dampremmend"], "PE-folie"),
        (&["vezelcement"], "VCement"),
    ];

    for (keywords, abbrev) in mappings {
        for keyword in *keywords {
            if lower.contains(keyword) {
                return abbrev.to_string();
            }
        }
    }

    // Fallback: first 6 characters of the material name
    let trimmed = material.trim();
    if trimmed.len() <= 6 {
        trimmed.to_string()
    } else {
        trimmed[..6].to_string()
    }
}

/// Build an SfB-based construction description from boundary type, orientation, and layers.
///
/// Format: `{sfb}_{layer1}_{layer2}_{...}`
/// Example: `21_Stuc_KZS_PIR_Spouw_Klinker`
///
/// Air gap layers are included as "Spouw" regardless of their material name.
pub fn build_sfb_name(
    boundary_type: BoundaryType,
    orientation: ThermalOrientation,
    layers: &[ThermalLayer],
) -> String {
    let code = sfb_code(boundary_type, orientation);

    if layers.is_empty() {
        return code.to_string();
    }

    let layer_names: Vec<String> = layers
        .iter()
        .map(|layer| {
            if layer.layer_type == ThermalLayerType::AirGap {
                "Spouw".to_string()
            } else {
                material_abbreviation(&layer.material)
            }
        })
        .collect();

    format!("{}_{}", code, layer_names.join("_"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sfb_code_exterior_wall() {
        assert_eq!(sfb_code(BoundaryType::Exterior, ThermalOrientation::Wall), "21");
    }

    #[test]
    fn test_sfb_code_interior_wall() {
        assert_eq!(
            sfb_code(BoundaryType::AdjacentRoom, ThermalOrientation::Wall),
            "22"
        );
        assert_eq!(
            sfb_code(BoundaryType::UnheatedSpace, ThermalOrientation::Wall),
            "22"
        );
    }

    #[test]
    fn test_sfb_code_floor() {
        assert_eq!(sfb_code(BoundaryType::Ground, ThermalOrientation::Floor), "23");
        assert_eq!(
            sfb_code(BoundaryType::Exterior, ThermalOrientation::Floor),
            "23"
        );
    }

    #[test]
    fn test_sfb_code_exterior_ceiling() {
        assert_eq!(
            sfb_code(BoundaryType::Exterior, ThermalOrientation::Ceiling),
            "27"
        );
        assert_eq!(
            sfb_code(BoundaryType::Exterior, ThermalOrientation::Roof),
            "27"
        );
    }

    #[test]
    fn test_sfb_code_interior_ceiling() {
        assert_eq!(
            sfb_code(BoundaryType::AdjacentRoom, ThermalOrientation::Ceiling),
            "23"
        );
        assert_eq!(
            sfb_code(BoundaryType::UnheatedSpace, ThermalOrientation::Ceiling),
            "23"
        );
    }

    #[test]
    fn test_material_abbreviation_known() {
        assert_eq!(material_abbreviation("Kalkzandsteen"), "KZS");
        assert_eq!(material_abbreviation("PIR isolatie"), "PIR");
        assert_eq!(material_abbreviation("EPS isolatie"), "EPS");
        assert_eq!(material_abbreviation("Minerale wol"), "MW");
        assert_eq!(material_abbreviation("Gipsplaat"), "Gips");
        assert_eq!(material_abbreviation("Beton gewapend"), "Beton");
        assert_eq!(material_abbreviation("Cellenbeton"), "CB");
        assert_eq!(material_abbreviation("Baksteen"), "Klinker");
        assert_eq!(material_abbreviation("OSB plaat"), "OSB");
        assert_eq!(material_abbreviation("Stucwerk"), "Stuc");
        assert_eq!(material_abbreviation("Breedplaatvloer"), "Breedpl");
        assert_eq!(material_abbreviation("Kanaalplaatvloer"), "Kanaalpl");
        assert_eq!(material_abbreviation("Bitumen dakbedekking"), "Bit");
        assert_eq!(material_abbreviation("Luchtspouw"), "Spouw");
        assert_eq!(material_abbreviation("Naaldhout"), "Nhout");
        assert_eq!(material_abbreviation("Dekvloer"), "Dekvloer");
    }

    #[test]
    fn test_material_abbreviation_fallback() {
        // Short name: return as-is
        assert_eq!(material_abbreviation("Beton"), "Beton");
        // Long unknown name: truncate to 6 chars
        assert_eq!(material_abbreviation("Onbekend materiaal"), "Onbeke");
    }

    #[test]
    fn test_build_sfb_name_exterior_wall() {
        let layers = vec![
            ThermalLayer {
                material: "Stucwerk".to_string(),
                thickness_mm: 10.0,
                distance_from_interior_mm: Some(0.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(0.5),
            },
            ThermalLayer {
                material: "Kalkzandsteen".to_string(),
                thickness_mm: 100.0,
                distance_from_interior_mm: Some(10.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(1.0),
            },
            ThermalLayer {
                material: "PIR isolatie".to_string(),
                thickness_mm: 120.0,
                distance_from_interior_mm: Some(110.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(0.023),
            },
            ThermalLayer {
                material: "Luchtspouw".to_string(),
                thickness_mm: 40.0,
                distance_from_interior_mm: Some(230.0),
                layer_type: ThermalLayerType::AirGap,
                lambda: None,
            },
            ThermalLayer {
                material: "Baksteen".to_string(),
                thickness_mm: 100.0,
                distance_from_interior_mm: Some(270.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(0.9),
            },
        ];

        let name = build_sfb_name(BoundaryType::Exterior, ThermalOrientation::Wall, &layers);
        assert_eq!(name, "21_Stuc_KZS_PIR_Spouw_Klinker");
    }

    #[test]
    fn test_build_sfb_name_no_layers() {
        let name = build_sfb_name(BoundaryType::Exterior, ThermalOrientation::Roof, &[]);
        assert_eq!(name, "27");
    }

    #[test]
    fn test_build_sfb_name_ground_floor() {
        let layers = vec![
            ThermalLayer {
                material: "Tegels".to_string(),
                thickness_mm: 10.0,
                distance_from_interior_mm: Some(0.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(1.3),
            },
            ThermalLayer {
                material: "Dekvloer".to_string(),
                thickness_mm: 60.0,
                distance_from_interior_mm: Some(10.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(1.4),
            },
            ThermalLayer {
                material: "EPS isolatie".to_string(),
                thickness_mm: 100.0,
                distance_from_interior_mm: Some(70.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(0.034),
            },
            ThermalLayer {
                material: "Beton gewapend".to_string(),
                thickness_mm: 200.0,
                distance_from_interior_mm: Some(170.0),
                layer_type: ThermalLayerType::Solid,
                lambda: Some(1.7),
            },
        ];

        let name = build_sfb_name(BoundaryType::Ground, ThermalOrientation::Floor, &layers);
        assert_eq!(name, "23_Tegels_Dekvloer_EPS_Beton");
    }
}
