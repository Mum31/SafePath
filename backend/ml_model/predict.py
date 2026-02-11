"""
Prédiction de densité par zone (ville) et horaire.
= Ce qu'il y aura probablement à l'heure H (pas seulement "maintenant").

Combinaison :
1) Historique (density_history.csv + profils heure/jour) → base prédictive par horaire.
2) Temps réel (APIs : trafic, météo, flux piétons, événements) → ajustement optionnel.
"""
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from .historical_profiles import get_historical_density


def _which_zone_for_point(lat: float, lng: float) -> Optional[str]:
    try:
        from api.utils.zones_config import ZONES_BY_ID
        for zid, z in ZONES_BY_ID.items():
            s, w, n, e = z['south'], z['west'], z['north'], z['east']
            if s <= lat <= n and w <= lng <= e:
                return zid
    except Exception:
        pass
    return None


def predict_density(
    lat: float, lng: float,
    target_datetime: Optional[datetime] = None
) -> Dict:
    """
    Prédit la densité pour un point à un horaire cible.
    Priorité : profil historique pour (zone, heure cible, jour) = "ce qu'il y aura à cette heure".
    Ajustement optionnel avec données temps réel si l'horaire cible est proche de maintenant.
    """
    dt = target_datetime or datetime.now()
    hour = dt.hour
    day_of_week = dt.weekday()
    zone_id = _which_zone_for_point(lat, lng)

    # 1) Base prédictive = historique (ce qu'il y a habituellement à cette heure ce jour-là)
    historical = get_historical_density(zone_id, hour, day_of_week)
    density = historical
    model_type = "predictive"
    confidence = 0.8

    # 2) Ajustement temps réel si l'horaire cible est "maintenant" (à ±2h)
    now = datetime.now()
    delta_hours = abs((dt - now).total_seconds() / 3600)
    if delta_hours <= 2:
        try:
            from api.utils.data_aggregator import DataAggregator
            aggregator = DataAggregator()
            point = {"lat": lat, "lng": lng}
            agg = aggregator.get_aggregated_density_for_point(point, target_datetime=dt)
            realtime = agg["density"]
            density = round(0.65 * historical + 0.35 * realtime, 3)
            model_type = "predictive_realtime"
            confidence = 0.85
        except Exception:
            pass

    density = min(0.98, max(0.05, density))

    return {
        "density": round(density, 3),
        "confidence": round(confidence, 2),
        "hour": hour,
        "day_of_week": day_of_week,
        "model_type": model_type,
        "historical_base": round(historical, 3),
    }


def predict_density_grid(
    bbox: Tuple[float, float, float, float],
    target_datetime: Optional[datetime] = None,
    grid_size: int = 5,
) -> List[Dict]:
    """
    Prédit la densité sur une grille pour l'horaire cible (prédictif par heure).
    bbox: (south, west, north, east)
    """
    south, west, north, east = bbox
    dt = target_datetime or datetime.now()
    results = []

    for i in range(grid_size):
        for j in range(grid_size):
            lat = south + (north - south) * (i + 0.5) / grid_size
            lng = west + (east - west) * (j + 0.5) / grid_size
            pred = predict_density(lat, lng, dt)
            results.append({
                "location": {"lat": lat, "lng": lng},
                "density": pred["density"],
                "confidence": pred["confidence"],
                "model_type": pred.get("model_type", "predictive"),
            })

    return results


def predict_density_by_zone(
    zone_id: str,
    target_datetime: Optional[datetime] = None,
) -> Optional[Dict]:
    """
    Prédit la densité pour une zone (ville) à l'horaire cible.
    = Ce qu'il y aura probablement dans cette ville à cette heure.
    """
    try:
        from api.utils.zones_config import get_zone_by_id
        zone = get_zone_by_id(zone_id)
        if not zone:
            return None
        center = zone.get("center", {})
        lat, lng = center.get("lat"), center.get("lng")
        if lat is None or lng is None:
            return None
        pred = predict_density(lat, lng, target_datetime)
        pred["zone_id"] = zone_id
        pred["zone_label"] = zone.get("label", zone_id)
        return pred
    except Exception:
        return None


def predict_density_grid_by_zone(
    zone_id: str,
    target_datetime: Optional[datetime] = None,
    grid_size: int = 5,
) -> Optional[Tuple[str, List[Dict]]]:
    """
    Prédit la densité sur une grille pour une zone à l'horaire cible.
    Retourne (zone_label, liste de prédictions).
    """
    try:
        from api.utils.zones_config import get_bbox_for_zone, get_zone_by_id
        zone = get_zone_by_id(zone_id)
        if not zone:
            return None
        bbox = get_bbox_for_zone(zone_id)
        if not bbox:
            return None
        label = zone.get("label", zone_id)
        results = predict_density_grid(bbox, target_datetime, grid_size)
        for r in results:
            r["zone_id"] = zone_id
            r["zone_label"] = label
        return (label, results)
    except Exception:
        return None
