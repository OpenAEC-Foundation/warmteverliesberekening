# IFC Herontwerp — Volledig Onderzoeksverslag

> **Datum:** 2026-03-11
> **Doel:** Onderzoek afronden naar IFC libraries en architectuur voor de warmteverliesberekening tool
> **Status:** Onderzoek afgerond, klaar voor implementatie

---

## Inhoudsopgave

1. [Samenvatting & Aanbevelingen](#1-samenvatting--aanbevelingen)
2. [Huidige Situatie](#2-huidige-situatie)
3. [Gebruikerswensen](#3-gebruikerswensen)
4. [IFC Parsing Libraries](#4-ifc-parsing-libraries)
5. [3D Viewer Libraries](#5-3d-viewer-libraries)
6. [IFC Export/Creation Libraries](#6-ifc-exportcreation-libraries)
7. [Aanbevolen Architectuur](#7-aanbevolen-architectuur)
8. [Space Boundary Strategie](#8-space-boundary-strategie)
9. [IFC Standaarden & Property Sets](#9-ifc-standaarden--property-sets)
10. [Implementatieplan](#10-implementatieplan)
11. [Risico's & Mitigatie](#11-risicos--mitigatie)
12. [Bronnen](#12-bronnen)

---

## 1. Samenvatting & Aanbevelingen

### Drie kernbeslissingen

| Onderdeel | Huidige keuze | Nieuwe keuze | Reden |
|-----------|--------------|--------------|-------|
| **IFC Parsing** | web-ifc (WASM, browser) | **IfcOpenShell (Python, Tauri sidecar)** | web-ifc is onbetrouwbaar, mist boundary support |
| **3D Viewer** | ThatOpen + Three.js | **Handhaven**, R3F migratie later | Huidige viewer werkt, nieuwe IFC-pipeline ernaast bouwen |
| **IFC Export** | IFCX (JSON, experimenteel) | **Dual: IFC4 (IfcOpenShell) + IFCX (custom namespaces)** | IFC4 voor interoperabiliteit, IFCX voor isso51:: data |

### Kernarchitectuur

```
┌──────────────────────────────────────────────────────┐
│  React Frontend                                      │
│  ├─ Bestaande 3D viewer (ThatOpen + Three.js)        │
│  ├─ IFCX export (isso51:: custom namespaces)         │
│  ↕ Tauri IPC (JSON)                                  │
│  Rust Backend (isso51-core berekeningen)             │
│  ↕ Sidecar subprocess (JSON via stdin/stdout)        │
│  Python IfcOpenShell binary (PyInstaller .exe)       │
│  ↕ Filesystem                                        │
│  .ifc bestanden (IFC4 SPF) + .ifcx (ISSO 51 data)   │
└──────────────────────────────────────────────────────┘
```

### Strategie: ernaast bouwen, niet vervangen

De huidige 3D viewer (ThatOpen + Three.js) en IFCX-code **blijven intact**. De IfcOpenShell sidecar wordt als nieuwe pipeline ernaast gebouwd. Dit betekent:
- Geen risico op regressie in bestaande functionaliteit
- Incrementeel testen van de nieuwe IFC-pipeline
- R3F viewer-migratie kan later als aparte verbetering
- Bestaande IFCX-code blijft het primaire formaat voor isso51:: custom data

---

## 2. Huidige Situatie

### Wat werkt

| Component | Technologie | Status |
|-----------|-------------|--------|
| IFC import (spaces → 2D polygons) | web-ifc WASM | Werkt, maar onbetrouwbaar |
| Wall type extractie + material matching | web-ifc + eigen matcher | Werkt goed |
| 3D viewer (spaces) | ThatOpen + Three.js | Werkt, maar zwaar |
| JSON import/export | Eigen code | Werkt goed |
| IFCX document creation | Eigen TypeScript | Werkt, niet in UI |
| ISSO 51 IFCX overlays | Eigen TypeScript | Werkt |
| Construction library linking | Zustand stores | Werkt goed |

### Wat mist

- IFC export naar IFC4 SPF formaat (de standaard die andere tools lezen)
- IfcWindow/IfcDoor extractie uit IFC
- IfcRelSpaceBoundary parsing (1st en 2nd level)
- Betrouwbare IFC parsing (web-ifc faalt op simpele bestanden)
- Modeller ↔ Project store synchronisatie

### Bestaande IFC-bestanden in codebase

| Bestand | Omvang | Doel |
|---------|--------|------|
| `ifc-import.ts` | 58 KB | IfcSpace extractie + geometrie parsing |
| `ifc-wall-types.ts` | 8.9 KB | IfcWallType + material layer extractie |
| `ifcx-builder.ts` | 11 KB | ModelRoom ↔ IFCX conversie |
| `ifcx.ts` | 5.0 KB | IFCX core types + helpers |
| `isso51-ifcx.ts` | 9.8 KB | ISSO 51 berekening overlays |
| `ifcMaterialMatcher.ts` | 5.1 KB | IFC material → database matching |
| `FloorCanvas3D.tsx` | ~839 regels | 3D viewer + section planes |
| `IfcWallTypeReview.tsx` | ~459 regels | Material match review UI |

---

## 3. Gebruikerswensen

1. Multiple importers: JSON, IFC, handmatig tekenen (Vabi-stijl)
2. IFC import leest spaces + grensvlakken (wanden, vloeren, daken)
3. Spaces in 3D viewer, grensvlakken NIET gevisualiseerd
4. Grensvlakken → projectbibliotheek → Rc-waarde tool
5. Grensvlak = combinatie wandlagen + spouw, of plafond/vloer/dak
6. IFC export met geüpdatete grensvlakken (mesh/brep met U-waarde)
7. Wandopeningen als simpel vlak (geen gedetailleerde kozijnen)
8. web-ifc werkt niet goed genoeg, zelfs simpele IFC met spaces faalt

---

## 4. IFC Parsing Libraries

### Vergelijkingstabel

| Library | Taal | Licentie | Onderhoud | IfcSpace | Boundaries | Geometrie | Integratie | Aanbevolen? |
|---------|------|----------|-----------|----------|------------|-----------|------------|-------------|
| **IfcOpenShell** | C++/Python | LGPL-3.0 | Zeer actief (v0.8.4, jan 2026) | Volledig | Volledig (dedicated API) | Volledig (OpenCASCADE) | Tauri sidecar | **JA** |
| web-ifc | C++/WASM | MPL-2.0 | Actief maar instabiel | Beperkt | Geen | Viewer-gericht | Huidige (browser) | NEE |
| xBIM | C# / .NET | CDDL | Actief (v6.0) | Volledig | Volledig | Windows-only | .NET sidecar | NEE |
| IFC++ | C++ | MIT | Gearchiveerd | Was aanwezig | Onbekend | Qt/OSG | C++ FFI | NEE |
| ifc_rs | Rust | MIT | Alpha (v0.1.0) | Onbekend | Nee | Nee | Native Rust | NEE (toekomst) |
| ifc-lite | Rust/WASM | Open source | Actief (2025) | Ja | Beperkt | Ja | WASM/Rust | NEE (toekomst) |
| bimifc-parser | Rust | MPL-2.0 | Actief | Onbekend | Onbekend | Nee | Native Rust | NEE |

### IfcOpenShell — Gedetailleerd

**Waarom IfcOpenShell de duidelijke winnaar is:**

1. **Boundary API**: Dedicated `ifcopenshell.api.boundary` module met:
   - `assign_connection_geometry()` — boundary aanmaken met geometrie
   - `copy_boundary()`, `remove_boundary()`, `edit_attributes()`
   - Ondersteuning voor 1st EN 2nd level boundaries
   - `relating_space`, `related_building_element`, `parent_boundary`, `corresponding_boundary`

2. **Geometry extractie**: `create_shape()` levert vertices, edges, faces of OpenCASCADE BRep. Multi-threaded geometry iterator voor grote bestanden. `IfcConvert` CLI exporteert naar OBJ, DAE, GLB, STP, SVG.

3. **Volledige IFC schema support**: IFC2x3, IFC4 Add2, IFC4x1, IFC4x2, IFC4x3 Add2.

4. **Bewezen**: 15+ jaar ontwikkeling, honderden contributors, gebruikt door BlenderBIM/Bonsai, FreeCAD BIM, en commerciële tools.

5. **Community**: Actieve OSArch community, IfcOpenShell Academy, uitgebreide docs.

**Integratie via Tauri sidecar:**
```
[Tauri Rust backend]
    ↓ Command::new_sidecar("ifc-parser")
    ↓ JSON payload via stdin
[ifc-parser.exe (PyInstaller bundled)]
    ↓ IfcOpenShell parsing
    ↓ JSON result via stdout
[Tauri Rust backend]
    ↓ Deserialize naar Rust structs
[Frontend via IPC]
```

**Performance**: Openen van een ~450MB bestand duurt ~1m40s. Typische woongebouw-IFC's (<50MB) zijn binnen seconden geparsed.

**Bundlegrootte sidecar**: ~30-50MB als PyInstaller .exe (Python + IfcOpenShell + dependencies).

### Rust-native alternatieven — Toekomst

**ifc-lite** (louistrue) is het meest veelbelovend:
- Rust WASM parser (~650KB / ~260KB gzipped)
- 2.6x sneller dan web-ifc
- IFC4X3 + IFC5 support
- Three.js en Babylon.js viewer examples

Maar mist nog: dedicated boundary API, betrouwbaarheid met diverse praktijk-IFC's, community.

**Advies**: Houd `ifc-lite` en `ifc_rs` in de gaten. Als ze volwassen worden (1-2 jaar), kunnen ze de Python sidecar vervangen.

---

## 5. 3D Viewer Libraries

### Vergelijkingstabel

| Viewer | Licentie | Bundle | React integratie | Custom geometrie | 500 volumes | Tauri | Aanbevolen? |
|--------|----------|--------|-----------------|-----------------|-------------|-------|-------------|
| **Three.js + R3F** | MIT | ~250KB | Uitstekend | Uitstekend | Triviaal | Bewezen | **JA** |
| ThatOpen | MIT | ~3MB+ | Matig | Slecht | Goed | Werkt | NEE |
| xeokit | **AGPL** | ~500KB | Matig | Goed | Uitstekend | Onbekend | NEE |
| BabylonJS | Apache 2.0 | ~1.4MB | Redelijk | Goed | Uitstekend | Waarschijnlijk | NEE |
| CesiumJS | Apache 2.0 | ~1MB+ | Slecht | Overbodig | Overkill | Nee | NEE |
| Speckle | Apache 2.0 | ~500KB+ | Slecht | Slecht | Goed | Nee | NEE |
| Bevy/wgpu | MIT | ~2MB+ WASM | Slecht | Goed | Uitstekend | Experimenteel | NEE |

### Three.js + React Three Fiber — Gedetailleerd

**Waarom R3F de duidelijke winnaar is:**

1. **Precies het juiste gereedschap**: De viewer hoeft geen IFC te parsen. Geometrie komt vooraf geëxtraheerd als polygonen. R3F toont simpele 3D volumes met selectie — precies waarvoor het ontworpen is.

2. **Declaratieve React API**: Een kamer renderen is letterlijk:
   ```tsx
   <mesh onClick={handleSelect} onPointerOver={handleHover}>
     <extrudeGeometry args={[shape, { depth: height }]} />
     <meshStandardMaterial color={selected ? 'orange' : 'steelblue'} transparent opacity={0.7} />
   </mesh>
   ```

3. **Bewezen in Tauri**: Tauri + R3F is een gedocumenteerde en werkende combinatie. WebView2 (Windows) ondersteunt WebGL2 + WebGPU.

4. **Ecosysteem**: `@react-three/drei` biedt OrbitControls, Text, Html overlays, performance tools, etc. ~584.000 wekelijkse npm downloads, 28.000+ GitHub stars.

5. **WebGPU ready**: Sinds Three.js r171 is WebGPU production-ready met automatische WebGL2 fallback.

6. **Minimale migratie**: Three.js staat al in `package.json`. Verwijder ThatOpen/web-ifc, voeg R3F toe.

**Toekomstige migratie (niet nu):**
- **Toevoegen**: `@react-three/fiber`, `@react-three/drei`
- **Verwijderen**: `@thatopen/components`, `@thatopen/fragments`, `web-ifc` (+ postinstall WASM-kopieerscript)
- **Herschrijven**: `FloorCanvas3D.tsx` → declaratieve R3F `<Canvas>` component
- **Behouden**: Alle logica voor mesh generatie (polygon extrusie, surface IDs, etc.)

### Huidige viewer: handhaven

De bestaande ThatOpen + Three.js viewer **blijft voorlopig intact**. De R3F-migratie is een toekomstige optimalisatie die los staat van de IFC-pipeline vernieuwing. Redenen:
- Viewer werkt — geen reden om werkende code te vervangen tijdens een grote IFC-refactor
- Risicospreiding: niet alles tegelijk migreren
- R3F-migratie kan later als aparte PR/sprint

### Bekende nadelen van ThatOpen (voor later)

- web-ifc WASM binary (~2.5MB) wordt altijd geladen, ook als je alleen custom geometry toont
- ThatOpen is gebouwd rond IFC-bestanden laden — custom geometry toevoegen gaat tegen de grain in
- Fragments-systeem is in transitie (huidige componenten werken niet met nieuwste Fragments)
- Memory-access-out-of-bounds fouten in web-ifc WASM
- `unsafe-eval` CSP-vereiste (security probleem)
- Imperatieve API past slecht bij React

---

## 6. IFC Export/Creation Libraries

### Vergelijkingstabel

| Library | Taal | Create | Modify | Property Sets | Boundaries | IFCX | Integratie | Aanbevolen? |
|---------|------|--------|--------|--------------|------------|------|------------|-------------|
| **IfcOpenShell** | Python | Volledig | Volledig | Uitstekend | Volledig | Nee | Sidecar | **JA** |
| xBIM | .NET | Volledig | Volledig | Goed | Basis | Nee | .NET sidecar | NEE |
| IFC++ | C++ | Ja | Ja | Onbekend | Onbekend | Nee | C++ FFI | NEE |
| ifc_rs | Rust | Basis | Onbekend | Nee | Nee | Nee | Native | NEE (toekomst) |
| IFCX | JSON | N.v.t. | N.v.t. | N.v.t. | N.v.t. | **JA** | Frontend | Secundair |
| Handmatig SPF | Elke taal | Beperkt | Moeilijk | Handmatig | Handmatig | Nee | Direct | NEE |

### IfcOpenShell Export — Gedetailleerd

**High-level API voor IFC creation:**
```python
# Nieuw bestand
model = ifcopenshell.api.project.create_file(version="IFC4")
project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject")

# Spatial hierarchy
site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite")
building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding")
storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey")

# Ruimte met geometrie
space = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSpace")

# Thermische property sets
pset = ifcopenshell.api.pset.add_pset(model, product=wall, name="Pset_WallCommon")
ifcopenshell.api.pset.edit_pset(model, pset=pset, properties={
    "ThermalTransmittance": 0.25  # W/(m²·K) — automatisch IfcThermalTransmittanceMeasure
})

# Space boundaries
boundary = ifcopenshell.api.boundary.assign_connection_geometry(model, ...)
ifcopenshell.api.boundary.edit_attributes(model, boundary, attributes={
    "RelatingSpace": space,
    "RelatedBuildingElement": wall,
    "InternalOrExternalBoundary": "EXTERNAL",
    "PhysicalOrVirtualBoundary": "PHYSICAL"
})

model.write("output.ifc")
```

**Modify-mogelijkheden**: Volledig read-modify-write. Bestaand IFC openen, entities wijzigen, properties toevoegen, terugschrijven.

**Ondersteunde formaten**: IFC-SPF (.ifc), IFCXML, IFCJSON, IFCHDF5, IFCSQL.

### IFCX — Essentieel voor custom namespaces

De bestaande IFCX-code (`ifcx.ts`, `ifcx-builder.ts`, `isso51-ifcx.ts`) is **niet optioneel** maar een kernonderdeel:

**Waarom IFCX nodig is:**
- Custom `isso51::` namespace voor ISSO 51-specifieke berekening resultaten (transmissie, ventilatie, opwarmtoeslag per ruimte)
- Custom `modeller::` namespace voor polygon/hoogte data die niet in standaard IFC past
- IFC4 SPF heeft geen mechanisme voor willekeurige custom namespaces — property sets zijn beperkt tot IFC-gedefinieerde types
- IFCX's ECS-architectuur maakt onbeperkte custom componenten mogelijk
- JSON-based: makkelijk te genereren, lezen en debuggen vanuit TypeScript

**Dual-format export strategie:**

| Formaat | Doel | Inhoud |
|---------|------|--------|
| **IFC4 SPF** (.ifc) | Interoperabiliteit met andere BIM tools | Spatial hierarchy, geometrie, standaard Psets (ThermalTransmittance etc.) |
| **IFCX** (.ifcx) | Volledige ISSO 51 data + custom namespaces | Alles uit IFC4 + isso51:: resultaten, modeller:: data, constructie-details |

De IFCX-export is het "rijke" formaat dat alle berekening data bevat. De IFC4-export is het "compatibele" formaat dat andere tools kunnen lezen. Beide worden gegenereerd uit dezelfde brondata.

**Toekomstperspectief**: Als IFCX/IFC5 volwassen wordt en tools het gaan ondersteunen, kan de IFC4-export vervallen.

---

## 7. Aanbevolen Architectuur

### Overzicht

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React Frontend                               │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │ 3D Viewer    │  │ Modeller UI  │  │ Berekening UI          │    │
│  │ (ThatOpen)   │  │ (2D/3D)      │  │ (resultaten/export)    │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────────┘    │
│         │                  │                    │                    │
│  ┌──────┴──────────────────┴────────────────────┴───────────────┐   │
│  │              Zustand Stores (modeller, project, catalogue)   │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │ Tauri IPC                            │
├──────────────────────────────┼──────────────────────────────────────┤
│                        Rust Backend                                 │
│                              │                                      │
│  ┌───────────────────────────┴──────────────────────────────────┐   │
│  │  isso51-core (berekeningen)                                  │   │
│  │  Tauri commands (IPC handlers)                               │   │
│  └───────────┬──────────────────────────────┬───────────────────┘   │
│              │ sidecar (JSON stdin/stdout)   │                      │
│  ┌───────────┴──────────┐  ┌────────────────┴──────────────────┐   │
│  │ ifc-import sidecar   │  │ ifc-export sidecar                │   │
│  │ (IfcOpenShell Python) │  │ (IfcOpenShell Python)            │   │
│  │                       │  │                                   │   │
│  │ Input:  .ifc bestand  │  │ Input:  JSON (spaces, resultaten)│   │
│  │ Output: JSON (rooms,  │  │ Output: .ifc bestand (IFC4)      │   │
│  │   boundaries, walls)  │  │                                   │   │
│  └───────────────────────┘  └───────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Dataflow: IFC Import (nieuw)

```
.ifc bestand
    ↓ [Tauri file dialog]
Rust backend ontvangt pad
    ↓ [Command::new_sidecar("ifc-tool")]
Python IfcOpenShell sidecar:
    1. Open IFC bestand
    2. Extract IfcSpace entities + 2D polygon geometrie
    3. Extract IfcRelSpaceBoundary (als aanwezig)
    4. Extract IfcWallType + material layers
    5. Extract IfcWindow/IfcDoor (NIEUW)
    ↓ JSON output via stdout
Rust backend deserializeert
    ↓ [Tauri IPC]
Frontend ontvangt JSON:
    - rooms: ModelRoom[]
    - boundaries: SpaceBoundary[] (NIEUW)
    - wallTypes: IfcWallTypeInfo[]
    - windows: ModelWindow[] (NIEUW)
    - doors: ModelDoor[] (NIEUW)
    ↓ [Zustand stores]
modellerStore.importModel()
    ↓ [bestaande 3D viewer]
3D visualisatie
```

### Dataflow: Export (dual-format)

```
Berekening resultaten (isso51-core)
    + ModelRoom[] + ModelWindow[] + ModelDoor[]
    + ProjectConstruction[] + wallConstructions

    ┌─── Pad A: IFC4 SPF (interoperabiliteit) ───────────────────┐
    │ ↓ [Serialize naar JSON]                                     │
    │ Rust backend → sidecar("ifc-tool export")                   │
    │ Python IfcOpenShell:                                        │
    │   1. Spatial hierarchy (Project→Site→Building→Storeys)      │
    │   2. IfcSpace + extruded geometry per ruimte                │
    │   3. IfcWall/Slab/Roof + Pset_*Common (ThermalTransmittance│
    │   4. IfcWindow/IfcDoor + Pset                               │
    │   5. IfcRelSpaceBoundary2ndLevel per grensvlak              │
    │   6. Pset_SpaceThermalDesign per ruimte                     │
    │ ↓ .ifc bestand (leesbaar door Solibri, BIMcollab, etc.)    │
    └─────────────────────────────────────────────────────────────┘

    ┌─── Pad B: IFCX (volledige ISSO 51 data) ──────────────────┐
    │ ↓ [Frontend TypeScript — bestaande code]                    │
    │ modelToIfcx() + createCalculationOverlay()                  │
    │   + isso51:: namespace (transmissie, ventilatie, opwarmtoesl│
    │   + modeller:: namespace (polygonen, hoogtes)               │
    │   + isso51::construction:: (lagen, lambda, Rc)              │
    │ ↓ .ifcx bestand (volledige berekening data)                │
    └─────────────────────────────────────────────────────────────┘
```

### Eén sidecar, twee functies

De Python sidecar kan zowel import als export afhandelen via een command argument:

```bash
# Import
ifc-tool.exe import --input model.ifc --output result.json

# Export
ifc-tool.exe export --input data.json --output output.ifc
```

Dit voorkomt twee aparte PyInstaller builds.

---

## 8. Space Boundary Strategie

### Het probleem

ISSO 51 warmteverliesberekening vereist grensvlakken (space boundaries) tussen ruimtes en bouwdelen. Dit zijn de oppervlaktes waardoor warmte verloren gaat. IFC kent hiervoor `IfcRelSpaceBoundary`, maar:

- **~60-70%** van IFC-bestanden bevat IfcSpace
- **~5-10%** bevat correcte 2nd level boundaries
- **Geen** kant-en-klare open-source tool genereert betrouwbaar 2nd level boundaries

### Gelaagde fallback-strategie

```
Stap 1: Lees IfcRelSpaceBoundary2ndLevel
        ↓ (niet aanwezig?)
Stap 2: Lees IfcRelSpaceBoundary 1st level → splits naar 2nd level
        ↓ (niet aanwezig?)
Stap 3: Bereken boundaries uit geometrie (Vabi-aanpak)
        ↓ (geometrie onvolledig?)
Stap 4: Handmatige invoer/correctie in UI
```

**Stap 1 — 2nd level boundaries lezen:**
- IfcOpenShell's `boundary` API kan deze direct uitlezen
- Inclusief `InternalOrExternalBoundary`, `PhysicalOrVirtualBoundary`, `ConnectionGeometry`
- Paired boundaries via `CorrespondingBoundary`

**Stap 2 — 1st level splitsen:**
- 1st level boundaries geven één vlak per wand-ruimte combinatie
- Splitsen naar 2nd level: elk vlak wordt twee vlakken (één per zijde van de wand)
- IfcOpenShell + OpenCASCADE kan dit berekenen

**Stap 3 — Vabi-aanpak (zelf berekenen):**
- Zoek per IfcSpace de nabijgelegen IfcWall/IfcSlab/IfcRoof entities
- Bepaal het grensvlak uit de geometrische overlap
- Middelpuntafmetingen: de middenlijn van de wand bepaalt het grensvlak
- Boolean operaties zijn onbetrouwbaar → gebruik proximity-based matching
- Maximale capaciteit: ~500 spaces en/of 500 windows (Vabi-limiet)

**Stap 4 — Handmatige correctie:**
- UI voor het toevoegen/wijzigen van grensvlakken
- Tabel per ruimte met wanden, oppervlaktes, grenscondities
- Override-mogelijkheid voor automatisch gegenereerde boundaries

### Referentie-implementaties

| Tool | Aanpak | Status |
|------|--------|--------|
| BlenderBIM/Bonsai | 2nd level boundary generatie in IfcOpenShell | Experimenteel |
| LBNL SBT-1 | Space Boundary Tool | Bevroren sinds 2014 |
| Simplebim | Space Boundary add-on | Commercieel, Windows-only |
| IBPSA 2021 paper | Algoritme met IfcOpenShell + OpenCASCADE | Academisch |

---

## 9. IFC Standaarden & Property Sets

### Relevante Model View Definitions (MVDs)

- **Space Boundary Add-on View**: Voegt space-element relaties toe voor thermische/energie analyse
- **Coordination View 2.0**: Algemene BIM coördinatie (basis spatial structure)

### Standaard thermische property sets

| Property Set | Geldt voor | Belangrijkste property | IFC Type |
|-------------|-----------|----------------------|----------|
| `Pset_WallCommon` | IfcWall | `ThermalTransmittance` (W/m²K) | IfcThermalTransmittanceMeasure |
| `Pset_SlabCommon` | IfcSlab | `ThermalTransmittance` | IfcThermalTransmittanceMeasure |
| `Pset_RoofCommon` | IfcRoof | `ThermalTransmittance` | IfcThermalTransmittanceMeasure |
| `Pset_WindowCommon` | IfcWindow | `ThermalTransmittance` | IfcThermalTransmittanceMeasure |
| `Pset_DoorCommon` | IfcDoor | `ThermalTransmittance` | IfcThermalTransmittanceMeasure |
| `Pset_SpaceThermalDesign` | IfcSpace | Design heating/cooling loads | Diverse |
| `Pset_SpaceThermalRequirements` | IfcSpace | Temperatuureisen | Diverse |

### Minimum Viable IFC Export

Vereiste entities voor een geldig IFC4-bestand met thermische resultaten:

1. `IfcProject` (exact één, verplicht)
2. `IfcUnitAssignment` (eenheden: meter, Kelvin, Watt)
3. `IfcGeometricRepresentationContext`
4. `IfcSite` → `IfcBuilding` → `IfcBuildingStorey` (spatial hiërarchie)
5. `IfcSpace` per ruimte (met optionele geometrie)
6. `IfcWall`/`IfcSlab`/`IfcRoof` per bouwdeel
7. `IfcRelSpaceBoundary` of `IfcRelSpaceBoundary2ndLevel` (space-element links)
8. `IfcPropertySet` + `IfcRelDefinesByProperties` (thermische waarden)

Space boundaries moeten een gesloten schil vormen per ruimte voor geldige energie-analyse.

### ISSO 51 specifieke properties (custom namespace)

Naast standaard IFC property sets, exporteren we ISSO 51-specifieke resultaten:

| Namespace | Inhoud |
|-----------|--------|
| `isso51::calc::transmission` | H_T (W/K), phi_T (W), Rc, U |
| `isso51::calc::ventilation` | phi_V (W), qi_spec (dm³/s/m²) |
| `isso51::calc::reheat` | phi_RH (W), f_RH |
| `isso51::calc::result` | phi_HL (W), phi_T, phi_V, phi_RH, theta_int |
| `isso51::construction` | Rc, U, name, libraryId |
| `isso51::construction::layers` | Per laag: name, thickness (mm), lambda, R |

**Waar komt dit terecht?**
- **IFCX-export**: Native ondersteuning via custom namespaces — dit is de primaire plek voor ISSO 51 data
- **IFC4-export**: Als custom `IfcPropertySet` entries (bijv. `ISSO51_TransmissionResult`) — beperkt maar compatibel
- De IFCX-export is het "complete" formaat; de IFC4-export bevat alleen standaard thermische properties

---

## 10. Platform Architectuur (bijgewerkt 2026-03-12)

### Kernprincipe: Modulaire componenten + IFCX

Alle componenten zijn **onafhankelijk herbruikbaar** en communiceren via **IFCX (IFC5 JSON)**.
IFCX is gekozen omdat het al JSON is en custom namespaces ondersteunt.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  IFC Parser  │     │  2D/3D       │     │  Andere tools   │
│  (Python)    │     │  Modeller    │     │  (Vabi, BAG...) │
└──────┬───────┘     └──────┬───────┘     └──────┬──────────┘
       │                    │                     │
       ▼                    ▼                     ▼
     IFCX                 IFCX                  IFCX
       │                    │                     │
       └────────────────────┼─────────────────────┘
                            ▼
                 ┌─────────────────────┐
                 │   isso51-core       │
                 │   (Rust engine)     │
                 │                     │
                 │   DLL / WASM / PyO3 │
                 │   / REST API        │
                 └──────────┬──────────┘
                            ▼
                    IFCX + isso51::calc::
```

### Componenten

| Component | Technologie | Herbruikbaar als | Communicatie |
|-----------|-------------|-----------------|--------------|
| **isso51-core** | Rust | Lib, DLL, WASM, PyO3, REST API | IFCX in/uit |
| **IFC Parser** | Python (IfcOpenShell) | CLI, microservice, Tauri sidecar | .ifc → IFCX |
| **2D/3D Modeller** | React/TypeScript | React component, standalone app | IFCX in/uit |
| **Web App** | React + Rust API | — | Orchestratie |
| **Desktop App** | Tauri | — | Bundelt alles |

### IFCX Namespaces

| Namespace | Eigenaar | Inhoud |
|-----------|----------|--------|
| `ifc::` | IFC standaard | Spatial hierarchy, geometrie, materialen |
| `modeller::` | Modeller | Polygonen, hoogtes, wanden, ramen, deuren |
| `isso51::` | Rekencore input | Ruimtefuncties, constructies, U-waarden, ventilatie |
| `isso51::calc::` | Rekencore output | Transmissie, ventilatie, opwarmtoeslag, totalen |

### isso51-core: puur rekenwerk

- **Geen** IFC/modeller/UI dependency
- Leest `isso51::` namespace uit IFCX
- Schrijft `isso51::calc::` namespace terug
- Bestaande `project.schema.json` / `result.schema.json` worden gemigreerd naar IFCX
- Kan als DLL in andere software geïntegreerd worden

### IFC Parser: apart component

- Python + IfcOpenShell, draait als **apart proces**
- Desktop: Tauri sidecar (`ifc-tool.exe`)
- Web: server-side microservice of subprocess
- Output: IFCX (niet bare JSON)
- Niet onderdeel van isso51-core

### 2D/3D Modeller: herbruikbare UI

- React component die in de browser draait
- Werkt met IFCX als dataformaat
- Kan geëmbed worden in andere apps
- Toont IFC import resultaten in 2D/3D
- Architecturaal los van warmteverlies-berekening

---

## 11. Implementatieplan (bijgewerkt 2026-03-12)

### Fase 1: IFC Parser (Python sidecar) ✅ GROTENDEELS KLAAR

**Doel:** IfcOpenShell-gebaseerde IFC import als standalone tool

| Stap | Taak | Status |
|------|------|--------|
| 1.1 | Python project opzetten (`ifc-tool/`) met IfcOpenShell | ✅ Klaar |
| 1.2 | Import: IfcSpace → polygonen, verdiepingen | ✅ Klaar |
| 1.3 | Storey clustering (nabije bouwlagen samenvoegen) | ✅ Klaar |
| 1.4 | Polygon simplificatie pipeline | ✅ Klaar |
| 1.5 | Shared edge detectie (binnenwanden herkennen) | ✅ Klaar |
| 1.6 | Gap closing (polygonen uitbreiden naar wandhartlijn) | ✅ Klaar |
| 1.7 | IfcWindow/IfcDoor extractie (hoogte, borstwering) | ✅ Klaar |
| 1.8 | IfcWallType + materiaallagen extractie | ✅ Klaar |
| 1.9 | PyInstaller bundeling als sidecar binary | ✅ Klaar |
| 1.10 | Tauri sidecar integratie (Rust commands) | ✅ Klaar |
| 1.11 | Output converteren naar IFCX (i.p.v. bare JSON) | ❌ Open |
| 1.12 | Export command: IFCX → IFC4 SPF | ❌ Open |

### Fase 2: IFCX als universeel formaat

**Doel:** IFCX reader/writer in Rust + migratie bestaande schemas

| Stap | Taak |
|------|------|
| 2.1 | IFCX parser/writer crate in Rust (`crates/isso51-ifcx/`) |
| 2.2 | isso51:: namespace definitie (welke properties) |
| 2.3 | Mapper: bestaande Project types ↔ IFCX isso51:: namespace |
| 2.4 | isso51-core accepteert IFCX input, produceert IFCX output |
| 2.5 | REST API endpoint voor IFCX berekening |
| 2.6 | IFC parser output converteren naar IFCX |

**Deliverable:** isso51-core leest/schrijft IFCX.

### Fase 3: Web-app IFC integratie

**Doel:** IFC import werkend in de web-app met modeller visualisatie

| Stap | Taak |
|------|------|
| 3.1 | IFC parser als server-side service (Docker container of subprocess) |
| 3.2 | REST endpoint: `POST /api/v1/ifc/import` (file upload → IFCX) |
| 3.3 | Frontend: IFC upload → server → IFCX → modeller store |
| 3.4 | Modeller toont geïmporteerde ruimtes in 2D/3D |
| 3.5 | Gebruiker koppelt constructies, past boundaries aan |
| 3.6 | Modeller → IFCX → isso51-core → resultaten |

**Deliverable:** Werkende IFC import + berekening in de web-app.

### Fase 4: Space Boundaries & Export

**Doel:** Gelaagde boundary-extractie + complete round-trip

| Stap | Taak |
|------|------|
| 4.1 | 2nd level boundary lezer in IFC parser |
| 4.2 | 1st level → 2nd level splitter |
| 4.3 | Geometrie-based boundary calculator (Vabi-aanpak) |
| 4.4 | Boundary UI in modeller (tabel, override, visualisatie) |
| 4.5 | IFC4 SPF export via IfcOpenShell (met thermal psets) |
| 4.6 | IFCX export met volledige isso51::calc:: resultaten |

**Deliverable:** Complete IFC import → berekening → export pipeline.

### Fase 5: Herbruikbaarheid & distributie

**Doel:** Componenten onafhankelijk inzetbaar maken

| Stap | Taak |
|------|------|
| 5.1 | isso51-core als DLL (C ABI via cbindgen) |
| 5.2 | isso51-core als WASM module |
| 5.3 | isso51-core als Python package (PyO3) |
| 5.4 | Modeller als standalone npm package |
| 5.5 | API documentatie + IFCX namespace specificatie |

### Toekomstig (niet in scope)

- R3F viewer migratie (ThatOpen → React Three Fiber)
- ISSO 53 (utiliteitsgebouwen)
- ISSO 57 (vloerverwarming dimensionering)
- Radiatorselectie + hydraulische balancering

---

## 11. Risico's & Mitigatie

| Risico | Impact | Kans | Mitigatie |
|--------|--------|------|-----------|
| PyInstaller sidecar te groot (>100MB) | Medium | Medium | Gebruik `--exclude-module` agressief, overweeg Nuitka als alternatief |
| IfcOpenShell geometry extractie traag voor grote bestanden | Medium | Laag | Multi-threaded iterator, progress feedback via sidecar |
| Space boundary generatie uit geometrie onbetrouwbaar | Hoog | Hoog | Start met lezer (stap 1-2), Vabi-aanpak is complexe R&D |
| R3F migratie breekt bestaande viewer features | Medium | Laag | Incremental migratie, feature flags |
| LGPL-3.0 licentie IfcOpenShell | Laag | Laag | Sidecar is apart binary, geen linking in onze code |
| Tauri sidecar werkt niet op alle platforms | Medium | Laag | Tauri v2 sidecar is bewezen patroon |

### Belangrijkste risico: Space Boundary Generatie

De Vabi-aanpak (Fase 3, stap 3.3) is verreweg het meest complexe onderdeel. Boolean operaties op IFC geometrie zijn notoir onbetrouwbaar. Aanbeveling:

1. **Start met de lezer** (stap 3.1-3.2) — dit dekt al ~5-10% van de bestanden
2. **Bouw de UI** (stap 3.4) — zodat gebruikers altijd handmatig kunnen corrigeren
3. **Implementeer de Vabi-aanpak incrementeel** — begin met simpele gevallen (rechte wanden, geen schuin dak)
4. **Gebruik proximity-matching** in plaats van boolean operaties

---

## 12. Bronnen

### IFC Parsing
- [IfcOpenShell GitHub](https://github.com/IfcOpenShell/IfcOpenShell)
- [IfcOpenShell Docs v0.8.4](https://docs.ifcopenshell.org/ifcopenshell-python.html)
- [IfcOpenShell Boundary API](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/boundary/index.html)
- [IfcOpenShell Geometry Processing](https://docs.ifcopenshell.org/ifcopenshell-python/geometry_processing.html)
- [IfcOpenShell Academy](https://academy.ifcopenshell.org/)
- [ThatOpen/engine_web-ifc GitHub](https://github.com/ThatOpen/engine_web-ifc)
- [ifc-lite GitHub](https://github.com/louistrue/ifc-lite)
- [ifc_rs GitHub](https://github.com/MetabuildDev/ifc_rs)

### 3D Viewers
- [React Three Fiber docs](https://r3f.docs.pmnd.rs/)
- [React Three Fiber GitHub (28k+ stars)](https://github.com/pmndrs/react-three-fiber)
- [@react-three/drei npm](https://www.npmjs.com/package/@react-three/drei)
- [Three.js ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html)
- [xeokit SDK](https://xeokit.io/) (AGPL — niet aanbevolen)
- [BabylonJS](https://doc.babylonjs.com/) (te zwaar voor deze use case)

### IFC Export
- [IfcOpenShell pset API](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/pset/index.html)
- [IfcOpenShell geometry creation](https://docs.ifcopenshell.org/ifcopenshell-python/geometry_creation.html)
- [IfcOpenShell Academy - Wall with Property Set](https://academy.ifcopenshell.org/posts/creating-a-simple-wall-with-property-set-and-quantity-information/)
- [IFC5/IFCX Development](https://github.com/buildingSMART/IFC5-development)

### IFC Standaarden
- [Pset_WallCommon (IFC4.3)](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_WallCommon.htm)
- [Pset_SpaceThermalDesign](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2/HTML/schema/ifcproductextension/pset/pset_spacethermaldesign.htm)
- [IfcRelSpaceBoundary2ndLevel](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcproductextension/lexical/ifcrelspaceboundary2ndlevel.htm)
- [Space Boundaries for Energy Analysis Implementation Guide](http://www.blis-project.org/IAI-MVD/documents/Space_Boundaries_for_Energy_Analysis_v1.pdf)
- [IBPSA 2021 - Automatic generation of 2nd level space boundaries](https://publications.ibpsa.org/conference/paper/?id=bs2021_30156)

### Tauri Integratie
- [Tauri v2 Sidecar Documentation](https://v2.tauri.app/develop/sidecar/)

### Space Boundaries
- [BlenderBIM IfcRelSpaceBoundaries Issue #1676](https://github.com/IfcOpenShell/IfcOpenShell/issues/1676)
- [LBNL Space Boundary Tool SBT-1](https://simulationresearch.lbl.gov/projects/space-boundary-tool) (bevroren)
- [IFC BuildingEnvExtractor (TU Delft)](https://github.com/tudelft3d/IFC_BuildingEnvExtractor)
