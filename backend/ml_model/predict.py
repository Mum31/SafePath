"""
Prediction de densite par zone (ville) et horaire.
La sortie combine une base historique, une variation spatiale stable
et un ajustement temps reel quand l'horaire cible est proche.
"""
import hashlib
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from .historical_profiles import get_historical_density


def _which_zone_for_point(lat: float, lng: float) -> Optional[str]:
    try:
        from api.utils.zones_config import ZONES_BY_ID

        for zone_id, zone in ZONES_BY_ID.items():
            south, west, north, east = zone['south'], zone['west'], zone['north'], zone['east']
            if south <= lat <= north and west <= lng <= east:
                return zone_id
    except Exception:
        pass
    return None


def _get_zone_config(zone_id: Optional[str]) -> Optional[Dict]:
    if not zone_id:
        return None

    try:
        from api.utils.zones_config import get_zone_by_id

        return get_zone_by_id(zone_id)
    except Exception:
        return None


def _stable_point_noise(lat: float, lng: float, hour: int, day_of_week: int) -> float:
    payload = f'{round(float(lat), 4)}:{round(float(lng), 4)}:{hour % 24}:{day_of_week}'
    digest = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    value = int(digest[:8], 16) / 0xFFFFFFFF
    return (value - 0.5) * 2


def _compute_spatial_adjustment(zone_id: Optional[str], lat: float, lng: float, hour: int, day_of_week: int) -> float:
    zone = _get_zone_config(zone_id)
    noise = _stable_point_noise(lat, lng, hour, day_of_week)

    if not zone:
        return round(noise * 0.03, 3)

    south, west, north, east = zone['south'], zone['west'], zone['north'], zone['east']
    center = zone.get('center', {})
    lat_span = max(north - south, 1e-6)
    lng_span = max(east - west, 1e-6)

    relative_y = min(max((float(lat) - south) / lat_span, 0.0), 1.0)
    relative_x = min(max((float(lng) - west) / lng_span, 0.0), 1.0)

    center_lat = center.get('lat', (south + north) / 2)
    center_lng = center.get('lng', (west + east) / 2)
    dx = (float(lng) - center_lng) / lng_span
    dy = (float(lat) - center_lat) / lat_span
    center_distance = min(1.0, math.sqrt(dx * dx + dy * dy) * 1.35)

    center_boost = (1 - center_distance) * 0.08 - 0.025
    east_west_wave = (relative_x - 0.5) * 0.05
    north_south_wave = (0.5 - relative_y) * 0.04
    micro_variation = noise * 0.025

    return round(center_boost + east_west_wave + north_south_wave + micro_variation, 3)


def _smoothed_historical_density(zone_id: Optional[str], hour: int, day_of_week: int) -> float:
    hour = hour % 24
    previous_density = get_historical_density(zone_id, (hour - 1) % 24, day_of_week)
    current_density = get_historical_density(zone_id, hour, day_of_week)
    next_density = get_historical_density(zone_id, (hour + 1) % 24, day_of_week)
    return round(previous_density * 0.2 + current_density * 0.6 + next_density * 0.2, 3)


def predict_density(
    lat: float,
    lng: float,
    target_datetime: Optional[datetime] = None,
    skip_realtime: bool = False,
) -> Dict:
    """
    Predit la densite pour un point a un horaire cible.
    La base provient du profil historique par heure/jour,
    avec une legere variation spatiale stable pour eviter des grilles uniformes.
    """
    dt = target_datetime or datetime.now()
    hour = dt.hour
    day_of_week = dt.weekday()
    zone_id = _which_zone_for_point(lat, lng)

    historical = _smoothed_historical_density(zone_id, hour, day_of_week)
    spatial_adjustment = _compute_spatial_adjustment(zone_id, lat, lng, hour, day_of_week)
    density = historical + spatial_adjustment
    model_type = 'predictive'
    confidence = 0.78 if zone_id else 0.72

    if not skip_realtime:
        now = datetime.now()
        delta_hours = abs((dt - now).total_seconds() / 3600)
        if delta_hours <= 4:
            try:
                from api.utils.data_aggregator import DataAggregator

                aggregator = DataAggregator()
                point = {'lat': lat, 'lng': lng}
                aggregated = aggregator.get_aggregated_density_for_point(point, target_datetime=dt)
                realtime_density = aggregated['density']
                realtime_weight = round(max(0.12, 0.35 - delta_hours * 0.06), 3)
                density = round((1 - realtime_weight) * density + realtime_weight * realtime_density, 3)
                model_type = 'predictive_realtime_blended'
                confidence = min(0.9, round(0.76 + realtime_weight * 0.35, 2))
            except Exception:
                pass

    density = min(0.98, max(0.05, density))

    return {
        'density': round(density, 3),
        'confidence': round(confidence, 2),
        'hour': hour,
        'day_of_week': day_of_week,
        'model_type': model_type,
        'historical_base': round(historical, 3),
        'spatial_adjustment': round(spatial_adjustment, 3),
    }


def predict_density_grid(
    bbox: Tuple[float, float, float, float],
    target_datetime: Optional[datetime] = None,
    grid_size: int = 5,
) -> List[Dict]:
    """
    Predit la densite sur une grille pour l'horaire cible.
    bbox: (south, west, north, east)
    """
    south, west, north, east = bbox
    dt = target_datetime or datetime.now()
    results = []

    for row in range(grid_size):
        for column in range(grid_size):
            lat = south + (north - south) * (row + 0.5) / grid_size
            lng = west + (east - west) * (column + 0.5) / grid_size
            prediction = predict_density(lat, lng, dt)
            results.append(
                {
                    'location': {'lat': lat, 'lng': lng},
                    'density': prediction['density'],
                    'confidence': prediction['confidence'],
                    'model_type': prediction.get('model_type', 'predictive'),
                    'spatial_adjustment': prediction.get('spatial_adjustment', 0.0),
                }
            )

    return results


def predict_density_by_zone(
    zone_id: str,
    target_datetime: Optional[datetime] = None,
) -> Optional[Dict]:
    """
    Predit la densite pour une zone a l'horaire cible.
    """
    try:
        from api.utils.zones_config import get_zone_by_id

        zone = get_zone_by_id(zone_id)
        if not zone:
            return None

        center = zone.get('center', {})
        lat, lng = center.get('lat'), center.get('lng')
        if lat is None or lng is None:
            return None

        prediction = predict_density(lat, lng, target_datetime)
        prediction['zone_id'] = zone_id
        prediction['zone_label'] = zone.get('label', zone_id)
        return prediction
    except Exception:
        return None


def predict_density_grid_by_zone(
    zone_id: str,
    target_datetime: Optional[datetime] = None,
    grid_size: int = 5,
) -> Optional[Tuple[str, List[Dict]]]:
    """
    Predit la densite sur une grille pour une zone.
    Retourne (zone_label, predictions).
    """
    try:
        from api.utils.zones_config import get_bbox_for_zone, get_zone_by_id

        zone = get_zone_by_id(zone_id)
        if not zone:
            return None

        bbox = get_bbox_for_zone(zone_id)
        if not bbox:
            return None

        label = zone.get('label', zone_id)
        results = predict_density_grid(bbox, target_datetime, grid_size)
        for prediction in results:
            prediction['zone_id'] = zone_id
            prediction['zone_label'] = label
        return (label, results)
    except Exception:
        return None
