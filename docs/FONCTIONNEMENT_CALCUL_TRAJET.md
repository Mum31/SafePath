# Fonctionnement du calcul de trajet SafePath

Ce document décrit la chaîne complète du calcul d’un itinéraire « zen » : du formulaire jusqu’à l’affichage du trajet et du score de stress.

---

## 1. Côté frontend (interface)

### 1.1 Saisie utilisateur

- **Page** : `/trajet` (RoutePage).
- **Formulaire** (« On va où ? ») :
  - **Départ** : texte libre (lieu ou adresse) ou **Ma position** (géolocalisation).
  - **Arrivée** : texte libre (lieu ou adresse).
  - **Ville** : Paris, Lyon ou Marseille (sélecteur en haut de page).
  - **Heure** (optionnel) : « Maintenant » ou heure cible pour la prédiction de densité.

### 1.2 Construction des paramètres envoyés à l’API

- **Départ** :
  - Si « Ma position » : `origin = { lat, lng }` (coordonnées du navigateur).
  - Sinon : `origin = { street: "texte saisi", city: "Paris" (ou ville choisie), postal_code: "75001" }`.
- **Arrivée** : toujours adresse  
  `destination = { street: "texte saisi", city: "ville choisie", postal_code: "..." }`.

Au clic sur **GO**, le front envoie :

- `origin`, `destination`
- `user_id`
- `preferences` (densité max, éviter grands axes, privilégier parcs, sensibilité bruit, vitesse de marche, transport en commun)
- `target_hour` (optionnel)

à l’endpoint **POST `/api/calculate-route/`**.

---

## 2. Côté backend (API Django)

### 2.1 Géocodage (départ et arrivée)

- **Rôle** : transformer adresse ou lieu en coordonnées `(lat, lng)`.
- **Entrée** :
  - Soit `{ lat, lng }` → utilisé tel quel.
  - Soit `{ street, city, postal_code }` → chaîne du type « rue, code postal ville, France ».
- **Méthode** (`api/utils/data_sources.py`) :
  1. TomTom Search API (si clé configurée).
  2. Sinon **Nominatim (OpenStreetMap)**.
- En cas d’échec avec code postal, un second essai est fait avec « lieu, ville, France » pour mieux gérer les noms de lieux (ex. « Place de la Bastille, Paris »).

### 2.2 Routage piéton (chemin géométrique)

- **Rôle** : obtenir un itinéraire piéton réaliste entre départ et arrivée.
- **Service** : **OSRM** (Open Source Routing Machine), profil `foot` :
  - URL : `https://router.project-osrm.org/route/v1/foot/{lng1},{lat1};{lng2},{lat2}`.
  - Retour : géométrie du trajet (liste de points `[lng, lat]`), instructions étape par étape, distance en mètres.
- **Si OSRM échoue** (réseau, zone non couverte, etc.) : le backend génère un chemin **simulé** (ligne droite avec points intermédiaires) et des instructions vides.

### 2.3 Densité le long du trajet

- **Rôle** : estimer la « densité de foule » sur le parcours pour ensuite calculer le score de stress.
- **Échantillonnage** : le chemin OSRM (souvent des centaines de points) est réduit à **au plus 15 points** pour limiter les appels aux APIs externes.
- Pour **chaque point échantillonné**, l’agrégateur (`DataAggregator`) combine plusieurs sources :

| Source              | Poids | Rôle |
|---------------------|-------|------|
| Trafic (TomTom)     | 20 %  | Indicateur indirect de zones circulées (carrefours, etc.). |
| Météo (OpenWeather) | 15 %  | Pluie → moins de monde ; beau temps → plus de monde. |
| Flux piétons        | 45 %  | Open Data Paris (compteurs) ou estimation via POI OSM. |
| Événements          | 20 %  | Open Data Paris « Que faire à Paris » → plus d’affluence. |

- **Transport en commun** : si l’utilisateur a activé « considérer le transport en commun », chaque point proche de stations (métro, bus, etc.) voit sa densité augmenter (facteur configurable, ex. 0,15 × nombre de stations).
- **Prédiction ML** : si une **heure cible** (`target_hour`) est fournie, le module `ml_model.predict` donne une densité prédictive pour cette heure. La densité finale est une **fusion** (ex. 60 % agrégation temps réel + 40 % prédiction).

On obtient ainsi une liste **density_data** : pour chaque point, `location` (lat/lng), `density` (0–1), et métadonnées.

### 2.4 Score de stress (0–10)

- **Rôle** : un seul indicateur pour « à quel point le trajet est stressant » selon la foule et les préférences.
- **Calcul** (`calculate_stress_score`) :
  1. **Base** : densité moyenne sur le chemin × 8 (ex. densité 0,5 → base 4).
  2. **Trafic** : + flux trafic × 2 (zones très circulées = plus stressant).
  3. **Météo** : × facteur météo (pluie diminue le score).
  4. **Préférences** :
     - « Éviter les grands axes » → × 0,8.
     - « Privilégier les parcs » → × 0,9.
  5. **Dépassement du seuil** : si la densité moyenne dépasse la « densité max acceptée » de l’utilisateur → forte pénalité (écart × 5).
  6. **Sensibilité au bruit** : facteur entre 0,7 et 1 selon la sensibilité (1–10).
- Le score final est **borné entre 0,5 et 10**.

### 2.5 Zones calmes

- **Rôle** : indiquer des lieux calmes à proximité du trajet (parcs, bibliothèques, etc.).
- **Source** : modèle **CalmZone** en base (parcs, bibliothèques, rues calmes, cafés, monuments). Pour la démo, si la base est vide, des zones par défaut (ex. « Parc tranquille », « Bibliothèque calme ») sont renvoyées.
- Les zones sont renvoyées avec nom, type, coordonnées, score de confort et distance indicative.

### 2.6 Réponse API

La réponse contient notamment :

- **route** :
  - `path` : liste de points `[lng, lat]` (le trajet à dessiner sur la carte).
  - `instructions` : instructions de navigation (tourner à gauche, continuer, etc.).
  - `total_stress` : score de stress 0–10.
  - `distance` (m), `estimated_time` (min).
  - `calm_zones` : zones calmes à proximité.
  - `density_data` : densité par point échantillonné.
- **metadata** : algorithme, source de routage (OSRM ou simulé), type de recommandation (calm_secure), timestamp, liste des sources de données.

La requête est aussi enregistrée en base (**RouteRequest**) pour historique / stats.

---

## 3. Affichage côté frontend après calcul

- **Carte** : tracé du `path` (ligne), marqueurs Départ / Arrivée, optionnellement « Ma position ». Une couche **heatmap** peut afficher `density_data` (zones plus denses = plus chaudes).
- **Résultats** : score de stress, distance, temps estimé, bloc « Recommandation IA », comparateur Trajet rapide vs Trajet serein, liste des zones calmes ou des instructions, export GPX.

---

## 4. Schéma récapitulatif

```
[Utilisateur] Départ / Arrivée / Ville / Heure (optionnel)
       ↓
[RouteForm] buildOrigin(), buildDestination() → origin, destination
       ↓
[RoutePage] handleCalculateRoute(origin, destination, targetHour)
       ↓
POST /api/calculate-route/ { origin, destination, preferences, target_hour }
       ↓
[Backend]
  1. Géocodage (TomTom / Nominatim) → coords départ, arrivée
  2. OSRM (foot) → path, instructions, distance  [ou chemin simulé si échec]
  3. DataAggregator.get_density_for_path(path) → density_data (trafic, météo, flux piétons, événements)
  4. Ajustement transport en commun (stations à proximité)
  5. Prédiction ML (si target_hour) → fusion avec density_data
  6. calculate_stress_score(path, prefs, traffic, weather, density_data) → total_stress
  7. find_nearby_calm_zones(path) → calm_zones
  8. estimated_time = distance / (walking_speed × 60)
       ↓
Réponse JSON { route: { path, instructions, total_stress, distance, estimated_time, calm_zones, density_data }, metadata }
       ↓
[Frontend] setRoute(route) → carte + panneau résultats + recommandation IA
```

---

## 5. Fichiers principaux

| Rôle | Fichier |
|------|---------|
| Formulaire trajet | `frontend/src/components/RouteForm.jsx` |
| Page itinéraire + appel API | `frontend/src/pages/RoutePage.jsx` |
| Endpoint calcul | `backend/api/views.py` → `CalculateRouteView` |
| Géocodage | `backend/api/utils/data_sources.py` → `geocode_address` |
| Routage OSRM | `backend/api/utils/routing.py` → `get_walking_route` |
| Agrégation densité | `backend/api/utils/data_aggregator.py` → `DataAggregator` |
| Données externes | `backend/api/utils/data_sources.py` → `DataSourceManager` |
| Prédiction densité | `backend/ml_model/predict.py` |
| Carte + trajet | `frontend/src/components/MapComponent.jsx` |
