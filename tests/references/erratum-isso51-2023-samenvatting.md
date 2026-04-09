# Erratum ISSO 51:2023 (d.d. 1 september 2023)

## Kritische correcties voor de rekenengine

### 1. theta_b aangrenzende panden (par. 2.7.2)
- **Oud:** theta_b = 15 C
- **Nieuw:** theta_b = **17 C** (woonfunctie), **14 C** (overige functies)

### 2. Formule 2.15 (par. 2.5.3)
- **Oud:** `(theta_i * theta_e)` (vermenigvuldigingsteken)
- **Nieuw:** `(theta_i - theta_e)` (minteken)

### 3. Formule 2.18 (par. 2.5.3)
- **Oud:** `(theta_i + Delta_theta_a1)`
- **Nieuw:** `(theta_a + Delta_theta_a1)` (theta_a i.p.v. theta_i)

### 4. Tabel 2.12 — VOLLEDIG VERVANGEN
Waarden voor Delta_theta_1, Delta_theta_a1, Delta_theta_2, Delta_theta_a2 en Delta_theta_v:

| Verwarmingssysteem | Delta_theta_1/a1 [K] | Delta_theta_2/a2 [K] | Delta_theta_v (U>0.5) [K] | Delta_theta_v (U<=0.5) [K] |
|---|---|---|---|---|
| Gashaard, gevelkachel | +4 | -1 | 0 | 0 |
| IR-panelen wandmontage | +1 | -0,5 | -1,5 | -1 |
| IR-panelen plafondmontage | 0 | 0 | -1,5 | -1 |
| Radiatoren/convectoren HT + luchtverwarming | +3 | -1 | 0 | 0 |
| Radiatoren/convectoren LT | +2 | -1 | 0 | 0 |
| Plafondverwarming | +3 | 0 | 0 | 0 |
| Wandverwarming | +2 | -1 | -1 | -0,5 |
| Plintverwarming | +1 | -1 | 0 | 0 |
| Vloerverwarming + HT-radiatoren | +3 | 0 | 0 | 0 |
| Vloerverwarming + LT-radiatoren | +2 | 0 | -1 | -0,5 |
| Vloerverwarming (theta_vloer >= 27C) | 0 | 0 | -1 | -0,5 |
| Vloerverwarming (theta_vloer < 27C) | 0 | 0 | -0,5 | 0 |
| Vloerverwarming + wandverwarming | +1 | 0 | -1 | -0,5 |
| Ventilatorgedreven convectoren/radiatoren | 0,5 | 0 | 0 | 0 |

### 5. Tabel 2.14 — VOLLEDIG VERVANGEN (WTW temperaturen)

| Systeem | theta_t [C] |
|---|---|
| WTW type onbekend | 10 |
| Centrale WTW terugtoeren/onbalans | 10 |
| Centrale WTW enthalpiewisselaar (>= 70%) | 12 |
| Centrale WTW voorverwarming | 16 |
| Decentrale WTW terugtoeren/onbalans | 10 |
| Decentrale WTW enthalpiewisselaar (>= 70%) | 12 |
| Decentrale WTW voorverwarming | 14 |
| Voorverwarming zonder WTW | 5 |

### 6. Tabel 3.1 en 4.1 — VERWIJDERD
Z-factor tabellen per gebouwtype/vertrektype zijn verwijderd.

### 7. Factor 1200 -> 1,2 (par. 2.9.2, bijlage E)
Eenheidscorrectie: volumestromen in dm3/s, factor wordt 1,2 kJ/(m3·K).

### 8. Symboolwijzigingen
- `Phi_op` -> `Phi_hu,i` (opwarmtoeslag/bedrijfsbeperking)
- `A_vl` -> `A_g` (vloeroppervlak -> gebruiksoppervlak)

### 9. Kwadratische sommatie (formule 3.11)
```
Phi_extra = sqrt(Phi_vent^2 + Phi_T,iaBE^2 + Phi_hu,i^2)
```

### 10. Ventilatie-formules met Delta_theta_v
Alle f_v formules (4.6a, 4.6b, 4.8a, 4.8b) krijgen Delta_theta_v term:
```
f_v = ((theta_i + Delta_theta_v) - theta_t) / (theta_i - theta_e)
```

### 11. Wandverwarming tabel 2.18 (f_wvw)

| Rc-waarde wand | f_wvw |
|---|---|
| <= 0,35 | 0,85 |
| 0,35 < Rc <= 1,0 | 0,4 |
| 1,0 < Rc <= 2,0 | 0,25 |
| 2,0 < Rc <= 3,0 | 0,15 |
| Rc > 3,0 | 0,1 |

### 12. Plafondverwarming defaultwaarden

| Conditie | Phi_verlies3 |
|---|---|
| Geisoleerd (Rc >= 3 m2K/W) | 0,20 * Phi_HL,i |
| Overig | 0,50 * Phi_HL,i |

### 13. Ventilatiesysteem E (nieuw)
Systeemcombinaties: lokaal systeem D (WTW) gecombineerd met systeem C per ruimte.

### 14. Overige correcties
- "Bouwbesluit 2020" -> "Bouwbesluit 2012 met aanpassingen tot en met 2020"
- PMW -> PMV
- Formule 2.29: B1 -> B' (B-prime)
- Tabel 2.6: "constructeur" -> "energieadviseur"
- Tabel 2.8: "afhankelijk van bouwjaar/renovatiejaar" verwijderd
- Formule 4.23: haakjes toegevoegd
- Par. 2.9.1: "aangrenzende ruimte" -> "aangrenzend pand" overal
