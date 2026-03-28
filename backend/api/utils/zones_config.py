"""
Zones géographiques par ville pour la prédiction de densité.
Chaque zone est identifiée par un libellé compréhensible (ville) et une bbox.
"""
from typing import Dict, List, Optional, Tuple

# Zones prédéfinies : id → bbox (south, west, north, east) + label affiché
ZONES_BY_ID: Dict[str, Dict] = {
    'paris': {
        'label': 'Paris',
        'south': 48.80,
        'west': 2.20,
        'north': 48.91,
        'east': 2.45,
        'center': {'lat': 48.8566, 'lng': 2.3522},
    },
    'lyon': {
        'label': 'Lyon',
        'south': 45.74,
        'west': 4.80,
        'north': 45.78,
        'east': 4.86,
        'center': {'lat': 45.7640, 'lng': 4.8357},
    },
    'marseille': {
        'label': 'Marseille',
        'south': 43.28,
        'west': 5.34,
        'north': 43.32,
        'east': 5.42,
        'center': {'lat': 43.2965, 'lng': 5.3698},
    },
    'bordeaux': {
        'label': 'Bordeaux',
        'south': 44.82,
        'west': -0.62,
        'north': 44.86,
        'east': -0.56,
        'center': {'lat': 44.8378, 'lng': -0.5792},
    },
    'toulouse': {
        'label': 'Toulouse',
        'south': 43.58,
        'west': 1.42,
        'north': 43.62,
        'east': 1.48,
        'center': {'lat': 43.6047, 'lng': 1.4442},
    },
    'nantes': {
        'label': 'Nantes',
        'south': 47.20,
        'west': -1.58,
        'north': 47.24,
        'east': -1.52,
        'center': {'lat': 47.2184, 'lng': -1.5536},
    },
    'lille': {
        'label': 'Lille',
        'south': 50.62,
        'west': 3.05,
        'north': 50.66,
        'east': 3.11,
        'center': {'lat': 50.6292, 'lng': 3.0573},
    },
    'strasbourg': {
        'label': 'Strasbourg',
        'south': 48.56,
        'west': 7.72,
        'north': 48.60,
        'east': 7.78,
        'center': {'lat': 48.5734, 'lng': 7.7521},
    },
}

# Alias ville (nom normalisé) → id
CITY_TO_ZONE_ID: Dict[str, str] = {}
for zid, z in ZONES_BY_ID.items():
    label = z['label'].lower().strip()
    CITY_TO_ZONE_ID[label] = zid
    CITY_TO_ZONE_ID[zid] = zid


def get_zone_by_id(zone_id: str) -> Optional[Dict]:
    """Retourne la config d'une zone par son id (ex: paris, lyon)."""
    return ZONES_BY_ID.get(zone_id.lower().strip()) if zone_id else None


def get_zone_by_city_name(city_name: str) -> Optional[Dict]:
    """Résout un nom de ville (ex: Paris, Lyon) vers la config zone."""
    if not city_name:
        return None
    key = city_name.lower().strip()
    zid = CITY_TO_ZONE_ID.get(key)
    if zid:
        return ZONES_BY_ID.get(zid)
    return None


def resolve_zone(zone_or_city: str) -> Optional[Tuple[str, Dict]]:
    """
    Résout zone_or_city (id ou nom de ville) vers (zone_id, config).
    Returns: (zone_id, config) ou None si introuvable.
    """
    if not zone_or_city:
        return None
    key = zone_or_city.lower().strip()
    zid = CITY_TO_ZONE_ID.get(key) or (key if key in ZONES_BY_ID else None)
    if not zid:
        return None
    config = ZONES_BY_ID.get(zid)
    if config:
        return (zid, config)
    return None


def get_bbox_for_zone(zone_id: str) -> Optional[Tuple[float, float, float, float]]:
    """Retourne (south, west, north, east) pour une zone."""
    z = get_zone_by_id(zone_id)
    if not z:
        return None
    return (z['south'], z['west'], z['north'], z['east'])


def list_zones_for_api() -> List[Dict]:
    """Liste des zones pour l’API (dropdown, etc.)."""
    return [
        {'id': zid, 'label': z['label'], 'center': z.get('center')}
        for zid, z in ZONES_BY_ID.items()
    ]
