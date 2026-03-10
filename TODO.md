# TODO

## Deployment
- [x] Authentik application aanmaken voor `warmteverlies`
- [x] `frontend/.env.production` OIDC vars geactiveerd
- [x] OIDC login flow end-to-end testen
- [x] favicon toevoegen
- [x] CI/CD GitHub Actions workflow
- [x] Error handling: globale error banner in AppShell

## Bugs & correctheid
- [ ] **PerFloorArea infiltratie bug** — `room_load.rs` gebruikt `qi_spec_per_exterior_area()` ipv `qi_spec_per_floor_area()` voor `InfiltrationMethod::PerFloorArea`
- [ ] **BBL ventilatie magic numbers** — `bbl_minimum_ventilation_rate()` gebruikt literals ipv de gedefinieerde `BBL_QV_*` constanten
- [ ] **Runtime validatie server-responses** — `Projects.tsx`, `ConflictDialog.tsx` en `importExport.ts` casten blind naar Project type zonder validatie

## Code kwaliteit — Rust
- [ ] Constanten definiëren: `RHO_CP_AIR = 1.2`, `GROUND_CORRECTION_FACTOR = 1.45`, `R_SI_*`, `R_SE_*`
- [ ] DRY: `default_one()`/`default_true()` naar gedeeld module
- [ ] DRY: SQL upsert user naar gedeelde functie (handlers/user.rs + handlers/projects.rs)
- [ ] Dead code opruimen: `ventilation_requirement_living()`, `ventilation_requirement_wet_room()`, ongebruikte error varianten
- [ ] Infiltratie tabelnotatie vereenvoudigen (`0.08` ipv `0.08e-3 * 1000.0`)
- [ ] VentilationConfig validatie toevoegen (bijv. heat_recovery_efficiency > 1.0)
- [ ] `ConstructionType`/`ConstructionLayer`: implementeren of markeren als toekomstig

## Code kwaliteit — Frontend
- [ ] `MATERIAL_TYPE_LABELS` centraliseren naar `constants.ts` (nu 3x gedupliceerd)
- [ ] `niceMax()` utility centraliseren (nu 4x gedupliceerd in chart/svg bestanden)
- [ ] `FUNCTION_COLORS` centraliseren (nu 3x gedupliceerd in modeller)
- [ ] Report metadata duplicatie refactoren (`reportBuilder.ts` + `rcReportBuilder.ts`)
- [ ] Report constanten: `REPORT_BRAND`, `REPORT_AUTHOR` naar constants.ts
- [ ] `todayIso()` naar gedeelde utility
- [ ] `Library.tsx` (1052 regels) splitsen in component-bestanden
- [ ] `FloorCanvas.tsx` (1729 regels) splitsen: shapes, room rendering, drawing, utils
- [ ] Dead code verwijderen: `ModellerToolbar.tsx`, `DrawingToolsPanel.tsx` (vervangen door Ribbon)
- [ ] Dead code verwijderen: `getCatalogueByCategory()`, `getMaterialsByCategory()`, `getShortMaterialName()`
- [ ] Tool definities + snap options centraliseren (Ribbon + DrawingToolsPanel duplicatie)
- [ ] `ProjectBrowser` extraheren uit `Modeller.tsx` naar eigen bestand
- [ ] `wallDirection` functie centraliseren in `geometry.ts` (nu in PropertiesPanel + Modeller)
- [ ] `ConstructionPicker`/`ConstructionPickerInline` samenvoegen
- [ ] Store snapshot mist constructie-assignments (undo/redo verliest wall/floor/roof toewijzingen)
- [ ] Circle segments inconsistentie: `24` vs `48` in FloorCanvas.tsx
- [ ] Annotatie tools: implementeren of verwijderen uit UI (tekst/maatvoering/leider zijn stubs)

## App — features
- [x] OIDC login/logout op productie
- [x] Projecten opslaan/laden (vereist OIDC login)
- [x] Vertrekken invoer + bewerken
- [x] Resultaten weergave + grafieken
- [x] JSON import/export
- [x] Rc-calculator met laag-editor
- [x] Glaser-analyse + diagram
- [x] Jaarlijkse vochtbalans
- [x] Constructiebibliotheek + materialendatabase
- [x] PDF rapportgeneratie (warmteverlies + Rc)
- [x] Conflict detectie (optimistic locking)
- [x] Auto-save
- [x] Dark/light theme
- [ ] Materialen: inline bewerken van bestaande materialen
- [ ] Materialen: lambda nat waarden invullen voor standaardmaterialen
- [ ] Materialen: zoekwoorden bij custom materialen

## Roadmap — EASY modus (snelle berekening)
- [ ] BAG-data import: oppervlak, bouwjaar, adres ophalen via postcode + huisnummer
- [ ] Referentie-U-waarden per bouwjaar (forfaitair): automatisch constructies genereren
- [ ] BENG/UNIEC rapport import (EP-Online koppeling)
- [ ] Quick-calc wizard: 5-10 min berekening met minimale invoer

## Roadmap — PRO features
- [ ] ISSO 53 (utiliteitsgebouwen) naast ISSO 51 (woningen)
- [ ] ISSO 57 (vloerverwarming dimensionering)
- [ ] Vloerverwarming: lus-afstand, vloerbedekking, aanvoertemperatuur
- [ ] Radiatorselectie: merken-database (Radson, Henrad, Vasco, Jaga, Stelrad)
- [ ] Hydraulische balancering: circuits, leidinglengtes, debieten

## Roadmap — platform / modeller
- [x] 2D modeller: canvas met pan/zoom, grid, ruimte-polygonen, wanden, ramen, deuren
- [x] 3D modeller: geextrudeerde ruimtes, wanden, ramen, section planes, U-waarde kleuring
- [x] Ribbon toolbar (Revit-stijl) met Model/Annotatie/Beeld/Invoegen tabs
- [x] IFCX (IFC5 JSON) als intern bestandsformaat (code aanwezig, niet aangesloten in UI)
- [x] ISSO51 namespace extensies voor IFCX
- [x] Teken-functionaliteit: rechthoek/polygoon/cirkel tekenen met snap + preview
- [x] Raam + deur plaatsen tool
- [x] Room splitsen + samenvoegen
- [x] Room verplaatsen (drag) + vertex verplaatsen
- [x] Dimensie bewerken + numerieke invoer
- [x] Meten tool
- [x] Constructiebibliotheek koppelen aan wanden/vloeren/daken
- [x] Boundary type override per wand
- [x] Onderlegger import (afbeelding)
- [x] Zustand store met undo/redo
- [x] Verdiepingen wisselen + ghost rooms
- [x] Context menu (2D + 3D)
- [x] Project Browser
- [x] IFC import (IfcSpace -> ModelRoom via web-ifc)
- [ ] IFC import Fase 2: IfcWindow/IfcDoor
- [ ] IFC export
- [ ] IFCX export/import UI koppelen
- [ ] PDF onderlegger (pdf.js)
- [ ] DWG onderlegger import
- [ ] Onderlegger positioneren/schalen/roteren
- [ ] Schuine daken en dakkapellen
- [ ] Modeller data <-> project store synchronisatie
- [ ] Snap: perpendicular + underlay modes implementeren
- [ ] Code-splitting web-ifc (5.8MB main bundle)
- [ ] API voor derden: berekening als service
- [ ] Multi-user: projecten delen, rollen
- [ ] Template-projecten: veelvoorkomende woningtypes
