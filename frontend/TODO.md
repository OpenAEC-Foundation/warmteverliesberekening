# Modeller TODO

## Voltooid
- [x] Zustand store (modellerStore) voor rooms/windows/doors met undo/redo
- [x] Rechthoek tekenen tool
- [x] Polygoon tekenen tool
- [x] Cirkel tekenen tool (approximatie als polygoon)
- [x] Raam plaatsen tool
- [x] Deur plaatsen tool
- [x] Room splitsen tool (klik 2 wanden)
- [x] Room samenvoegen (context menu)
- [x] Room verplaatsen (drag in select mode)
- [x] Vertex verplaatsen (grips)
- [x] Dimensie bewerken (klik op maat, numerieke invoer)
- [x] Meten tool
- [x] Visuele preview tijdens tekenen (oranje stippellijn + afmetingen)
- [x] Snap naar raster, eindpunt, middelpunt, nearest
- [x] Bewerkbare ruimte-eigenschappen (naam, functie, hoogte)
- [x] Ruimte verwijderen (Delete toets + knop)
- [x] Constructiebibliotheek koppeling aan wanden/vloeren/daken
- [x] Boundary type override per wand
- [x] Inline constructie-picker met zoekfunctie
- [x] Onderlegger import (afbeelding als achtergrond)
- [x] Keyboard shortcuts (V, H, R, P, C, W, N, M, Ctrl+Z/Y, Delete)
- [x] Undo/Redo via Ctrl+Z / Ctrl+Y
- [x] 3D viewer: extrusie, section planes, U-waarde kleuring, selectie
- [x] Ribbon toolbar (Model/Annotatie/Beeld/Invoegen tabs)
- [x] Verdiepingen wisselen + ghost rooms
- [x] Context menu (2D + 3D)
- [x] Project Browser (ruimten/wanden/ramen tree)
- [x] IFC import (IfcSpace -> ModelRoom via web-ifc)

## Code kwaliteit (audit bevindingen)
- [ ] `FloorCanvas.tsx` splitsen (1729 regels): shapes, room rendering, drawing, utils
- [ ] `FUNCTION_COLORS` centraliseren (3x gedupliceerd: FloorCanvas, FloorCanvas3D, PropertiesPanel)
- [ ] Dead code verwijderen: `ModellerToolbar.tsx` + `DrawingToolsPanel.tsx` (vervangen door Ribbon)
- [ ] Tool definities centraliseren (Ribbon dupliceert DrawingToolsPanel definities)
- [ ] `ProjectBrowser` extraheren uit Modeller.tsx naar eigen bestand
- [ ] `wallDirection` centraliseren in geometry.ts (nu in PropertiesPanel + Modeller)
- [ ] `ConstructionPicker`/`ConstructionPickerInline` samenvoegen
- [ ] `polygonAreaMm2` in ifc-import.ts dedupliceren (importeer uit geometry.ts)
- [ ] Store snapshot mist constructie-assignments (undo/redo verliest toewijzingen)
- [ ] Circle segments inconsistentie: 24 (definitief) vs 48 (preview)
- [ ] Magic values benoemen: camera offsets, tolerances, floor slab offset (0.3)
- [ ] Store selectors in Modeller.tsx vereenvoudigen met `useShallow`
- [ ] SharedEdge herberekening in ProjectBrowser optimaliseren (O(n^2))
- [ ] Annotatie tools: implementeren of verwijderen (tekst/maatvoering/leider zijn stubs)
- [ ] Snap modes: perpendicular + underlay implementeren of verwijderen

## Volgende features
- [ ] IFC import Fase 2: IfcWindow/IfcDoor -> ModelWindow/ModelDoor
- [ ] IFC export
- [ ] IFCX export/import UI koppelen (code aanwezig in ifcx-builder.ts)
- [ ] PDF onderlegger (pdf.js rendering)
- [ ] DWG onderlegger import
- [ ] Onderlegger positioneren/schalen/roteren via UI controls
- [ ] Schuine daken en dakkapellen
- [ ] Modeller data <-> project store synchronisatie
- [ ] Code-splitting web-ifc (5.8MB main bundle)
- [ ] Batch constructie-toewijzing aan meerdere elementen
- [ ] U-waarde weergeven op wanden in 2D view
