"""
Profils historiques de densité par zone et horaire.
Permet de prédire "ce qu'il y aura probablement à l'heure H" (ex: 18h centre-ville dense, 6h faible).
Sources : density_history.csv (timestamps + coords) et patterns heure / jour.
"""
import os
from typing import Dict, Optional, Tuple

import pandas as pd

HISTORY_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'data', 'historical', 'density_history.csv'
)

# Cache des profils chargés
_profiles_cache: Optional[Dict] = None


def _which_zone(lat: float, lng: float) -> Optional[str]:
    """Associe (lat, lng) à un zone_id si dans une bbox connue."""
    try:
        from api.utils.zones_config import ZONES_BY_ID
        for zid, z in ZONES_BY_ID.items():
            s, w, n, e = z['south'], z['west'], z['north'], z['east']
            if s <= lat <= n and w <= lng <= e:
                return zid
    except Exception:
        pass
    return None


def load_historical_profiles() -> Dict:
    """
    Charge le CSV historique et construit :
    - profile_by_hour_weekend: (hour, is_weekend) → densité moyenne (pattern générique)
    - profile_by_zone_hour_weekend: (zone_id, hour, is_weekend) → densité moyenne (par zone)
    Les points du CSV sont assignés à une zone (Paris si dans bbox Paris, etc.).
    """
    global _profiles_cache
    if _profiles_cache is not None:
        return _profiles_cache

    generic = {}  # (hour, is_weekend) -> mean density
    by_zone = {}  # (zone_id, hour, is_weekend) -> mean density

    if os.path.exists(HISTORY_PATH):
        try:
            df = pd.read_csv(HISTORY_PATH)
            if df.empty or 'hour' not in df.columns or 'density' not in df.columns:
                pass
            else:
                is_weekend = (df['day_of_week'] >= 5).astype(int) if 'day_of_week' in df.columns else 0
                if 'day_of_week' in df.columns:
                    df = df.copy()
                    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
                else:
                    df['is_weekend'] = 0

                for (hour, iw), g in df.groupby(['hour', 'is_weekend']):
                    key = (int(hour), int(iw))
                    generic[key] = round(float(g['density'].mean()), 3)

                if 'lat' in df.columns and 'lng' in df.columns:
                    for _, row in df.iterrows():
                        zid = _which_zone(float(row['lat']), float(row['lng']))
                        if zid is None:
                            zid = 'paris'
                        iw = int(row.get('is_weekend', 1 if row.get('day_of_week', 0) >= 5 else 0))
                        key = (zid, int(row['hour']), iw)
                        if key not in by_zone:
                            by_zone[key] = []
                        by_zone[key].append(float(row['density']))
                    by_zone = {k: round(sum(v) / len(v), 3) for k, v in by_zone.items()}
        except Exception:
            pass

    # Profil par défaut si pas de CSV : 18h dense, 6h faible, weekend différent
    if not generic:
        for hour in range(24):
            for iw in (0, 1):
                if hour <= 5 or hour >= 23:
                    d = 0.35
                elif 7 <= hour <= 9 or 17 <= hour <= 19:
                    d = 0.85 if iw == 0 else 0.6
                elif 12 <= hour <= 14:
                    d = 0.8 if iw == 0 else 0.65
                else:
                    d = 0.6 if iw == 0 else 0.5
                generic[(hour, iw)] = round(d, 3)

    _profiles_cache = {
        'by_hour_weekend': generic,
        'by_zone_hour_weekend': by_zone if by_zone else {},
    }
    return _profiles_cache


def get_historical_density(
    zone_id: Optional[str],
    hour: int,
    day_of_week: int
) -> float:
    """
    Retourne la densité historique pour (zone, heure, jour).
    Utilisé pour la prédiction "ce qu'il y aura à l'heure H".
    """
    profiles = load_historical_profiles()
    is_weekend = 1 if day_of_week >= 5 else 0
    key_generic = (hour % 24, is_weekend)
    key_zone = (zone_id, hour % 24, is_weekend) if zone_id else None

    if key_zone and key_zone in profiles.get('by_zone_hour_weekend', {}):
        return profiles['by_zone_hour_weekend'][key_zone]
    return profiles['by_hour_weekend'].get(key_generic, 0.5)


def get_historical_density_for_point(lat: float, lng: float, hour: int, day_of_week: int) -> float:
    """Densité historique pour un point (on associe le point à une zone puis on utilise le profil)."""
    zid = _which_zone(lat, lng)
    return get_historical_density(zid, hour, day_of_week)
