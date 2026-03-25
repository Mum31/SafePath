# Cartes pour SafePath

## Peut-on utiliser Google Maps gratuitement ?

**Google Maps Platform** n’est pas entièrement gratuit :

- **Avant 2025** : crédit gratuit d’environ **200 $/mois** (équivalent à ~28 000 chargements de carte dynamique).
- **Depuis mars 2025** : le crédit fixe est remplacé par des **plafonds gratuits par type de service** (voir [Google Maps Platform Pricing](https://developers.google.com/maps/billing-and-pricing)).
- Une **carte de crédit** et un **projet Google Cloud** sont requis pour activer l’API, même pour le gratuit.
- Au-delà du gratuit : facturation au nombre de requêtes (cartes, directions, géocodage, etc.).

**En pratique** : possible pour un **PFE / démo** si vous restez dans les plafonds gratuits. Pour un **projet 100 % gratuit et sans carte bancaire**, SafePath utilise **uniquement Leaflet + OpenStreetMap**.

---

## Options utilisées dans SafePath

| Solution              | Coût                    | Clé API        | Usage dans le projet        |
|-----------------------|-------------------------|----------------|-----------------------------|
| **Leaflet + OSM**     | 100 % gratuit           | Aucune         | **Uniquement** (cartes interactives + images statiques) |
| **Google Maps**       | Plafonds gratuits puis payant | Clé Google   | Non intégré (voir ci‑dessous) |

- Les cartes interactives utilisent **Leaflet** avec les tuiles **OpenStreetMap**.
- Les aperçus statiques (fiche lieu, drawer) utilisent **staticmap.openstreetmap.de** (sans clé).

Pour utiliser **Google Maps** plus tard : installer `@react-google-maps/api`, ajouter une clé et un composant dédié, en gardant Leaflet + OSM en fallback si vous voulez éviter de dépasser les quotas.
