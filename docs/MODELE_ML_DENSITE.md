# Fonctionnement du modèle de prédiction de densité (SafePath)

Ce document décrit comment le module de prédiction de densité piétonne fonctionne dans l’application : données, logique et intégration.

---

## 1. Vue d’ensemble

Le système ne repose **pas** sur un modèle de machine learning chargé à l’inférence (pas de `.joblib` utilisé en production). Il combine :

1. **Profils historiques** : moyennes de densité par créneau horaire et type de jour (semaine / week-end), éventuellement par zone.
2. **Données temps réel** (optionnel) : quand on prédit pour “maintenant” ou une heure proche, fusion avec les APIs (trafic, météo, flux piétons, événements).

Fichiers concernés :

| Fichier | Rôle |
|--------|------|
| `backend/ml_model/predict.py` | Point d’entrée : prédiction pour un point, une zone ou une grille. |
| `backend/ml_model/historical_profiles.py` | Construction et lecture des profils à partir du CSV historique. |
| `backend/ml_model/train_model.py` | Script d’entraînement d’un Random Forest (optionnel, **non utilisé** en prédiction actuelle). |
| `backend/data/historical/density_history.csv` | Données historiques (lat, lng, hour, day_of_week, density). |

---

## 2. Données d’entrée : `density_history.csv`

Le fichier contient des enregistrements de densité passée, par position et créneau :

- **lat, lng** : coordonnées du point.
- **hour** : heure de la journée (0–23).
- **day_of_week** : jour de la semaine (0 = lundi, 6 = dimanche).
- **is_weekend** : 0 ou 1 (dérivé de `day_of_week`).
- **density** : densité observée (souvent entre 0 et 1).

Exemple :

```csv
lat,lng,hour,day_of_week,is_weekend,density
48.8566,2.3522,8,0,0,0.75
48.8566,2.3522,12,0,0,0.85
48.8566,2.3522,18,0,0,0.90
48.8566,2.3522,8,5,1,0.45
...
```

Ces données servent uniquement à construire les **profils historiques** (moyennes). Plus le CSV est riche (plus de points, d’heures, de jours), plus les profils sont représentatifs.

---

## 3. Profils historiques (`historical_profiles.py`)

### 3.1 Construction des profils

Au premier appel, le module charge le CSV et construit deux structures en cache :

1. **`by_hour_weekend`**  
   Clé : `(hour, is_weekend)`.  
   Valeur : **densité moyenne** sur tout le CSV pour cette heure et ce type de jour (semaine / week-end).  
   → Comportement “générique” : “à 18h en semaine, en moyenne la densité est X”.

2. **`by_zone_hour_weekend`**  
   Clé : `(zone_id, hour, is_weekend)`.  
   Valeur : densité moyenne **pour les points qui tombent dans cette zone**.  
   Les zones viennent de `api.utils.zones_config` (ex. Paris = bbox définie). Si un point (lat, lng) n’est dans aucune zone, il est rattaché à une zone par défaut (ex. `paris`).  
   → Comportement “par zone” : “à 18h en semaine, dans la zone Paris, la densité moyenne est Y”.

Si le CSV est absent ou vide, des **profils par défaut** sont utilisés (ex. pics 7–9h et 17–19h, creux la nuit, week-end un peu différents).

### 3.2 Utilisation pour un point

- Pour un point `(lat, lng)` et un créneau `(hour, day_of_week)` :
  - On en déduit `is_weekend` à partir de `day_of_week`.
  - On détermine la **zone** du point (via les bbox des zones).
  - On cherche d’abord une valeur dans `by_zone_hour_weekend` pour `(zone_id, hour, is_weekend)`.
  - Si rien n’existe, on utilise `by_hour_weekend` pour `(hour, is_weekend)`.
  - Si toujours rien, une valeur par défaut (ex. 0.5) est renvoyée.

C’est une logique **déterministe à base de moyennes**, pas un modèle ML au sens “entraînement / prédiction avec un algorithme appris”.

---

## 4. Prédiction en production (`predict.py`)

### 4.1 `predict_density(lat, lng, target_datetime)`

- **Entrées** : coordonnées d’un point, date/heure cible (par défaut “maintenant”).
- **Sortie** : dictionnaire avec `density` (0–1), `confidence`, `hour`, `day_of_week`, `model_type`, `historical_base`.

Logique :

1. **Base prédictive = historique**  
   Appel à `get_historical_density(zone_id, hour, day_of_week)` avec la zone du point et le créneau de `target_datetime`.  
   → `density = historical`, `model_type = "predictive"`, `confidence = 0.8`.

2. **Ajustement temps réel (optionnel)**  
   Si l’horaire cible est à **±2 h** de l’heure actuelle :
   - On appelle `DataAggregator.get_aggregated_density_for_point(point, target_datetime)` (trafic, météo, flux piétons, événements).
   - On fusionne : **density = 0,65 × historical + 0,35 × realtime**.
   - `model_type = "predictive_realtime"`, `confidence = 0.85`.

3. **Clamp**  
   `density` est bornée entre 0,05 et 0,98.

Donc le “modèle” en production = **profils historiques + optionnellement un mélange avec l’agrégateur temps réel**.

### 4.2 Autres fonctions

- **`predict_density_grid(bbox, target_datetime, grid_size)`**  
  Découpe la bbox en grille (ex. 5×5), appelle `predict_density` au centre de chaque cellule, retourne la liste des prédictions (utilisé pour la heatmap).

- **`predict_density_by_zone(zone_id, target_datetime)`**  
  Utilise le centre de la zone pour appeler `predict_density` et ajoute `zone_id` / `zone_label`.

- **`predict_density_grid_by_zone(zone_id, target_datetime, grid_size)`**  
  Bbox de la zone → grille → même logique que `predict_density_grid`, avec zone_id/zone_label sur chaque point.

Partout, la “prédiction” repose sur les mêmes règles : historique + éventuel blend temps réel.

---

## 5. Script d’entraînement (`train_model.py`) — non utilisé en prédiction

- **Rôle** : lire `density_history.csv`, entraîner un **Random Forest** (scikit-learn) avec les features `lat`, `lng`, `hour`, `day_of_week`, `is_weekend` pour prédire `density`, puis sauvegarder le modèle dans `backend/data/models/density_model.joblib`.
- **État actuel** : ce fichier `.joblib` **n’est jamais chargé** dans `predict.py`. La prédiction utilise uniquement les profils historiques (moyennes) et l’agrégateur temps réel.

Pour utiliser vraiment le Random Forest en production, il faudrait dans `predict.py` :
- charger `density_model.joblib`,
- appeler `model.predict(...)` pour le point et le créneau considéré,
- et éventuellement garder ou adapter la logique de fusion avec le temps réel.

---

## 6. Résumé du flux

```
Requête (point ou zone + optionnellement heure cible)
        │
        ▼
┌─────────────────────────────────────┐
│ 1. Déterminer zone du point (bbox)   │
│ 2. hour, day_of_week → is_weekend    │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 3. get_historical_density(zone,      │
│    hour, is_weekend)                 │
│    → moyenne depuis density_history  │
│      ou profils par défaut           │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 4. Si target_datetime ≈ maintenant   │
│    (±2 h) :                          │
│    DataAggregator → densité temps    │
│    réel → density = 0.65*histo       │
│    + 0.35*realtime                   │
└─────────────────────────────────────┘
        │
        ▼
  density clampée [0.05, 0.98]
  + confidence, model_type, etc.
```

---

## 7. En résumé

- **Modèle “ML” en production** = **profils historiques** (moyennes par heure / week-end / zone) + **optionnel** mélange 65 % / 35 % avec les données temps réel (DataAggregator).
- Aucun modèle entraîné (Random Forest ou autre) n’est chargé dans le code de prédiction actuel.
- Pour améliorer les prédictions : enrichir `density_history.csv` et/ou brancher l’utilisation du modèle `train_model.py` (Random Forest) dans `predict.py` si vous souhaitez passer à un vrai modèle ML.
