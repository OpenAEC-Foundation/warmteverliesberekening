# DR Engineering Woningbouw — ISSO 51/53/57 (2024)

**Rekenkern:** Vabi 3.12.0.127 | **Datum:** 2-3-2025 | **Norm:** ISSO 51, 53, 57 (2024)

## Projectparameters

| Parameter | Waarde |
|---|---|
| Soort gebouw | Woning/woongebouw |
| Bouwjaar | 2024 |
| Type | Vrijstaand, eenlaags met kap |
| Gebruiksoppervlakte (Ag) | 243,2 m2 |
| Bruto inhoud | 873,1 m3 |
| Gem. U-waarde uitwendig | 0,31 W/(m2.K) |
| Tijdconstante | 189,1 h |
| Basis theta_e | -10,0 C |
| Correctie tijdconstante | +2,0 K |
| **theta_e ontwerp** | **-8,0 C** |
| Thermische bruggen | Nieuw gebouw met voorzieningen (dUtb = 0,02) |
| qv,10,spec | 0,6250 dm3/(s.m2 Ag) |
| Ventilatiesysteem | D (WTW, rendement 0,800) |
| Verwarming | Radiatoren LT |
| Opwarmtoeslag | Geen (continu bedrijf) |
| Bodemtemperatuur | 10,5 C |

## Gebouwresultaten

| Component | W |
|---|---|
| Transmissie naar buiten (Phi_T,ie) | 3.601 |
| Transmissie naar bodem (Phi_T,ig) | 326 |
| Infiltratie (Phi_i) | 2.003 |
| **Basiswarmteverlies** | **5.931** |
| Ventilatie (Phi_vent, kwadratisch) | 770 |
| **Ontwerpvermogen gebouw** | **6.700** |

## Ruimte-overzicht

| # | Naam | theta_i | Phi_basis [W] | Phi_extra [W] | Phi_HL,i [W] | W/m2 |
|---|---|---|---|---|---|---|
| 0.01 | Entree | 20 C | 567 | 0 | 567 | 48 |
| 0.02 | Toilet BG | 18 C | -36 | 0 | 0 | — |
| 0.03 | Woonkamer | 22 C | 2.101 | 221 | 2.322 | 51 |
| 0.04 | Keuken/eetkamer | 22 C | 1.823 | 197 | 2.020 | 50 |
| 0.05 | Bijkeuken | 20 C | 321 | 0 | 321 | 59 |
| 0.06 | Garage | 15,5 C | — | — | 0 | — |
| 1.01 | Overloop | 20 C | — | — | 0 | — |
| 1.02 | Slaapkamer 3 | 22 C | 262 | 45 | 307 | 20 |
| 1.03 | Slaapkamer 2 | 22 C | 241 | 40 | 281 | 19 |
| 1.04 | Slaapkamer 1 | 22 C | 556 | 119 | 675 | 18 |
| 1.05 | Badkamer | 22 C | 230 | 34 | 263 | 32 |
| 1.06 | Toilet 1e | 19,5 C | — | — | 0 | — |
| 1.07 | Kast | 19,5 C | — | — | 0 | — |
| 1.08 | Speelzolder | 22 C | 1.252 | 115 | 1.367 | 36 |

## Per ruimte — transmissie + ventilatie

### 0.01 Entree (20 C, radiatoren LT)
- Phi_T,ie=365, Phi_T,ia=-59, Phi_T,iae=105, Phi_T,ig=29
- Phi_i=127 (3,8 dm3/s, correctie 1,10)
- Phi_vent=0 (lucht uit overloop 20 C)
- **Phi_HL,i=567**

### 0.03 Woonkamer (22 C, radiatoren LT)
- Phi_T,ie=878, Phi_T,ia=381, Phi_T,iae=174, Phi_T,ig=148
- Phi_i=520 (14,5 dm3/s, correctie 1,10)
- Phi_vent=221 (0,90 dm3/s per m2, WTW 17,5 C)
- **Phi_HL,i=2.322**

### 0.04 Keuken/eetkamer (22 C, radiatoren LT)
- Phi_T,ie=622, Phi_T,ia=374, Phi_T,iae=231, Phi_T,ig=132
- Phi_i=464 (12,9 dm3/s, correctie 1,10)
- Phi_vent=197 (0,90 dm3/s per m2, WTW 17,5 C)
- **Phi_HL,i=2.020**

### 0.05 Bijkeuken (20 C, radiatoren LT)
- Phi_T,ie=123, Phi_T,ia=-17, Phi_T,iae=141, Phi_T,ig=15
- Phi_i=58 (1,7 dm3/s, correctie 1,10)
- Phi_vent=0
- **Phi_HL,i=321**

### 1.02 Slaapkamer 3 (22 C, radiatoren LT)
- Phi_T,ie=232, Phi_T,ia=-138, Phi_T,iae=63
- Phi_i=105 (2,9 dm3/s)
- Phi_vent=45 (WTW 17,5 C)
- **Phi_HL,i=307**

### 1.03 Slaapkamer 2 (22 C, radiatoren LT)
- Phi_T,ie=219, Phi_T,ia=-131, Phi_T,iae=57
- Phi_i=95 (2,6 dm3/s)
- Phi_vent=40 (WTW 17,5 C)
- **Phi_HL,i=281**

### 1.04 Slaapkamer 1 (22 C, radiatoren LT)
- Phi_T,ie=514, Phi_T,ia=-324, Phi_T,iae=86
- Phi_i=280 (7,8 dm3/s)
- Phi_vent=119 (WTW 17,5 C)
- **Phi_HL,i=675**

### 1.05 Badkamer (22 C, radiatoren LT)
- Phi_T,ie=126, Phi_T,ia=-29, Phi_T,iae=61
- Phi_i=72 (2,0 dm3/s)
- Phi_vent=34 (afvoer 14 dm3/s uit overloop 20 C)
- **Phi_HL,i=263**

### 1.08 Speelzolder (22 C, radiatoren LT)
- Phi_T,ie=504, Phi_T,ia=9, Phi_T,iae=467 (garage 15,5 C)
- Phi_i=271 (7,5 dm3/s)
- Phi_vent=115 (WTW 17,5 C)
- **Phi_HL,i=1.367**

## Constructie U-waarden

| Constructie | U [W/(m2.K)] | Rc [(m2.K)/W] | dUtb |
|---|---|---|---|
| BG Vloer | 0,21 (Ueq) | 3,71 | — |
| Binnenwand (KZS 100mm) | 2,78 | 0,10 | — |
| Buitengevel | 0,21 | 4,69 | 0,02 |
| Dak hellend | 0,15 | 6,31 | 0,02 |
| Dak wang | 0,21 | 4,67 | 0,02 |
| Tussenvloer | 2,91 | 0,14 | — |
| Tussenvloer (boven garage) | 2,07 | — | — |
| Deur binnen | 2,00 | 0,24 | — |
| Deur buiten | 1,70 | 0,41 | 0,02 |
| Deur garage | 0,70 | 1,26 | 0,02 |
| Overstek | 0,15 | 6,49 | 0,02 |
| Raam (HR++ glas) | 1,50 | — | 0,02 |
| Raam (3-laags) | 1,40 | — | 0,02 |

## WTW-systeem

| Parameter | Waarde |
|---|---|
| Type | Tegenstroomwarmtewisselaar kunststof |
| Rendement | 0,800 |
| Vorstbeveiliging | Voorverwarming tot 1,0 C |
| Opwarming ventilator | 1,5 K (in rendement) |
| Retourlucht naar WTW | 21,7 C |
| **Lucht na WTW** | **17,5 C** |

## Opvallende 2024-kenmerken

1. **dUtb = 0,02** (niet 0,05 zoals 2017)
2. **Bodemtemperatuur 10,5 C** (niet 9 C)
3. **Geen opwarmtoeslag** (continu bedrijf)
4. **Kwadratische sommatie** Phi_extra op gebouwniveau
5. **Infiltratie op Ag** (niet geveloppervlak)
6. **Correctiefactor ventilatie** 1,10 voor systeem D
7. **Onverwarmde ruimten** met berekende evenwichtstemperatuur (garage 15,5 C)
