# Architecture technique SafePath

Ce document décrit le fonctionnement de l’application, l’architecture technique, les APIs internes (backend) et les APIs externes utilisées.

---

## 1. Vue d’ensemble

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite)  —  port 5173                                    │
│  • Pages : Accueil, Exploration, Itinéraire, Tableau de bord             │
│  • Cartes : Leaflet + OpenStreetMap uniquement                            │
│  • Appels HTTP → /api/* (proxifiés vers backend:8000)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ axios  /api/...
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Django REST)  —  port 8000                                      │
│  • Géocodage (TomTom / Nominatim)                                         │
│  • Routage piéton (OSRM)                                                  │
│  • Agrégation densité (TomTom, OpenWeather, Open Data Paris, OSM)         │
│  • Prédiction ML (optionnel)                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            [ TomTom ]      [ OpenWeather ]   [ OSRM / Nominatim ]
            [ Paris Open Data ]  [ Overpass OSM ]
```

- **Frontend** : SPA React (Vite), hébergée sur `http://localhost:5173`. Les requêtes vers `/api/*` sont envoyées au backend via le proxy Vite (`vite.config.js` → `target: 'http://localhost:8000'`).
- **Backend** : API Django sous `/api/`. C’est lui qui appelle toutes les APIs externes (géocodage, trafic, météo, open data, routage).

---

## 2. APIs internes (backend Django)

Toutes les URLs sont préfixées par **`/api/`** (défini dans `backend/safe_path_api/urls.py`).

| Endpoint | Méthode | Rôle |
|----------|---------|------|
| `/api/test/` | GET | Test de disponibilité + liste des endpoints |
| `/api/health/` | GET | Santé du service |
| `/api/calculate-route/` | POST | Calcul d’itinéraire « zen » (géocodage, OSRM, densité, stress, zones calmes) |
| `/api/user-preferences/` | GET / POST | Préférences utilisateur (densité max, éviter grands axes, etc.) |
| `/api/calm-zones/` | GET | Liste des zones calmes (parcs, bibliothèques, etc.) |
| `/api/emergency/` | GET | Infos urgence / points d’intérêt (paramètres `lat`, `lng`) |
| `/api/zones/` | GET | Liste des zones supportées (ex. Paris, Lyon, Marseille) |
| `/api/density-prediction/` | GET | Prédiction de densité pour une zone/heure (paramètres `zone`, `city`, etc.) |

### Utilisation côté frontend

- **RoutePage** (`/trajet`) : `POST /api/calculate-route/`, `GET /api/user-preferences/`, `GET /api/calm-zones/`.
- **ExplorationPage** : `GET /api/density-prediction/` pour la heatmap.
- **Dashboard** : `GET /api/zones/`, `GET /api/density-prediction/`.
- **EmergencyButton** : `GET /api/emergency/?lat=...&lng=...`.
- **App / ApiStatus** : `GET /api/test/` pour vérifier que l’API répond.

---

## 3. APIs externes utilisées par le backend

Le backend est le seul à appeler les services externes. Les clés sont lues depuis les variables d’environnement (fichier `.env` à la racine).

### 3.1 Géocodage (adresse → coordonnées)

| API | Rôle | Clé | Fichier |
|-----|------|-----|---------|
| **TomTom Search API** | Géocodage principal (adresse → lat/lng) | `TOMTOM_API_KEY` | `backend/api/utils/data_sources.py` → `_geocode_query_cached` |
| **Nominatim (OSM)** | Fallback si TomTom absent ou échec | Aucune | Même fichier |

- URL TomTom : `https://api.tomtom.com/search/2/geocode/{query}.json`
- URL Nominatim : `https://nominatim.openstreetmap.org/search`
- Utilisation : résolution du **départ** et de l’**arrivée** avant d’appeler le routage.

### 3.2 Routage piéton

| API | Rôle | Clé | Fichier |
|-----|------|-----|---------|
| **OSRM** (Open Source Routing Machine) | Itinéraire piéton (géométrie, instructions, distance) | Aucune | `backend/api/utils/routing.py` |

- URL : `https://router.project-osrm.org/route/v1/foot/{lng1},{lat1};{lng2},{lat2}`
- Paramètres : `overview=full`, `geometries=geojson`, `steps=true`.
- Retour : liste de points `[lng, lat]`, instructions par étape, distance en mètres.
- En cas d’échec OSRM, le backend génère un **chemin simulé** (ligne droite avec points intermédiaires).

### 3.3 Données pour la densité / stress

Utilisées par `DataAggregator` et `DataSourceManager` pour calculer la densité le long du trajet (et le score de stress).

| API | Rôle | Clé | Poids (densité) | Fichier |
|-----|------|-----|------------------|---------|
| **TomTom Traffic** | Flux trafic (proxy zones circulées) | `TOMTOM_API_KEY` | 20 % | `data_sources.py` → `get_traffic_data` |
| **OpenWeather** | Météo (pluie → moins de monde) | `OPENWEATHER_API_KEY` | 15 % | `data_sources.py` → `get_weather_data` |
| **Open Data Paris – Compteurs** | Flux piétons (comptage) | Aucune | 45 % (flux piétons) | `data_sources.py` → `get_pedestrian_flow_data` |
| **Open Data Paris – Que faire à Paris** | Événements (augmentent l’affluence) | Aucune | 20 % (événements) | `data_sources.py` → `get_events_data` |

- TomTom Traffic : `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json`
- OpenWeather : `https://api.openweathermap.org/data/2.5/weather`
- Paris Open Data :  
  - Compteurs : `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptage-compteur/records`  
  - Événements : `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris/records`

En l’absence de données Paris (ou hors Paris), le flux piéton peut être estimé via **Overpass (OSM)** ou valeurs par défaut.

### 3.4 OpenStreetMap / Overpass

| Service | Rôle | Clé | Fichier |
|---------|------|-----|---------|
| **Overpass API** | Données OSM (POI, etc.) pour estimation flux / contexte | Aucune | `data_sources.py` (OVERPASS_URL) |
| **Nominatim** | Voir géocodage ci‑dessus | Aucune | `data_sources.py` |

- Overpass : `https://overpass-api.de/api/interpreter`

### 3.5 Carte côté frontend (affichage uniquement)

Aucune de ces APIs n’est appelée par le backend ; elles servent uniquement à l’affichage des tuiles et, si utilisé, du style Mapbox.

| Service | Rôle | Clé | Fichier frontend |
|---------|------|-----|-------------------|
| **OpenStreetMap** | Tuiles de fond carte | Aucune | Composants carte (Leaflet) |
| **Mapbox** (optionnel) | Tuiles / style si configuré | `VITE_MAPBOX_TOKEN` (dans `.env`) | Voir `docs/MAPS.md` |

---

## 4. Flux de données : exemple « Calcul d’itinéraire »

1. **Frontend** (RoutePage) : l’utilisateur saisit Départ / Arrivée / Ville, clique sur GO → `POST /api/calculate-route/` avec `origin`, `destination`, `preferences`, `target_hour` (optionnel).

2. **Backend** (`CalculateRouteView`) :  
   - **Géocodage** : TomTom puis Nominatim si besoin → coordonnées départ et arrivée.  
   - **Routage** : OSRM (profil `foot`) → `path` (liste de points), instructions, distance.  
   - **Densité** : pour jusqu’à ~15 points échantillonnés sur le chemin, `DataAggregator` appelle :
     - TomTom Traffic, OpenWeather, Open Data Paris (compteurs + événements), éventuellement Overpass/OSM.  
   - **Score de stress** : calcul à partir de la densité, préférences, météo, etc.  
   - **Zones calmes** : depuis le modèle Django (CalmZone) ou données par défaut.  
   - **Prédiction ML** : si `target_hour` est fourni, fusion avec la prédiction (ex. `ml_model.predict`).

3. **Réponse** : JSON avec `route` (path, instructions, total_stress, distance, estimated_time, calm_zones, density_data), plus metadata.

4. **Frontend** : affichage du trajet sur la carte (Leaflet), de la heatmap densité (vert / orange / rouge), du score de stress et des zones calmes.

---

## 5. Fichiers clés

| Rôle | Fichier |
|------|---------|
| URLs API | `backend/api/urls.py` |
| Vues / logique calcul trajet | `backend/api/views.py` |
| Géocodage + sources (TomTom, OWM, Paris, OSM) | `backend/api/utils/data_sources.py` |
| Routage OSRM | `backend/api/utils/routing.py` |
| Agrégation densité | `backend/api/utils/data_aggregator.py` |
| Prédiction densité | `backend/ml_model/predict.py` |
| Config zones | `backend/api/utils/zones_config.py` |
| Proxy frontend → backend | `frontend/vite.config.js` |
| Appels API frontend | `frontend/src/pages/RoutePage.jsx`, `ExplorationPage.jsx`, `Dashboard.jsx`, etc. |

---

## 6. Variables d’environnement (.env)

| Variable | Utilisation |
|----------|-------------|
| `TOMTOM_API_KEY` | TomTom géocodage + TomTom Traffic |
| `OPENWEATHER_API_KEY` | OpenWeather météo |
| *(aucune clé carte requise)* | Cartes : Leaflet + OpenStreetMap uniquement |

Sans clés TomTom / OpenWeather, le backend continue avec fallbacks (Nominatim, valeurs par défaut pour trafic/météo).

---

Pour le détail du **calcul de trajet et du score de stress**, voir **`docs/FONCTIONNEMENT_CALCUL_TRAJET.md`**.
