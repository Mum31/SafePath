"""
Profils historiques de densite par zone et horaire.
Permet de predire "ce qu'il y aura probablement a l'heure H".
Sources : density_history.csv (timestamps + coords) et profils de secours par heure/jour.
"""
import os
from typing import Dict, Optional

import pandas as pd

HISTORY_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'data', 'historical', 'density_history.csv'
)

_profiles_cache: Optional[Dict] = None


def _default_density(hour: int, is_weekend: int) -> float:
    """Profil de secours pour les heures absentes de l'historique."""
    hour = hour % 24

    if is_weekend:
        weekend_profile = {
            0: 0.16,
            1: 0.16,
            2: 0.16,
            3: 0.16,
            4: 0.16,
            5: 0.18,
            6: 0.2,
            7: 0.25,
            8: 0.32,
            9: 0.38,
            10: 0.46,
            11: 0.54,
            12: 0.6,
            13: 0.64,
            14: 0.66,
            15: 0.62,
            16: 0.58,
            17: 0.54,
            18: 0.5,
            19: 0.46,
            20: 0.36,
            21: 0.28,
            22: 0.22,
            23: 0.18,
        }
        return weekend_profile[hour]

    weekday_profile = {
        0: 0.12,
        1: 0.12,
        2: 0.12,
        3: 0.12,
        4: 0.12,
        5: 0.15,
        6: 0.22,
        7: 0.34,
        8: 0.56,
        9: 0.63,
        10: 0.58,
        11: 0.64,
        12: 0.72,
        13: 0.74,
        14: 0.7,
        15: 0.66,
        16: 0.62,
        17: 0.72,
        18: 0.76,
        19: 0.68,
        20: 0.44,
        21: 0.32,
        22: 0.22,
        23: 0.16,
    }
    return weekday_profile[hour]


def _which_zone(lat: float, lng: float) -> Optional[str]:
    """Associe (lat, lng) a un zone_id si dans une bbox connue."""
    try:
        from api.utils.zones_config import ZONES_BY_ID

        for zid, zone in ZONES_BY_ID.items():
            south, west, north, east = zone['south'], zone['west'], zone['north'], zone['east']
            if south <= lat <= north and west <= lng <= east:
                return zid
    except Exception:
        pass
    return None


def load_historical_profiles() -> Dict:
    """
    Charge le CSV historique et construit :
    - by_hour_weekend: (hour, is_weekend) -> densite moyenne
    - by_zone_hour_weekend: (zone_id, hour, is_weekend) -> densite moyenne
    """
    global _profiles_cache
    if _profiles_cache is not None:
        return _profiles_cache

    generic = {}
    by_zone = {}

    if os.path.exists(HISTORY_PATH):
        try:
            df = pd.read_csv(HISTORY_PATH)
            if not df.empty and 'hour' in df.columns and 'density' in df.columns:
                if 'day_of_week' in df.columns:
                    df = df.copy()
                    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
                else:
                    df['is_weekend'] = 0

                for (hour, iw), group in df.groupby(['hour', 'is_weekend']):
                    key = (int(hour), int(iw))
                    generic[key] = round(float(group['density'].mean()), 3)

                if 'lat' in df.columns and 'lng' in df.columns:
                    for _, row in df.iterrows():
                        zone_id = _which_zone(float(row['lat']), float(row['lng'])) or 'paris'
                        is_weekend = int(row.get('is_weekend', 1 if row.get('day_of_week', 0) >= 5 else 0))
                        key = (zone_id, int(row['hour']), is_weekend)
                        by_zone.setdefault(key, []).append(float(row['density']))
                    by_zone = {key: round(sum(values) / len(values), 3) for key, values in by_zone.items()}
        except Exception:
            pass

    for hour in range(24):
        for is_weekend in (0, 1):
            key = (hour, is_weekend)
            fallback = _default_density(hour, is_weekend)
            if key in generic:
                generic[key] = round(generic[key] * 0.88 + fallback * 0.12, 3)
            else:
                generic[key] = round(fallback, 3)

    _profiles_cache = {
        'by_hour_weekend': generic,
        'by_zone_hour_weekend': by_zone if by_zone else {},
    }
    return _profiles_cache


def get_historical_density(zone_id: Optional[str], hour: int, day_of_week: int) -> float:
    """Retourne la densite historique pour (zone, heure, jour)."""
    profiles = load_historical_profiles()
    is_weekend = 1 if day_of_week >= 5 else 0
    key_generic = (hour % 24, is_weekend)
    key_zone = (zone_id, hour % 24, is_weekend) if zone_id else None

    if key_zone and key_zone in profiles.get('by_zone_hour_weekend', {}):
        return profiles['by_zone_hour_weekend'][key_zone]
    return profiles['by_hour_weekend'].get(key_generic, _default_density(hour, is_weekend))


def get_historical_density_for_point(lat: float, lng: float, hour: int, day_of_week: int) -> float:
    """Densite historique pour un point."""
    zone_id = _which_zone(lat, lng)
    return get_historical_density(zone_id, hour, day_of_week)
