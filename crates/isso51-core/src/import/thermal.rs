//! Thermal import: parse a Revit thermal export JSON and map it to an ISSO 51 Project.
//!
//! The thermal export contains rooms (heated, unheated, and pseudo-rooms like outside/ground/water),
//! constructions with layer build-ups, openings (windows/doors), and open connections.
//!
//! The mapping creates Room objects only for heated and unheated rooms, maps constructions to
//! ConstructionElements, and determines BoundaryType based on the adjacent room type.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::model::{
    BoundaryType, Building, BuildingType, ConstructionElement, DesignConditions, GroundParameters,
    HeatingSystem, InfiltrationMethod, MaterialType, Project, ProjectInfo, Room, RoomFunction,
    SecurityClass, VentilationConfig, VentilationSystemType, VerticalPosition,
};

// ─── Input types (deserialized from thermal-import JSON) ───

/// Top-level container for a Revit thermal export.
#[derive(Debug, Clone, Deserialize)]
pub struct ThermalImport {
    pub version: String,
    pub source: String,
    pub exported_at: String,
    #[serde(default)]
    pub project_name: Option<String>,
    pub rooms: Vec<ThermalRoom>,
    pub constructions: Vec<ThermalConstruction>,
    #[serde(default)]
    pub openings: Vec<ThermalOpening>,
    #[serde(default)]
    pub open_connections: Vec<ThermalOpenConnection>,
}

/// A room from the thermal export.
#[derive(Debug, Clone, Deserialize)]
pub struct ThermalRoom {
    pub id: String,
    #[serde(default)]
    pub revit_id: Option<i64>,
    pub name: String,
    #[serde(rename = "type")]
    pub room_type: ThermalRoomType,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub area_m2: Option<f64>,
    #[serde(default)]
    pub height_m: Option<f64>,
    #[serde(default)]
    pub volume_m3: Option<f64>,
    #[serde(default)]
    pub boundary_polygon: Option<Vec<[f64; 2]>>,
}

/// Thermal zone classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThermalRoomType {
    Heated,
    Unheated,
    Outside,
    Ground,
    Water,
}

/// A construction (wall/floor/ceiling/roof) between two rooms.
#[derive(Debug, Clone, Deserialize)]
pub struct ThermalConstruction {
    pub id: String,
    pub room_a: String,
    pub room_b: String,
    pub orientation: ThermalOrientation,
    #[serde(default)]
    pub compass: Option<String>,
    pub gross_area_m2: f64,
    #[serde(default)]
    pub revit_element_id: Option<i64>,
    #[serde(default)]
    pub revit_type_name: Option<String>,
    #[serde(default)]
    pub layers: Vec<ThermalLayer>,
}

/// Orientation of a construction element.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThermalOrientation {
    Wall,
    Floor,
    Ceiling,
    Roof,
}

/// A single material layer in a construction assembly.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ThermalLayer {
    pub material: String,
    pub thickness_mm: f64,
    #[serde(default)]
    pub distance_from_interior_mm: Option<f64>,
    #[serde(default = "default_layer_type")]
    #[serde(rename = "type")]
    pub layer_type: ThermalLayerType,
    #[serde(default)]
    pub lambda: Option<f64>,
}

fn default_layer_type() -> ThermalLayerType {
    ThermalLayerType::Solid
}

/// Layer material type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThermalLayerType {
    Solid,
    AirGap,
}

/// An opening (window/door/curtain wall) in a construction.
#[derive(Debug, Clone, Deserialize)]
pub struct ThermalOpening {
    pub id: String,
    pub construction_id: String,
    #[serde(rename = "type")]
    pub opening_type: ThermalOpeningType,
    pub width_mm: f64,
    pub height_mm: f64,
    #[serde(default)]
    pub sill_height_mm: Option<f64>,
    #[serde(default)]
    pub u_value: Option<f64>,
    #[serde(default)]
    pub revit_element_id: Option<i64>,
    #[serde(default)]
    pub revit_type_name: Option<String>,
}

/// Opening type classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThermalOpeningType {
    Window,
    Door,
    CurtainWall,
}

/// An open connection between two rooms (room separator without wall).
#[derive(Debug, Clone, Deserialize)]
pub struct ThermalOpenConnection {
    pub room_a: String,
    pub room_b: String,
    pub area_m2: f64,
}

// ─── Output types ───

/// Result of mapping a thermal import to an ISSO 51 Project.
#[derive(Debug, Clone, Serialize)]
pub struct ThermalImportResult {
    /// The mapped ISSO 51 Project, ready for editing and calculation.
    pub project: Project,
    /// Warnings generated during the mapping process.
    pub warnings: Vec<String>,
    /// Construction layers per construction ID, for Rc-calculator review in the frontend.
    pub construction_layers: Vec<ConstructionLayerInfo>,
    /// Room polygons for 3D viewer rendering.
    pub room_polygons: Vec<RoomPolygon>,
}

/// Layer info for a single construction, used by the frontend Rc-calculator.
#[derive(Debug, Clone, Serialize)]
pub struct ConstructionLayerInfo {
    /// The construction ID from the thermal export.
    pub construction_id: String,
    /// The room this construction belongs to.
    pub room_id: String,
    /// Revit type name (if available).
    pub revit_type_name: Option<String>,
    /// The layers from interior to exterior.
    pub layers: Vec<ThermalLayer>,
}

/// Room polygon for 3D viewer.
#[derive(Debug, Clone, Serialize)]
pub struct RoomPolygon {
    pub room_id: String,
    pub name: String,
    pub level: Option<String>,
    pub height_m: f64,
    pub polygon: Vec<[f64; 2]>,
}

// ─── Mapping logic ───

/// Map a `ThermalImport` into a `ThermalImportResult`.
///
/// Creates Room objects only for heated and unheated rooms. Pseudo-rooms (outside,
/// ground, water) are used to determine BoundaryType but are not included as rooms.
///
/// U-values are set to 0.0 (placeholder) — the user calculates them via the
/// Rc-calculator in the frontend.
pub fn map_thermal_import(input: ThermalImport) -> ThermalImportResult {
    let mut warnings: Vec<String> = Vec::new();

    // Build lookup: room_id → ThermalRoom
    let room_map: HashMap<&str, &ThermalRoom> =
        input.rooms.iter().map(|r| (r.id.as_str(), r)).collect();

    // Build lookup: construction_id → list of openings
    let mut openings_by_construction: HashMap<&str, Vec<&ThermalOpening>> = HashMap::new();
    for opening in &input.openings {
        openings_by_construction
            .entry(opening.construction_id.as_str())
            .or_default()
            .push(opening);
    }

    // Collect rooms that should become ISSO 51 Room objects (heated + unheated only).
    let real_rooms: Vec<&ThermalRoom> = input
        .rooms
        .iter()
        .filter(|r| matches!(r.room_type, ThermalRoomType::Heated | ThermalRoomType::Unheated))
        .collect();

    // Group constructions by room_a.
    let mut constructions_by_room: HashMap<&str, Vec<&ThermalConstruction>> = HashMap::new();
    for c in &input.constructions {
        constructions_by_room
            .entry(c.room_a.as_str())
            .or_default()
            .push(c);
    }

    // Collect construction layer info for frontend.
    let mut construction_layers: Vec<ConstructionLayerInfo> = Vec::new();

    // Collect room polygons for 3D viewer.
    let mut room_polygons: Vec<RoomPolygon> = Vec::new();

    // Map each real room.
    let mut isso_rooms: Vec<Room> = Vec::new();
    for thermal_room in &real_rooms {
        let floor_area = thermal_room.area_m2.unwrap_or(0.0);
        let height = thermal_room.height_m.unwrap_or(2.6);

        // Build polygon info if available.
        if let Some(ref polygon) = thermal_room.boundary_polygon {
            room_polygons.push(RoomPolygon {
                room_id: thermal_room.id.clone(),
                name: thermal_room.name.clone(),
                level: thermal_room.level.clone(),
                height_m: height,
                polygon: polygon.clone(),
            });
        }

        // Map constructions for this room.
        let mut elements: Vec<ConstructionElement> = Vec::new();
        let mut elem_counter: u32 = 0;

        if let Some(constructions) = constructions_by_room.get(thermal_room.id.as_str()) {
            for construction in constructions {
                // Look up room_b to determine boundary type.
                let room_b = room_map.get(construction.room_b.as_str());
                if room_b.is_none() {
                    warnings.push(format!(
                        "Constructie '{}': room_b '{}' niet gevonden in rooms lijst",
                        construction.id, construction.room_b
                    ));
                }

                // Water → Ground: ISSO 51 behandelt watercontact vergelijkbaar met
                // grondcontact (constante temperatuur, correctiefactor). De gebruiker
                // past de temperatuurcorrectie handmatig aan in de warmteverlies tool.
                let boundary_type = room_b
                    .map(|rb| match rb.room_type {
                        ThermalRoomType::Outside => BoundaryType::Exterior,
                        ThermalRoomType::Ground | ThermalRoomType::Water => BoundaryType::Ground,
                        ThermalRoomType::Unheated => BoundaryType::UnheatedSpace,
                        ThermalRoomType::Heated => BoundaryType::AdjacentRoom,
                    })
                    .unwrap_or(BoundaryType::Exterior);

                let vertical_position = match construction.orientation {
                    ThermalOrientation::Floor => VerticalPosition::Floor,
                    ThermalOrientation::Ceiling | ThermalOrientation::Roof => {
                        VerticalPosition::Ceiling
                    }
                    ThermalOrientation::Wall => VerticalPosition::Wall,
                };

                // Warn if construction has no layers.
                if construction.layers.is_empty() {
                    warnings.push(format!(
                        "Constructie '{}' ({}) heeft geen lagen — U-waarde kan niet berekend worden",
                        construction.id,
                        construction.revit_type_name.as_deref().unwrap_or("onbekend"),
                    ));
                }

                // Collect layer info for Rc-calculator.
                construction_layers.push(ConstructionLayerInfo {
                    construction_id: construction.id.clone(),
                    room_id: thermal_room.id.clone(),
                    revit_type_name: construction.revit_type_name.clone(),
                    layers: construction.layers.clone(),
                });

                // Calculate net area (gross minus openings).
                let openings_in_construction =
                    openings_by_construction.get(construction.id.as_str());
                let total_opening_area: f64 = openings_in_construction
                    .map(|ops| {
                        ops.iter()
                            .map(|o| (o.width_mm * o.height_mm) / 1_000_000.0)
                            .sum()
                    })
                    .unwrap_or(0.0);
                let net_area = (construction.gross_area_m2 - total_opening_area).max(0.0);

                // Build description.
                let description = format!(
                    "{} — {}",
                    construction
                        .revit_type_name
                        .as_deref()
                        .unwrap_or("constructie"),
                    construction
                        .compass
                        .as_deref()
                        .unwrap_or(match construction.orientation {
                            ThermalOrientation::Floor => "vloer",
                            ThermalOrientation::Ceiling => "plafond",
                            ThermalOrientation::Roof => "dak",
                            ThermalOrientation::Wall => "wand",
                        }),
                );

                // Adjacent room info.
                let adjacent_room_id = if boundary_type == BoundaryType::AdjacentRoom
                    || boundary_type == BoundaryType::UnheatedSpace
                {
                    Some(construction.room_b.clone())
                } else {
                    None
                };

                // Ground parameters for ground elements.
                let ground_params = if boundary_type == BoundaryType::Ground {
                    Some(GroundParameters {
                        u_equivalent: 0.0,
                        ground_water_factor: 1.0,
                        fg2: 1.0,
                    })
                } else {
                    None
                };

                elem_counter += 1;
                elements.push(ConstructionElement {
                    id: format!("{}-c{}", thermal_room.id, elem_counter),
                    description,
                    area: net_area,
                    u_value: 0.0, // placeholder — user calculates via Rc-calculator
                    boundary_type,
                    material_type: MaterialType::Masonry, // default; user adjusts
                    temperature_factor: None,
                    adjacent_room_id,
                    adjacent_temperature: None,
                    vertical_position,
                    use_forfaitaire_thermal_bridge: boundary_type == BoundaryType::Exterior,
                    custom_delta_u_tb: None,
                    ground_params,
                    has_embedded_heating: false,
                });

                // Map openings as separate ConstructionElements.
                if let Some(ops) = openings_in_construction {
                    for opening in ops {
                        let opening_area = (opening.width_mm * opening.height_mm) / 1_000_000.0;
                        let opening_desc = format!(
                            "{} — {}",
                            opening
                                .revit_type_name
                                .as_deref()
                                .unwrap_or(match opening.opening_type {
                                    ThermalOpeningType::Window => "raam",
                                    ThermalOpeningType::Door => "deur",
                                    ThermalOpeningType::CurtainWall => "vliesgevel",
                                }),
                            construction
                                .compass
                                .as_deref()
                                .unwrap_or(""),
                        );

                        elem_counter += 1;
                        elements.push(ConstructionElement {
                            id: format!("{}-c{}", thermal_room.id, elem_counter),
                            description: opening_desc,
                            area: opening_area,
                            u_value: opening.u_value.unwrap_or(0.0),
                            boundary_type,
                            material_type: MaterialType::NonMasonry,
                            temperature_factor: None,
                            adjacent_room_id: if boundary_type == BoundaryType::AdjacentRoom
                                || boundary_type == BoundaryType::UnheatedSpace
                            {
                                Some(construction.room_b.clone())
                            } else {
                                None
                            },
                            adjacent_temperature: None,
                            vertical_position: VerticalPosition::Wall,
                            use_forfaitaire_thermal_bridge: boundary_type
                                == BoundaryType::Exterior,
                            custom_delta_u_tb: None,
                            ground_params: None,
                            has_embedded_heating: false,
                        });
                    }
                }
            }
        }

        if elements.is_empty() {
            warnings.push(format!(
                "Ruimte '{}' heeft geen constructie-elementen — controleer of er wanden/vloeren zijn toegewezen",
                thermal_room.name
            ));
        }

        // Determine room function based on room type.
        let function = match thermal_room.room_type {
            ThermalRoomType::Heated => RoomFunction::LivingRoom,   // default; user adjusts
            ThermalRoomType::Unheated => RoomFunction::Storage,     // default for unheated
            _ => RoomFunction::Custom,
        };

        isso_rooms.push(Room {
            id: thermal_room.id.clone(),
            name: thermal_room.name.clone(),
            function,
            custom_temperature: None,
            floor_area,
            height,
            constructions: elements,
            heating_system: HeatingSystem::RadiatorLt, // default; user adjusts
            ventilation_rate: None,
            has_mechanical_exhaust: false,
            has_mechanical_supply: false,
            fraction_outside_air: 1.0,
            supply_air_temperature: None,
            internal_air_temperature: None,
            clamp_positive: true,
        });
    }

    // Calculate total floor area from heated rooms.
    let total_floor_area: f64 = isso_rooms
        .iter()
        .filter(|r| r.function != RoomFunction::Storage)
        .map(|r| r.floor_area)
        .sum();

    let project = Project {
        info: ProjectInfo {
            name: input
                .project_name
                .unwrap_or_else(|| "Thermal Import".to_string()),
            project_number: None,
            address: None,
            client: None,
            date: Some(input.exported_at.clone()),
            engineer: None,
            notes: Some(format!("Geimporteerd uit {} ({})", input.source, input.version)),
        },
        building: Building {
            building_type: BuildingType::Detached, // default; user adjusts
            qv10: 0.0,                             // must be entered by user
            total_floor_area,
            security_class: SecurityClass::B,       // default
            has_night_setback: false,
            warmup_time: 2.0,
            building_height: None,
            num_floors: 1,
            infiltration_method: InfiltrationMethod::PerExteriorArea,
        },
        climate: DesignConditions::default(),
        ventilation: VentilationConfig {
            system_type: VentilationSystemType::SystemC,  // default; user adjusts
            has_heat_recovery: false,
            heat_recovery_efficiency: None,
            frost_protection: None,
            supply_temperature: None,
            has_preheating: false,
            preheating_temperature: None,
        },
        rooms: isso_rooms,
    };

    ThermalImportResult {
        project,
        warnings,
        construction_layers,
        room_polygons,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Load the test fixture.
    fn load_fixture() -> ThermalImport {
        let json = include_str!("../../../../tests/fixtures/thermal-import-sample.json");
        serde_json::from_str(json).expect("Failed to parse thermal-import-sample.json")
    }

    #[test]
    fn test_parse_thermal_import() {
        let import = load_fixture();

        assert_eq!(import.version, "1.0");
        assert_eq!(import.source, "revit-eam");
        assert_eq!(import.rooms.len(), 5);
        assert_eq!(import.constructions.len(), 5);
        assert_eq!(import.openings.len(), 4);
        assert_eq!(import.open_connections.len(), 1);

        // Verify room types.
        assert_eq!(import.rooms[0].room_type, ThermalRoomType::Heated);
        assert_eq!(import.rooms[1].room_type, ThermalRoomType::Unheated);
        assert_eq!(import.rooms[3].room_type, ThermalRoomType::Outside);
        assert_eq!(import.rooms[4].room_type, ThermalRoomType::Ground);

        // Verify construction layers.
        assert_eq!(import.constructions[0].layers.len(), 4);
        assert_eq!(import.constructions[0].layers[0].material, "Gipsplaat");
        assert_eq!(import.constructions[0].layers[1].lambda, Some(0.035));
    }

    #[test]
    fn test_map_creates_rooms_for_heated_and_unheated_only() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        // Only heated (room-0, room-2) and unheated (room-1) should become Rooms.
        // outside (room-outside) and ground (room-ground) should NOT.
        assert_eq!(result.project.rooms.len(), 3);

        let room_ids: Vec<&str> = result.project.rooms.iter().map(|r| r.id.as_str()).collect();
        assert!(room_ids.contains(&"room-0"));
        assert!(room_ids.contains(&"room-1"));
        assert!(room_ids.contains(&"room-2"));
        assert!(!room_ids.contains(&"room-outside"));
        assert!(!room_ids.contains(&"room-ground"));
    }

    #[test]
    fn test_map_boundary_types() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        // room-0's constructions:
        // constr-0: room_b=room-outside → Exterior
        // constr-1: room_b=room-1 (unheated) → UnheatedSpace
        // constr-2: room_b=room-ground → Ground
        let room_0 = result
            .project
            .rooms
            .iter()
            .find(|r| r.id == "room-0")
            .expect("room-0 not found");

        // Find the wall to outside (constr-0 net area element).
        let exterior_elements: Vec<&ConstructionElement> = room_0
            .constructions
            .iter()
            .filter(|c| c.boundary_type == BoundaryType::Exterior)
            .collect();
        assert!(
            !exterior_elements.is_empty(),
            "Should have exterior boundary elements"
        );

        // Find the wall to unheated room-1 (constr-1).
        let unheated_elements: Vec<&ConstructionElement> = room_0
            .constructions
            .iter()
            .filter(|c| c.boundary_type == BoundaryType::UnheatedSpace)
            .collect();
        assert!(
            !unheated_elements.is_empty(),
            "Should have unheated space boundary elements"
        );

        // Find the floor to ground (constr-2).
        let ground_elements: Vec<&ConstructionElement> = room_0
            .constructions
            .iter()
            .filter(|c| c.boundary_type == BoundaryType::Ground)
            .collect();
        assert!(
            !ground_elements.is_empty(),
            "Should have ground boundary elements"
        );
        // Ground element must have ground_params.
        assert!(
            ground_elements[0].ground_params.is_some(),
            "Ground element must have ground_params"
        );

        // room-2's constructions: constr-3 and constr-4, both to room-outside → Exterior
        let room_2 = result
            .project
            .rooms
            .iter()
            .find(|r| r.id == "room-2")
            .expect("room-2 not found");
        let room_2_exterior: Vec<&ConstructionElement> = room_2
            .constructions
            .iter()
            .filter(|c| c.boundary_type == BoundaryType::Exterior)
            .collect();
        assert!(
            room_2_exterior.len() >= 2,
            "room-2 should have at least 2 exterior elements (wall + roof + opening)"
        );
    }

    #[test]
    fn test_map_construction_layers_returned() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        // Should have construction layer info for all 5 constructions.
        assert_eq!(
            result.construction_layers.len(),
            5,
            "Should have layer info for all constructions"
        );

        // First construction (constr-0) should have 4 layers.
        let constr_0 = result
            .construction_layers
            .iter()
            .find(|cl| cl.construction_id == "constr-0")
            .expect("constr-0 layers not found");
        assert_eq!(constr_0.layers.len(), 4);
        assert_eq!(constr_0.room_id, "room-0");
        assert_eq!(
            constr_0.revit_type_name.as_deref(),
            Some("Spouwmuur 300mm")
        );
    }

    #[test]
    fn test_map_warnings_for_missing_layers() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        // constr-4 (Hellend dak) has empty layers → should generate a warning.
        let missing_layer_warnings: Vec<&String> = result
            .warnings
            .iter()
            .filter(|w| w.contains("constr-4") && w.contains("geen lagen"))
            .collect();
        assert!(
            !missing_layer_warnings.is_empty(),
            "Should warn about constr-4 having no layers. Warnings: {:?}",
            result.warnings
        );
    }

    #[test]
    fn test_map_openings_as_construction_elements() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        let room_0 = result
            .project
            .rooms
            .iter()
            .find(|r| r.id == "room-0")
            .expect("room-0 not found");

        // room-0 has 3 constructions (constr-0, constr-1, constr-2) with openings:
        // constr-0: 2 windows (opening-0: 1200x1500, opening-1: 1800x2100)
        // constr-1: 1 door (opening-2: 830x2115)
        // constr-2: no openings
        // So we expect: 3 wall/floor elements + 3 opening elements = 6 total.
        // But openings from constr-0 are exterior (NonMasonry),
        // opening from constr-1 is to unheated space (NonMasonry).
        let non_masonry_elements: Vec<&ConstructionElement> = room_0
            .constructions
            .iter()
            .filter(|c| c.material_type == MaterialType::NonMasonry)
            .collect();
        assert_eq!(
            non_masonry_elements.len(),
            3,
            "room-0 should have 3 opening elements (2 windows + 1 door)"
        );

        // Check window area: opening-0 = 1200 * 1500 / 1e6 = 1.8 m²
        let window_1 = non_masonry_elements
            .iter()
            .find(|c| (c.area - 1.8).abs() < 0.01)
            .expect("Should have a 1.8 m² window element");
        assert_eq!(window_1.boundary_type, BoundaryType::Exterior);
        assert_eq!(window_1.material_type, MaterialType::NonMasonry);

        // Check door area: opening-2 = 830 * 2115 / 1e6 = 1.75545 m²
        let door = non_masonry_elements
            .iter()
            .find(|c| (c.area - 1.75545).abs() < 0.01)
            .expect("Should have a ~1.755 m² door element");
        assert_eq!(door.boundary_type, BoundaryType::UnheatedSpace);

        // room-2 should have 1 opening element (opening-3 from constr-3).
        let room_2 = result
            .project
            .rooms
            .iter()
            .find(|r| r.id == "room-2")
            .expect("room-2 not found");
        let room_2_non_masonry: Vec<&ConstructionElement> = room_2
            .constructions
            .iter()
            .filter(|c| c.material_type == MaterialType::NonMasonry)
            .collect();
        assert_eq!(
            room_2_non_masonry.len(),
            1,
            "room-2 should have 1 opening element"
        );
        // opening-3: 1000 * 1200 / 1e6 = 1.2 m²
        assert!(
            (room_2_non_masonry[0].area - 1.2).abs() < 0.01,
            "Opening area should be 1.2 m², got {}",
            room_2_non_masonry[0].area
        );
    }

    #[test]
    fn test_map_project_metadata() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        assert_eq!(result.project.info.name, "Woonhuis Gouda");
        assert!(result.project.info.notes.as_ref().unwrap().contains("revit-eam"));
        assert_eq!(result.project.climate.theta_e, -10.0);
    }

    #[test]
    fn test_map_net_area_deducts_openings() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        let room_0 = result
            .project
            .rooms
            .iter()
            .find(|r| r.id == "room-0")
            .expect("room-0 not found");

        // constr-0: gross 12.35 m², minus opening-0 (1.8) and opening-1 (3.78) = 6.77 m²
        let wall_exterior = room_0
            .constructions
            .iter()
            .find(|c| {
                c.boundary_type == BoundaryType::Exterior
                    && c.material_type == MaterialType::Masonry
                    && c.vertical_position == VerticalPosition::Wall
            })
            .expect("Should have exterior masonry wall element");
        let expected_net = 12.35 - (1.2 * 1.5) - (1.8 * 2.1);
        assert!(
            (wall_exterior.area - expected_net).abs() < 0.01,
            "Net area should be {:.2}, got {:.2}",
            expected_net,
            wall_exterior.area
        );
    }

    #[test]
    fn test_map_room_polygons() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        // room-0, room-1, room-2 have polygons; pseudo-rooms don't.
        assert_eq!(result.room_polygons.len(), 3);
        let poly_0 = result
            .room_polygons
            .iter()
            .find(|p| p.room_id == "room-0")
            .expect("room-0 polygon not found");
        assert_eq!(poly_0.polygon.len(), 4);
        assert_eq!(poly_0.height_m, 2.6);
    }
}
