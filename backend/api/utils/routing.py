"""
Routage pieton via OSRM (Open Source Routing Machine).
Retourne des chemins reels bases sur les donnees OpenStreetMap.
"""
from typing import Dict, List, Optional, Tuple

import requests

OSRM_URL = 'https://router.project-osrm.org/route/v1/foot'
OSRM_TIMEOUT = 2.5


def _get_cache(key):
    try:
        from django.core.cache import cache

        return cache.get(key)
    except Exception:
        return None


def _set_cache(key, value, ttl):
    try:
        from django.core.cache import cache

        cache.set(key, value, ttl)
    except Exception:
        pass


def get_walking_route(
    start_lng: float,
    start_lat: float,
    end_lng: float,
    end_lat: float,
) -> Tuple[Optional[List[List[float]]], Optional[List[Dict]], Optional[float]]:
    """
    Recupere un itineraire pieton reel via OSRM.
    Returns: (path, instructions, distance) ou (None, None, None) si echec.
    """
    cache_key = (
        f"osrm:{round(start_lng, 5)}:{round(start_lat, 5)}:"
        f"{round(end_lng, 5)}:{round(end_lat, 5)}"
    )
    cached = _get_cache(cache_key)
    if cached:
        return cached

    coords = f"{start_lng},{start_lat};{end_lng},{end_lat}"
    url = f"{OSRM_URL}/{coords}"
    params = {
        'overview': 'simplified',
        'geometries': 'geojson',
        'steps': 'true',
    }

    try:
        response = requests.get(url, params=params, timeout=OSRM_TIMEOUT)
        if response.status_code != 200:
            return None, None, None

        data = response.json()
        if data.get('code') != 'Ok':
            return None, None, None

        routes = data.get('routes', [])
        if not routes:
            return None, None, None

        route = routes[0]
        geometry = route.get('geometry', {})
        coordinates = geometry.get('coordinates', [])
        path = [[round(coord[0], 6), round(coord[1], 6)] for coord in coordinates]

        instructions = []
        for leg in route.get('legs', []):
            for step in leg.get('steps', []):
                maneuver = step.get('maneuver', {})
                instructions.append({
                    'type': maneuver.get('type', 'turn'),
                    'modifier': maneuver.get('modifier', ''),
                    'name': step.get('name', '') or step.get('ref', ''),
                    'distance': step.get('distance', 0),
                    'duration': step.get('duration', 0),
                })

        distance = route.get('distance', 0)
        payload = (path, instructions, distance)
        _set_cache(cache_key, payload, 900)
        return payload
    except Exception:
        return None, None, None


def decode_polyline(polyline_str: str) -> List[List[float]]:
    """Decode une polyline Google (si OSRM retourne encoded)."""
    result = []
    index = 0
    lat = 0
    lng = 0
    while index < len(polyline_str):
        shift = 0
        result_lat = 0
        while True:
            value = ord(polyline_str[index]) - 63
            index += 1
            result_lat |= (value & 0x1f) << shift
            shift += 5
            if value < 0x20:
                break
        result_lat = ~(result_lat >> 1) if result_lat & 1 else result_lat >> 1
        lat += result_lat / 1e5

        shift = 0
        result_lng = 0
        while True:
            value = ord(polyline_str[index]) - 63
            index += 1
            result_lng |= (value & 0x1f) << shift
            shift += 5
            if value < 0x20:
                break
        result_lng = ~(result_lng >> 1) if result_lng & 1 else result_lng >> 1
        lng += result_lng / 1e5

        result.append([lng, lat])
    return result
