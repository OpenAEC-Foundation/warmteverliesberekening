//! Thermal import: parse a Revit thermal export JSON and map it to an ISSO 51 Project.
//!
//! The thermal export contains rooms (heated, unheated, and pseudo-rooms like outside/ground/water),
//! constructions with layer build-ups, openings (windows/doors), and open connections.
//!
//! The mapping creates Room objects only for heated and unheated rooms, maps constructions to
//! ConstructionElements, and determines BoundaryType based on the adjacent room type.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::sfb::build_sfb_name;
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
        // Phase 1: Collect individual construction surfaces and openings.
        let mut raw_elements: Vec<ConstructionElement> = Vec::new();
        let mut opening_elements: Vec<ConstructionElement> = Vec::new();
        let mut elem_counter: u32 = 0;

        // Track grouping info per element: (revit_type_name, boundary_type, orientation, layers)
        // Used for grouping in phase 2.
        struct GroupingInfo {
            revit_type_name: String,
            boundary_type: BoundaryType,
            orientation: ThermalOrientation,
            layers: Vec<ThermalLayer>,
            adjacent_room_id: Option<String>,
        }
        let mut grouping_infos: Vec<GroupingInfo> = Vec::new();

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

                // Filter: skip 0 m² construction surfaces.
                if net_area <= 0.0 {
                    warnings.push(format!(
                        "Constructie '{}' ({}) overgeslagen: netto oppervlak is 0 m²",
                        construction.id,
                        construction.revit_type_name.as_deref().unwrap_or("onbekend"),
                    ));
                } else {
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
                    raw_elements.push(ConstructionElement {
                        id: format!("{}-c{}", thermal_room.id, elem_counter),
                        description: String::new(), // will be set during grouping
                        area: net_area,
                        u_value: 0.0, // placeholder — user calculates via Rc-calculator
                        boundary_type,
                        material_type: MaterialType::Masonry, // default; user adjusts
                        temperature_factor: None,
                        adjacent_room_id: adjacent_room_id.clone(),
                        adjacent_temperature: None,
                        vertical_position,
                        use_forfaitaire_thermal_bridge: boundary_type == BoundaryType::Exterior,
                        custom_delta_u_tb: None,
                        ground_params,
                        has_embedded_heating: false,
                    });

                    grouping_infos.push(GroupingInfo {
                        revit_type_name: construction
                            .revit_type_name
                            .clone()
                            .unwrap_or_else(|| "onbekend".to_string()),
                        boundary_type,
                        orientation: construction.orientation,
                        layers: construction.layers.clone(),
                        adjacent_room_id,
                    });
                }

                // Map openings as separate ConstructionElements (not grouped).
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
                        opening_elements.push(ConstructionElement {
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

        // Phase 2: Group construction surfaces by (revit_type_name, boundary_type, orientation).
        // Surfaces with the same key are merged: areas summed, SfB-based name assigned.
        let mut elements: Vec<ConstructionElement> = Vec::new();

        // Group key: (revit_type_name, boundary_type discriminant, orientation discriminant)
        type GroupKey = (String, u8, u8);

        fn boundary_discriminant(bt: BoundaryType) -> u8 {
            match bt {
                BoundaryType::Exterior => 0,
                BoundaryType::Ground => 1,
                BoundaryType::UnheatedSpace => 2,
                BoundaryType::AdjacentRoom => 3,
                BoundaryType::AdjacentBuilding => 4,
            }
        }

        fn orientation_discriminant(o: ThermalOrientation) -> u8 {
            match o {
                ThermalOrientation::Wall => 0,
                ThermalOrientation::Floor => 1,
                ThermalOrientation::Ceiling => 2,
                ThermalOrientation::Roof => 3,
            }
        }

        // Build groups, preserving insertion order.
        let mut group_order: Vec<GroupKey> = Vec::new();
        let mut groups: HashMap<GroupKey, Vec<usize>> = HashMap::new();

        for (idx, info) in grouping_infos.iter().enumerate() {
            let key: GroupKey = (
                info.revit_type_name.clone(),
                boundary_discriminant(info.boundary_type),
                orientation_discriminant(info.orientation),
            );
            let entry = groups.entry(key.clone()).or_default();
            if entry.is_empty() {
                group_order.push(key);
            }
            entry.push(idx);
        }

        let mut group_counter: u32 = 0;
        for key in &group_order {
            let indices = &groups[key];
            let first_idx = indices[0];
            let first_info = &grouping_infos[first_idx];
            let first_elem = &raw_elements[first_idx];

            // Sum areas across all surfaces in this group.
            let total_area: f64 = indices.iter().map(|&i| raw_elements[i].area).sum();

            // Generate SfB-based description.
            let description = build_sfb_name(
                first_info.boundary_type,
                first_info.orientation,
                &first_info.layers,
            );

            // Log grouping info when multiple surfaces are merged.
            if indices.len() > 1 {
                warnings.push(format!(
                    "Ruimte '{}': {} grensvlakken van type '{}' samengevoegd tot '{}' (totaal {:.2} m²)",
                    thermal_room.name,
                    indices.len(),
                    first_info.revit_type_name,
                    description,
                    total_area,
                ));
            }

            group_counter += 1;
            elements.push(ConstructionElement {
                id: format!("{}-g{}", thermal_room.id, group_counter),
                description,
                area: total_area,
                u_value: first_elem.u_value,
                boundary_type: first_elem.boundary_type,
                material_type: first_elem.material_type,
                temperature_factor: first_elem.temperature_factor,
                adjacent_room_id: first_info.adjacent_room_id.clone(),
                adjacent_temperature: first_elem.adjacent_temperature,
                vertical_position: first_elem.vertical_position,
                use_forfaitaire_thermal_bridge: first_elem.use_forfaitaire_thermal_bridge,
                custom_delta_u_tb: first_elem.custom_delta_u_tb,
                ground_params: first_elem.ground_params.clone(),
                has_embedded_heating: first_elem.has_embedded_heating,
            });
        }

        // Add opening elements (not grouped).
        elements.extend(opening_elements);

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

    // ─── New tests: grouping, 0 m² filtering, SfB naming ───

    #[test]
    fn test_zero_area_filtered_with_warning() {
        // Create a construction where openings consume all area → net_area = 0.
        let input = ThermalImport {
            version: "1.0".to_string(),
            source: "test".to_string(),
            exported_at: "2026-04-08".to_string(),
            project_name: Some("Zero Area Test".to_string()),
            rooms: vec![
                ThermalRoom {
                    id: "r1".to_string(),
                    revit_id: None,
                    name: "Kamer".to_string(),
                    room_type: ThermalRoomType::Heated,
                    level: None,
                    area_m2: Some(10.0),
                    height_m: Some(2.6),
                    volume_m3: None,
                    boundary_polygon: None,
                },
                ThermalRoom {
                    id: "r-out".to_string(),
                    revit_id: None,
                    name: "Buiten".to_string(),
                    room_type: ThermalRoomType::Outside,
                    level: None,
                    area_m2: None,
                    height_m: None,
                    volume_m3: None,
                    boundary_polygon: None,
                },
            ],
            constructions: vec![
                // This construction has gross_area exactly equal to the opening area.
                ThermalConstruction {
                    id: "c-zero".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-out".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("N".to_string()),
                    gross_area_m2: 2.0,
                    revit_element_id: None,
                    revit_type_name: Some("Wand met pui".to_string()),
                    layers: vec![],
                },
                // Normal construction with area.
                ThermalConstruction {
                    id: "c-normal".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-out".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("S".to_string()),
                    gross_area_m2: 8.0,
                    revit_element_id: None,
                    revit_type_name: Some("Spouwmuur".to_string()),
                    layers: vec![],
                },
            ],
            openings: vec![
                // Opening consumes all area of c-zero.
                ThermalOpening {
                    id: "o1".to_string(),
                    construction_id: "c-zero".to_string(),
                    opening_type: ThermalOpeningType::Window,
                    width_mm: 2000.0,
                    height_mm: 1000.0,
                    sill_height_mm: None,
                    u_value: Some(1.6),
                    revit_element_id: None,
                    revit_type_name: Some("Pui".to_string()),
                },
            ],
            open_connections: vec![],
        };

        let result = map_thermal_import(input);
        let room = &result.project.rooms[0];

        // The zero-area construction should be filtered out.
        // Only the normal construction (masonry) + the opening (non-masonry) should remain.
        let masonry: Vec<&ConstructionElement> = room
            .constructions
            .iter()
            .filter(|c| c.material_type == MaterialType::Masonry)
            .collect();
        assert_eq!(masonry.len(), 1, "Should have 1 masonry element (the normal wall)");
        assert!((masonry[0].area - 8.0).abs() < 0.01, "Normal wall should have 8.0 m²");

        // Should have a warning about the zero-area construction.
        let zero_warnings: Vec<&String> = result
            .warnings
            .iter()
            .filter(|w| w.contains("c-zero") && w.contains("0 m²"))
            .collect();
        assert!(
            !zero_warnings.is_empty(),
            "Should warn about zero area construction. Warnings: {:?}",
            result.warnings
        );
    }

    #[test]
    fn test_grouping_same_type_constructions() {
        // 3 constructions with same revit_type_name, boundary_type, and orientation
        // should be merged into 1 with summed area.
        let input = ThermalImport {
            version: "1.0".to_string(),
            source: "test".to_string(),
            exported_at: "2026-04-08".to_string(),
            project_name: Some("Grouping Test".to_string()),
            rooms: vec![
                ThermalRoom {
                    id: "r1".to_string(),
                    revit_id: None,
                    name: "Woonkamer".to_string(),
                    room_type: ThermalRoomType::Heated,
                    level: None,
                    area_m2: Some(30.0),
                    height_m: Some(2.6),
                    volume_m3: None,
                    boundary_polygon: None,
                },
                ThermalRoom {
                    id: "r-out".to_string(),
                    revit_id: None,
                    name: "Buiten".to_string(),
                    room_type: ThermalRoomType::Outside,
                    level: None,
                    area_m2: None,
                    height_m: None,
                    volume_m3: None,
                    boundary_polygon: None,
                },
            ],
            constructions: vec![
                ThermalConstruction {
                    id: "c1".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-out".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("N".to_string()),
                    gross_area_m2: 5.0,
                    revit_element_id: None,
                    revit_type_name: Some("Spouwmuur 300mm".to_string()),
                    layers: vec![
                        ThermalLayer {
                            material: "Kalkzandsteen".to_string(),
                            thickness_mm: 100.0,
                            distance_from_interior_mm: Some(0.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(1.0),
                        },
                        ThermalLayer {
                            material: "PIR isolatie".to_string(),
                            thickness_mm: 120.0,
                            distance_from_interior_mm: Some(100.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(0.023),
                        },
                        ThermalLayer {
                            material: "Luchtspouw".to_string(),
                            thickness_mm: 40.0,
                            distance_from_interior_mm: Some(220.0),
                            layer_type: ThermalLayerType::AirGap,
                            lambda: None,
                        },
                        ThermalLayer {
                            material: "Baksteen".to_string(),
                            thickness_mm: 100.0,
                            distance_from_interior_mm: Some(260.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(0.9),
                        },
                    ],
                },
                ThermalConstruction {
                    id: "c2".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-out".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("E".to_string()),
                    gross_area_m2: 8.0,
                    revit_element_id: None,
                    revit_type_name: Some("Spouwmuur 300mm".to_string()),
                    layers: vec![
                        ThermalLayer {
                            material: "Kalkzandsteen".to_string(),
                            thickness_mm: 100.0,
                            distance_from_interior_mm: Some(0.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(1.0),
                        },
                        ThermalLayer {
                            material: "PIR isolatie".to_string(),
                            thickness_mm: 120.0,
                            distance_from_interior_mm: Some(100.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(0.023),
                        },
                        ThermalLayer {
                            material: "Luchtspouw".to_string(),
                            thickness_mm: 40.0,
                            distance_from_interior_mm: Some(220.0),
                            layer_type: ThermalLayerType::AirGap,
                            lambda: None,
                        },
                        ThermalLayer {
                            material: "Baksteen".to_string(),
                            thickness_mm: 100.0,
                            distance_from_interior_mm: Some(260.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(0.9),
                        },
                    ],
                },
                ThermalConstruction {
                    id: "c3".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-out".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("W".to_string()),
                    gross_area_m2: 7.0,
                    revit_element_id: None,
                    revit_type_name: Some("Spouwmuur 300mm".to_string()),
                    layers: vec![
                        ThermalLayer {
                            material: "Kalkzandsteen".to_string(),
                            thickness_mm: 100.0,
                            distance_from_interior_mm: Some(0.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(1.0),
                        },
                        ThermalLayer {
                            material: "PIR isolatie".to_string(),
                            thickness_mm: 120.0,
                            distance_from_interior_mm: Some(100.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(0.023),
                        },
                        ThermalLayer {
                            material: "Luchtspouw".to_string(),
                            thickness_mm: 40.0,
                            distance_from_interior_mm: Some(220.0),
                            layer_type: ThermalLayerType::AirGap,
                            lambda: None,
                        },
                        ThermalLayer {
                            material: "Baksteen".to_string(),
                            thickness_mm: 100.0,
                            distance_from_interior_mm: Some(260.0),
                            layer_type: ThermalLayerType::Solid,
                            lambda: Some(0.9),
                        },
                    ],
                },
            ],
            openings: vec![],
            open_connections: vec![],
        };

        let result = map_thermal_import(input);
        let room = &result.project.rooms[0];

        // 3 constructions with same type should be grouped into 1.
        let masonry: Vec<&ConstructionElement> = room
            .constructions
            .iter()
            .filter(|c| c.material_type == MaterialType::Masonry)
            .collect();
        assert_eq!(
            masonry.len(),
            1,
            "3 same-type constructions should be grouped into 1. Got: {:?}",
            masonry.iter().map(|c| &c.description).collect::<Vec<_>>()
        );

        // Total area should be 5 + 8 + 7 = 20.
        assert!(
            (masonry[0].area - 20.0).abs() < 0.01,
            "Grouped area should be 20.0, got {}",
            masonry[0].area
        );

        // Should have a grouping info warning.
        let group_warnings: Vec<&String> = result
            .warnings
            .iter()
            .filter(|w| w.contains("samengevoegd"))
            .collect();
        assert!(
            !group_warnings.is_empty(),
            "Should have a grouping info message. Warnings: {:?}",
            result.warnings
        );
    }

    #[test]
    fn test_sfb_based_naming() {
        let import = load_fixture();
        let result = map_thermal_import(import);

        let room_0 = result
            .project
            .rooms
            .iter()
            .find(|r| r.id == "room-0")
            .expect("room-0 not found");

        // constr-0: Exterior Wall with layers [Gipsplaat, Minerale wol, Luchtspouw, Baksteen]
        // → SfB 21, layers: Gips, MW, Spouw, Klinker → "21_Gips_MW_Spouw_Klinker"
        let ext_wall = room_0
            .constructions
            .iter()
            .find(|c| {
                c.boundary_type == BoundaryType::Exterior
                    && c.material_type == MaterialType::Masonry
                    && c.vertical_position == VerticalPosition::Wall
            })
            .expect("Should have exterior masonry wall");
        assert_eq!(
            ext_wall.description, "21_Gips_MW_Spouw_Klinker",
            "Exterior wall should have SfB-based name"
        );

        // constr-1: UnheatedSpace Wall with layers [Gipsplaat, Kalkzandsteen, Gipsplaat]
        // → SfB 22, layers: Gips, KZS, Gips → "22_Gips_KZS_Gips"
        let unheated_wall = room_0
            .constructions
            .iter()
            .find(|c| {
                c.boundary_type == BoundaryType::UnheatedSpace
                    && c.material_type == MaterialType::Masonry
            })
            .expect("Should have unheated space masonry wall");
        assert_eq!(
            unheated_wall.description, "22_Gips_KZS_Gips",
            "Unheated wall should have SfB-based name"
        );

        // constr-2: Ground Floor with layers [Tegels, Dekvloer, EPS isolatie, Beton]
        // → SfB 23, layers: Tegels, Dekvloer, EPS, Beton → "23_Tegels_Dekvloer_EPS_Beton"
        let ground_floor = room_0
            .constructions
            .iter()
            .find(|c| {
                c.boundary_type == BoundaryType::Ground
                    && c.material_type == MaterialType::Masonry
            })
            .expect("Should have ground floor element");
        assert_eq!(
            ground_floor.description, "23_Tegels_Dekvloer_EPS_Beton",
            "Ground floor should have SfB-based name"
        );

        // room-2: constr-4 is Exterior Roof with no layers → just "27"
        let room_2 = result
            .project
            .rooms
            .iter()
            .find(|r| r.id == "room-2")
            .expect("room-2 not found");
        let roof = room_2
            .constructions
            .iter()
            .find(|c| {
                c.vertical_position == VerticalPosition::Ceiling
                    && c.material_type == MaterialType::Masonry
            })
            .expect("Should have roof element");
        assert_eq!(
            roof.description, "27",
            "Roof without layers should just be SfB code"
        );
    }

    #[test]
    fn test_different_types_not_grouped() {
        // Constructions with different revit_type_name or different boundary_type
        // should NOT be grouped.
        let input = ThermalImport {
            version: "1.0".to_string(),
            source: "test".to_string(),
            exported_at: "2026-04-08".to_string(),
            project_name: Some("No-Group Test".to_string()),
            rooms: vec![
                ThermalRoom {
                    id: "r1".to_string(),
                    revit_id: None,
                    name: "Kamer".to_string(),
                    room_type: ThermalRoomType::Heated,
                    level: None,
                    area_m2: Some(20.0),
                    height_m: Some(2.6),
                    volume_m3: None,
                    boundary_polygon: None,
                },
                ThermalRoom {
                    id: "r-out".to_string(),
                    revit_id: None,
                    name: "Buiten".to_string(),
                    room_type: ThermalRoomType::Outside,
                    level: None,
                    area_m2: None,
                    height_m: None,
                    volume_m3: None,
                    boundary_polygon: None,
                },
                ThermalRoom {
                    id: "r-unheated".to_string(),
                    revit_id: None,
                    name: "Berging".to_string(),
                    room_type: ThermalRoomType::Unheated,
                    level: None,
                    area_m2: Some(5.0),
                    height_m: Some(2.6),
                    volume_m3: None,
                    boundary_polygon: None,
                },
            ],
            constructions: vec![
                // Same revit_type_name but different boundary_type → should NOT group.
                ThermalConstruction {
                    id: "c1".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-out".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("N".to_string()),
                    gross_area_m2: 5.0,
                    revit_element_id: None,
                    revit_type_name: Some("Spouwmuur".to_string()),
                    layers: vec![],
                },
                ThermalConstruction {
                    id: "c2".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-unheated".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("S".to_string()),
                    gross_area_m2: 6.0,
                    revit_element_id: None,
                    revit_type_name: Some("Spouwmuur".to_string()),
                    layers: vec![],
                },
                // Different revit_type_name, same boundary_type → should NOT group.
                ThermalConstruction {
                    id: "c3".to_string(),
                    room_a: "r1".to_string(),
                    room_b: "r-out".to_string(),
                    orientation: ThermalOrientation::Wall,
                    compass: Some("E".to_string()),
                    gross_area_m2: 4.0,
                    revit_element_id: None,
                    revit_type_name: Some("Binnenwand 100mm".to_string()),
                    layers: vec![],
                },
            ],
            openings: vec![],
            open_connections: vec![],
        };

        let result = map_thermal_import(input);
        let room = &result.project.rooms[0];

        // Should have 3 separate masonry elements (nothing grouped).
        let masonry: Vec<&ConstructionElement> = room
            .constructions
            .iter()
            .filter(|c| c.material_type == MaterialType::Masonry)
            .collect();
        assert_eq!(
            masonry.len(),
            3,
            "3 different constructions should remain separate. Got: {:?}",
            masonry.iter().map(|c| (&c.description, c.area)).collect::<Vec<_>>()
        );

        // No grouping warnings (nothing was merged).
        let group_warnings: Vec<&String> = result
            .warnings
            .iter()
            .filter(|w| w.contains("samengevoegd"))
            .collect();
        assert!(
            group_warnings.is_empty(),
            "Should have no grouping messages. Warnings: {:?}",
            result.warnings
        );
    }
}
