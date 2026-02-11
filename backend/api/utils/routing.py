"""
Routage piéton via OSRM (Open Source Routing Machine).
Retourne des chemins réels basés sur les données OpenStreetMap.
"""
import requests
from typing import List, Dict, Optional, Tuple

OSRM_URL = 'https://router.project-osrm.org/route/v1/foot'


def get_walking_route(
    start_lng: float, start_lat: float,
    end_lng: float, end_lat: float
) -> Tuple[Optional[List[List[float]]], Optional[List[Dict]], Optional[float]]:
    """
    Récupère un itinéraire piéton réel via OSRM.
    
    Returns:
        (path, instructions, distance) - path en [[lng, lat], ...]
        Ou (None, None, None) si échec
    """
    coords = f"{start_lng},{start_lat};{end_lng},{end_lat}"
    url = f"{OSRM_URL}/{coords}"
    params = {
        'overview': 'full',
        'geometries': 'geojson',
        'steps': 'true',
        'annotations': 'true'
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            return None, None, None
        data = resp.json()
        if data.get('code') != 'Ok':
            return None, None, None
        
        routes = data.get('routes', [])
        if not routes:
            return None, None, None
        
        route = routes[0]
        geometry = route.get('geometry', {})
        coords_list = geometry.get('coordinates', [])
        
        # OSRM retourne [lng, lat]
        path = [[round(c[0], 6), round(c[1], 6)] for c in coords_list]
        
        # Instructions étape par étape
        instructions = []
        legs = route.get('legs', [])
        for leg in legs:
            for step in leg.get('steps', []):
                name = step.get('name', '') or step.get('ref', '')
                maneuver = step.get('maneuver', {})
                instruction_type = maneuver.get('type', 'turn')
                modifier = maneuver.get('modifier', '')
                inst = {
                    'type': instruction_type,
                    'modifier': modifier,
                    'name': name,
                    'distance': step.get('distance', 0),
                    'duration': step.get('duration', 0),
                }
                instructions.append(inst)
        
        distance = route.get('distance', 0)
        return path, instructions, distance
        
    except Exception as e:
        print(f"OSRM routing error: {e}")
        return None, None, None


def decode_polyline(polyline_str: str) -> List[List[float]]:
    """Décode une polyline Google (si OSRM retourne encoded)"""
    # OSRM utilise GeoJSON par défaut, cette fonction est un fallback
    result = []
    index = 0
    lat = 0
    lng = 0
    while index < len(polyline_str):
        shift = 0
        result_lat = 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result_lat |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        result_lat = ~(result_lat >> 1) if result_lat & 1 else result_lat >> 1
        lat += result_lat / 1e5
        
        shift = 0
        result_lng = 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result_lng |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        result_lng = ~(result_lng >> 1) if result_lng & 1 else result_lng >> 1
        lng += result_lng / 1e5
        
        result.append([lng, lat])
    return result
