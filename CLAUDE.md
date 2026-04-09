# ISSO 51 Warmteverliesberekening

Rekenbibliotheek voor warmteverliesberekeningen volgens ISSO 51:2023.

---

## Doel

Complete tool voor warmteverliesberekeningen volgens de ISSO 51 norm, bruikbaar als:
- Rust rekenbibliotheek (core engine)
- Python package (via PyO3)
- DLL (C ABI)
- WASM module (web browser)
- Web app (React + TypeScript)
- Desktop app (Tauri + React)
- REST API

---

## Architectuur

- **isso51-core** (Rust): Alle formules & tabellen, JSON in/uit, puur (geen I/O, geen async, geen unsafe)
- Wrapper crates: isso51-python (PyO3), isso51-wasm (wasm-bindgen), isso51-ffi (cbindgen)
- Frontend: React + TypeScript + Tailwind + Zustand
- Desktop: Tauri v2

---

## Belangrijke Bestanden

| Bestand | Doel |
|---------|------|
| `crates/isso51-core/src/lib.rs` | Public API: `calculate_from_json()` |
| `crates/isso51-core/src/model/` | Domeinmodel (structs/enums) |
| `crates/isso51-core/src/formulas.rs` | Formule-identifiers (29 constanten) |
| `crates/isso51-core/src/calc/` | Berekeningen per onderdeel |
| `crates/isso51-core/src/tables/` | ISSO 51 opzoektabellen |
| `schemas/v1/` | JSON schemas (gegenereerd uit Rust types) |
| `tests/fixtures/` | Test JSON bestanden |

---

## Conventies

- Rust: `cargo test` moet altijd slagen
- Eenheden: mm voor afmetingen, dm3/s voor luchtvolumestroom, W voor vermogen, W/K voor H-waarden
- Temperaturen in graden Celsius
- JSON schema first: types in Rust, schemas gegenereerd via schemars
- Doc comments verwijzen naar ISSO 51 formulenummers

## Referenties

- ISSO 51 voorbeeld portiekwoning: gebruikt theta_b = 15 graden C (oud), erratum 2023 zegt 17 graden C
- Erratum 2023: kwadratische sommatie voor niet-gelijktijdige verliezen
- Factor 1.2 kJ/(m3*K) = rho * c_p lucht
- qi_spec in dm3/s per m2 (niet m3/s)

---

## UI Migratie — OpenAEC Template Layout

**Status:** OPEN — nog niet gestart
**Template bron:** `X:\10_3BM_bouwkunde\50_Claude-Code-Projects\open_AEC\project-templates\Tauri+React\`

### Wat verandert

De huidige Topbar+Sidebar layout wordt vervangen door de OpenAEC Tauri+React template layout:

| Huidig | Nieuw (template) | Actie |
|--------|-------------------|-------|
| `layout/Topbar.tsx` (56px header) | `TitleBar.tsx` (custom window chrome) | Vervangen |
| `layout/Sidebar.tsx` (260px nav) | `ribbon/Ribbon.tsx` (tab-based toolbar) | Vervangen |
| `layout/AppShell.tsx` | `App.tsx` met resizable panels | Vervangen |
| `layout/PageHeader.tsx` | Ribbon tab context | Verwijderen |
| OS window decorations | `decorations: false` + custom TitleBar | tauri.conf.json aanpassen |
| Geen i18n | `i18n/` (NL + EN, 5 namespaces) | Toevoegen |
| Geen settings dialog | `SettingsDialog.tsx` (7 tabs) | Toevoegen |
| Geen backstage | `Backstage.tsx` (File menu) | Toevoegen |
| Tailwind tokens inline | `themes.css` (CSS custom properties) | Migreren |
| `modeller/Ribbon.tsx` (eigen) | Integreren in hoofd-Ribbon | Refactoren |
| react-router pagina's | Ribbon tabs + panel switching | Refactoren |

### Pagina — Ribbon Tab Mapping

De 8 huidige pagina's mappen als volgt naar het Ribbon-model:

| Ribbon Tab | Inhoud (huidige pagina's) | Groepen |
|------------|---------------------------|---------|
| **Bestand** (special) | Backstage: Nieuw, Openen, Opslaan, Import IFC, Export JSON, Rapport printen | — |
| **Project** (home) | `ProjectSetup.tsx` + `RoomEditor.tsx` | Projectgegevens, Ruimten, Berekenen |
| **Constructies** | `ProjectConstructions.tsx` + `RcCalculator.tsx` | Catalogus, Rc-berekening, Materialen |
| **Modeller** | `Modeller.tsx` (bestaande ribbon content) | Model, Annotatie, Beeld, Invoegen |
| **Resultaten** | `Results.tsx` + charts | Overzicht, Grafieken, Rapport |
| **Bibliotheek** | `Library.tsx` | Constructies, Materialen, Projecten |
| **Beeld** | View options, zoom, panel toggles | Zoom, Panelen, Thema |

### Wat NIET verandert

- `crates/` — Rust core engine blijft ongewijzigd
- `src-tauri/` — Rust Tauri backend (alleen `tauri.conf.json` aanpassen)
- `store/` — Zustand stores blijven, worden aangesloten op nieuwe layout
- `types/` — TypeScript types ongewijzigd
- `lib/` — Business logic, API clients, berekeningen ongewijzigd
- `hooks/` — Custom hooks ongewijzigd (useTheme migreren naar template theming)
- `components/rooms/` — Domain components ongewijzigd
- `components/construction/` — Domain components ongewijzigd
- `components/charts/` — Domain components ongewijzigd
- `components/modeller/` — Canvas + logic ongewijzigd, alleen Ribbon integratie
- `components/ui/` — Base components behouden naast template components

### Migratie Stappenplan

**Fase 1: Shell vervangen (breaking)**
1. Kopieer uit template naar `frontend/src/`:
   - `themes.css` — aanpassen met bestaande warmteverlies tokens uit `tailwind.config.ts`
   - `i18n/` map compleet (config + locale bestanden)
   - `store.ts` (Tauri preferences store) — NIET verwarren met bestaande `store/` map
   - `components/TitleBar.tsx` + `.css`
   - `components/StatusBar.tsx` + `.css`
   - `components/Modal.tsx` + `.css`
   - `components/ThemedSelect.tsx` + `.css`
   - `components/backstage/` map compleet
   - `components/settings/` map compleet
   - `components/feedback/` map compleet
   - `components/ribbon/` map (RibbonButton, RibbonGroup, RibbonTab, RibbonButtonStack, icons)
2. Pas `src-tauri/tauri.conf.json` aan: `"decorations": false`, `"visible": false`
3. Voeg dependencies toe aan `frontend/package.json`:
   ```
   i18next ^25.8.14
   i18next-browser-languagedetector ^8.2.1
   react-i18next ^16.5.4
   @tauri-apps/plugin-store ^2.4.2
   ```

**Fase 2: Ribbon tabs bouwen**
1. Maak domein-specifieke tabs in `components/ribbon/`:
   - `ProjectTab.tsx` — Projectgegevens, Ruimten, Berekenen knoppen
   - `ConstructionsTab.tsx` — Catalogus, Rc-berekening, Materialen
   - `ModellerTab.tsx` — Integreer content uit bestaande `modeller/Ribbon.tsx`
   - `ResultsTab.tsx` — Overzicht, Grafieken, Rapport genereren
   - `LibraryTab.tsx` — Constructies, Materialen browsen
   - `ViewTab.tsx` — Zoom, panelen, thema-opties
2. Verplaats relevante acties uit huidige PageHeader's naar RibbonButton's per tab

**Fase 3: Layout herschrijven**
1. Vervang `AppShell.tsx` door nieuwe `App.tsx` met resizable left/right panels
2. Maak panel-switching logica: actieve Ribbon tab bepaalt main content area
3. Left panel: navigator/explorer (ruimtelijst, constructielijst — contextafhankelijk per tab)
4. Right panel: properties (contextafhankelijk)
5. Verwijder react-router pagina-navigatie, vervang door state-based switching
6. Behoud react-router alleen voor web-only route `/projects`

**Fase 4: Theming migreren**
1. Vertaal Tailwind tokens uit `tailwind.config.ts` naar CSS custom properties in `themes.css`
2. Behoud boundary-kleuren (exterior, unheated, ground, etc.) als extra tokens
3. Test light + openaec thema's
4. Migreer `useTheme` hook naar template `getSetting/setSetting` patroon

**Fase 5: i18n**
1. Extract alle hardcoded NL strings naar locale JSON bestanden
2. Maak extra namespace `isso51.json` voor domein-specifieke termen
3. Voeg EN vertalingen toe
4. Test taalwisseling via SettingsDialog

**Fase 6: Backstage vullen**
1. "Nieuw" — projectStore.reset()
2. "Openen" — JSON import (bestaande `importExport.ts`)
3. "Opslaan" — JSON export / server save (bestaande `useAutoSave`)
4. "Import" — IFC import flow (bestaande `ifc-import.ts`)
5. "Export" — JSON/IFCX export (bestaande `importExport.ts` + `ifcx-builder.ts`)
6. "Rapport" — PDF generatie (bestaande `reportBuilder.ts` + `reportClient.ts`)

### Aandachtspunten

- **DocumentBar:** Warmteverliesberekening is primair single-document. DocumentBar weglaten of vereenvoudigen tot projectnaam-indicator in TitleBar
- **Modeller Ribbon:** De bestaande `modeller/Ribbon.tsx` heeft eigen subtabs (Model, Annotatie, Beeld, Invoegen). Bij activatie van hoofd-Ribbon tab "Modeller" switcht de ribbon naar deze subtabs
- **OIDC:** Bestaande auth (`oidc-spa`) behouden voor web mode — niet in template aanwezig, apart afhandelen
- **Proxy config:** `vite.config.ts` proxy's voor API en reports behouden
- **Tailwind:** Behouden naast CSS custom properties — Tailwind classes blijven werken in domain components

---

## Agent Broker
- **project_id:** `warmteverlies`
- **display_name:** `Warmteverlies Calculator`
- **capabilities:** `["nen-12831", "isso-51", "rust", "tauri"]`
- **subscriptions:** `["bim/*", "shared/*"]`

---

## Orchestrator — Sessie afsluiting

**ALTIJD uitvoeren aan het einde van elke sessie** (of na een significante mijlpaal):

Schrijf een update naar:
`C:\Users\JochemK\.claude\orchestrator\sessions\warmteverlies_latest.md`

Gebruik dit formaat:
```markdown
# Warmteverlies — Sessie update
**Datum:** YYYY-MM-DD HH:MM
**Branch:** (git branch naam)

## Wat is gedaan
- (bullet per afgeronde taak)

## Huidige staat
(1-3 zinnen over de staat van het project)

## Gewijzigde bestanden
- (relevante paden)

## Openstaande issues / next steps
- (wat nog moet gebeuren)

## Cross-project notities
(iets wat relevant is voor pyrevit of report integratie)
```

**Orchestrator context:** `C:\Users\JochemK\.claude\orchestrator\context\warmteverlies.md`
**Project registry:** `C:\Users\JochemK\.claude\orchestrator\project-registry.json`
