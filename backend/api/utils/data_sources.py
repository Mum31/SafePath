import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
GEOCODE_TIMEOUT = 3
FAST_HTTP_TIMEOUT = 1.5
OSM_FALLBACK_TIMEOUT = 1.8
PARIS_BOUNDS = {
    'south': 48.80,
    'west': 2.20,
    'north': 48.91,
    'east': 2.45,
}


def _cache_get(key):
    try:
        from django.core.cache import cache

        return cache.get(key)
    except Exception:
        return None


def _cache_set(key, value, ttl):
    try:
        from django.core.cache import cache

        cache.set(key, value, ttl)
    except Exception:
        pass


def _point_cache_key(prefix: str, point: Dict) -> str:
    return f"{prefix}:{round(point['lat'], 3)}:{round(point['lng'], 3)}"


def _clean_address_part(value: Optional[str]) -> str:
    return (value or '').strip()


def _pick_place_name(address: Optional[Dict], fallback: str) -> str:
    address = address or {}
    return (
        _clean_address_part(address.get('attraction'))
        or _clean_address_part(address.get('amenity'))
        or _clean_address_part(address.get('shop'))
        or _clean_address_part(address.get('tourism'))
        or _clean_address_part(address.get('leisure'))
        or _clean_address_part(address.get('building'))
        or _clean_address_part(address.get('road'))
        or fallback
    )


def _build_address_line(address: Optional[Dict], fallback: str) -> str:
    address = address or {}
    house_number = _clean_address_part(address.get('house_number'))
    road = _clean_address_part(address.get('road') or address.get('pedestrian') or address.get('footway'))
    neighbourhood = _clean_address_part(
        address.get('neighbourhood') or address.get('suburb') or address.get('quarter')
    )
    city = _clean_address_part(
        address.get('city') or address.get('town') or address.get('village') or address.get('municipality')
    )
    postcode = _clean_address_part(address.get('postcode'))

    street = ' '.join(part for part in [house_number, road] if part)
    locality = ' '.join(part for part in [postcode, city] if part)

    parts = [part for part in [street, neighbourhood, locality] if part]
    return ', '.join(parts) if parts else fallback


def _is_in_paris_area(point: Dict) -> bool:
    lat = float(point['lat'])
    lng = float(point['lng'])
    return (
        PARIS_BOUNDS['south'] <= lat <= PARIS_BOUNDS['north']
        and PARIS_BOUNDS['west'] <= lng <= PARIS_BOUNDS['east']
    )


def geocode_address(street: str, city: str, postal_code: str) -> Optional[Dict]:
    """
    Convertit une adresse (rue, ville, code postal) en coordonnees lat/lng.
    Utilise TomTom puis Nominatim en fallback.
    """
    street = (street or '').strip()
    city = (city or '').strip()
    postal_code = (postal_code or '').strip()
    if not city and not postal_code:
        return None

    parts = []
    if street:
        parts.append(street)
    if postal_code and city:
        parts.append(f"{postal_code} {city}")
    elif postal_code:
        parts.append(postal_code)
    elif city:
        parts.append(city)

    address_query = ', '.join(parts) + ', France'
    result = _geocode_query_cached(address_query)
    if result is not None:
        return result

    if street and (city or postal_code):
        fallback_query = f"{street}, {city or postal_code}, France"
        if fallback_query != address_query:
            return _geocode_query_cached(fallback_query)
    return None


def _geocode_query_cached(address_query: str) -> Optional[Dict]:
    cache_key = f"geocode:{hash(address_query) % (2**32)}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    tomtom_key = os.getenv('TOMTOM_API_KEY', '')
    if tomtom_key:
        try:
            url = f"https://api.tomtom.com/search/2/geocode/{requests.utils.quote(address_query)}.json"
            resp = requests.get(
                url,
                params={'key': tomtom_key, 'limit': 1, 'countrySet': 'FR'},
                timeout=GEOCODE_TIMEOUT,
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get('results', [])
                if results:
                    pos = results[0].get('position', {})
                    lat, lon = pos.get('lat'), pos.get('lon')
                    if lat is not None and lon is not None:
                        result = {'lat': float(lat), 'lng': float(lon)}
                        _cache_set(cache_key, result, 86400)
                        return result
        except Exception:
            pass

    try:
        resp = requests.get(
            'https://nominatim.openstreetmap.org/search',
            params={'q': address_query, 'format': 'json', 'limit': 1},
            headers={'User-Agent': 'SafePath-PFE/1.0'},
            timeout=GEOCODE_TIMEOUT,
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                result = {'lat': float(results[0]['lat']), 'lng': float(results[0]['lon'])}
                _cache_set(cache_key, result, 86400)
                return result
    except Exception:
        pass

    return None


def geocode_search(query: str) -> Optional[Dict]:
    """
    Geocode une requete libre (lieu, adresse, POI) pour la barre de recherche.
    """
    q = (query or '').strip()
    if not q:
        return None

    address_query = q + ', France'
    cache_key = f"geocode_search:{hash(address_query) % (2**32)}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    tomtom_key = os.getenv('TOMTOM_API_KEY', '')
    if tomtom_key:
        try:
            url = f"https://api.tomtom.com/search/2/geocode/{requests.utils.quote(address_query)}.json"
            resp = requests.get(
                url,
                params={'key': tomtom_key, 'limit': 1, 'countrySet': 'FR'},
                timeout=GEOCODE_TIMEOUT,
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get('results', [])
                if results:
                    result = results[0]
                    pos = result.get('position', {})
                    lat, lon = pos.get('lat'), pos.get('lon')
                    if lat is not None and lon is not None:
                        addr = result.get('address', {}) or {}
                        payload = {
                            'lat': float(lat),
                            'lng': float(lon),
                            'name': (
                                (result.get('poi') or {}).get('name')
                                or addr.get('streetName')
                                or addr.get('municipality')
                                or q
                            ),
                            'address': addr.get('freeformAddress') or q,
                            'display_name': addr.get('freeformAddress') or addr.get('municipality') or q,
                        }
                        _cache_set(cache_key, payload, 86400)
                        return payload
        except Exception:
            pass

    try:
        resp = requests.get(
            'https://nominatim.openstreetmap.org/search',
            params={'q': address_query, 'format': 'json', 'limit': 1, 'addressdetails': 1},
            headers={'User-Agent': 'SafePath-PFE/1.0'},
            timeout=GEOCODE_TIMEOUT,
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                address = results[0].get('address') or {}
                display_name = results[0].get('display_name', q)
                payload = {
                    'lat': float(results[0]['lat']),
                    'lng': float(results[0]['lon']),
                    'name': results[0].get('name') or _pick_place_name(address, q),
                    'address': _build_address_line(address, display_name),
                    'display_name': display_name,
                }
                _cache_set(cache_key, payload, 86400)
                return payload
    except Exception:
        pass

    return None


def reverse_geocode(lat: float, lng: float) -> Optional[Dict]:
    point = {'lat': float(lat), 'lng': float(lng)}
    cache_key = _point_cache_key('reverse_geocode', point)
    cached = _cache_get(cache_key)
    if cached:
        return cached

    fallback = f"{point['lat']:.5f}, {point['lng']:.5f}"

    try:
        resp = requests.get(
            'https://nominatim.openstreetmap.org/reverse',
            params={
                'lat': point['lat'],
                'lon': point['lng'],
                'format': 'jsonv2',
                'zoom': 18,
                'addressdetails': 1,
            },
            headers={'User-Agent': 'SafePath-PFE/1.0'},
            timeout=GEOCODE_TIMEOUT,
        )
        if resp.status_code == 200:
            result = resp.json() or {}
            address = result.get('address') or {}
            display_name = result.get('display_name') or fallback
            payload = {
                'lat': point['lat'],
                'lng': point['lng'],
                'name': result.get('name') or _pick_place_name(address, display_name),
                'address': _build_address_line(address, display_name),
                'display_name': display_name,
            }
            _cache_set(cache_key, payload, 86400)
            return payload
    except Exception:
        pass

    return None


class DataSourceManager:
    def __init__(self):
        self.sources = {
            'openstreetmap': {
                'url': 'https://nominatim.openstreetmap.org/search',
                'rate_limit': 1,
            },
            'overpass': {
                'url': OVERPASS_URL,
            },
            'tomtom_traffic': {
                'url': 'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json',
                'api_key': os.getenv('TOMTOM_API_KEY', ''),
            },
            'openweather': {
                'url': 'https://api.openweathermap.org/data/2.5/weather',
                'api_key': os.getenv('OPENWEATHER_API_KEY', ''),
            },
            'paris_opendata_pietons': {
                'url': 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptage-compteur/records',
                'limit': 100,
            },
            'paris_opendata_events': {
                'url': 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris/records',
                'limit': 50,
            },
        }

    def get_osm_data(self, query: str, bbox: Optional[List] = None) -> List[Dict]:
        params = {
            'q': query,
            'format': 'json',
            'limit': 10,
            'countrycodes': 'fr',
        }
        if bbox:
            params['viewbox'] = ','.join(map(str, bbox))
            params['bounded'] = 1

        try:
            response = requests.get(
                self.sources['openstreetmap']['url'],
                params=params,
                headers={'User-Agent': 'SafePath-PFE/1.0'},
                timeout=FAST_HTTP_TIMEOUT,
            )
            return response.json()
        except Exception:
            return []

    def get_traffic_data(self, point: Dict, radius: int = 500) -> Dict:
        if not self.sources['tomtom_traffic']['api_key']:
            return {'flow': 0.5, 'confidence': 0.0}

        key = _point_cache_key('traffic', point)
        cached = _cache_get(key)
        if cached:
            return cached

        params = {
            'point': f"{point['lat']},{point['lng']}",
            'radius': radius,
            'unit': 'KMPH',
            'thickness': 1,
            'key': self.sources['tomtom_traffic']['api_key'],
        }

        try:
            response = requests.get(
                self.sources['tomtom_traffic']['url'],
                params=params,
                timeout=FAST_HTTP_TIMEOUT,
            )
            data = response.json()
            result = {
                'flow': data.get('flowSegmentData', {}).get('currentSpeed', 30) / 50,
                'confidence': 0.8,
                'timestamp': datetime.now().isoformat(),
            }
            _cache_set(key, result, 300)
            return result
        except Exception:
            return {'flow': 0.5, 'confidence': 0.0}

    def get_weather_data(self, point: Dict) -> Dict:
        if not self.sources['openweather']['api_key']:
            return {'weather_factor': 1.0, 'temperature': 20}

        key = _point_cache_key('weather', point)
        cached = _cache_get(key)
        if cached:
            return cached

        try:
            response = requests.get(
                self.sources['openweather']['url'],
                params={
                    'lat': point['lat'],
                    'lon': point['lng'],
                    'appid': self.sources['openweather']['api_key'],
                    'units': 'metric',
                    'lang': 'fr',
                },
                timeout=FAST_HTTP_TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
            weather_list = data.get('weather') or []
            main_data = data.get('main') or {}

            if not weather_list:
                return {'weather_factor': 1.0, 'temperature': 20}

            weather_first = weather_list[0]
            weather_factor = 1.0
            if 'rain' in data:
                weather_factor = 0.7
            elif weather_first.get('main') == 'Clear':
                weather_factor = 1.2

            result = {
                'temperature': main_data.get('temp', 20),
                'weather': weather_first.get('description', ''),
                'weather_factor': weather_factor,
                'icon': weather_first.get('icon', ''),
            }
            _cache_set(key, result, 600)
            return result
        except Exception:
            return {'weather_factor': 1.0, 'temperature': 20}

    def get_osm_pedestrian_routes(self, bbox: Tuple[float, float, float, float]) -> List[Dict]:
        south, west, north, east = bbox
        query = f"""
        [out:json][timeout:10];
        (
          way["highway"="footway"]({south},{west},{north},{east});
          way["highway"="pedestrian"]({south},{west},{north},{east});
          way["highway"="path"]["foot"!="no"]({south},{west},{north},{east});
          way["highway"="living_street"]({south},{west},{north},{east});
          way["highway"="residential"]({south},{west},{north},{east});
          way["highway"="steps"]({south},{west},{north},{east});
        );
        out body;
        >;
        out skel qt;
        """
        try:
            response = requests.post(
                self.sources['overpass']['url'],
                data={'data': query},
                headers={'User-Agent': 'SafePath-PFE/1.0'},
                timeout=8,
            )
            data = response.json()
            return data.get('elements', [])
        except Exception:
            return []

    def get_pedestrian_flow_data(self, point: Dict, radius_km: float = 0.5) -> Dict:
        key = _point_cache_key('pedestrian', point)
        cached = _cache_get(key)
        if cached:
            return cached

        if _is_in_paris_area(point):
            try:
                response = requests.get(
                    self.sources['paris_opendata_pietons']['url'],
                    params={
                        'limit': 12,
                        'where': (
                            f"within_distance(geo_point_2d, geom'POINT({point['lng']} {point['lat']})', "
                            f"{int(radius_km * 1000)}m)"
                        ),
                    },
                    headers={'User-Agent': 'SafePath-PFE/1.0'},
                    timeout=FAST_HTTP_TIMEOUT,
                )
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('results', [])
                    if results:
                        total = sum(item.get('sum', 0) or 0 for item in results)
                        payload = {
                            'flow': min(1.0, total / 5000) if total else 0.5,
                            'source': 'opendata_paris',
                            'confidence': 0.85,
                            'counters_count': len(results),
                        }
                        _cache_set(key, payload, 300)
                        return payload
            except Exception:
                pass

        try:
            lat, lng = point['lat'], point['lng']
            delta = 0.0045
            query = f"""
            [out:json][timeout:8];
            (
              node["amenity"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
              node["shop"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
              node["tourism"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
            );
            out body;
            """
            response = requests.post(
                OVERPASS_URL,
                data={'data': query},
                headers={'User-Agent': 'SafePath-PFE/1.0'},
                timeout=OSM_FALLBACK_TIMEOUT,
            )
            data = response.json()
            count = len([item for item in data.get('elements', []) if item.get('type') == 'node'])
            payload = {
                'flow': min(0.9, 0.2 + (count / 80)),
                'source': 'osm_poi_estimation',
                'confidence': 0.6,
                'poi_count': count,
            }
            _cache_set(key, payload, 300)
            return payload
        except Exception:
            payload = {'flow': 0.5, 'source': 'default', 'confidence': 0.0}
            _cache_set(key, payload, 120)
            return payload

    def get_events_data(self, point: Dict, radius_km: float = 2.0) -> List[Dict]:
        key = _point_cache_key('events', point)
        cached = _cache_get(key)
        if cached is not None:
            return cached

        if not _is_in_paris_area(point):
            _cache_set(key, [], 300)
            return []

        try:
            response = requests.get(
                self.sources['paris_opendata_events']['url'],
                params={
                    'limit': 10,
                    'where': (
                        f"within_distance(geo_point_2d, geom'POINT({point['lng']} {point['lat']})', "
                        f"{int(radius_km * 1000)}m)"
                    ),
                },
                headers={'User-Agent': 'SafePath-PFE/1.0'},
                timeout=FAST_HTTP_TIMEOUT,
            )
            if response.status_code == 200:
                data = response.json()
                results = [
                    {
                        'title': item.get('title', 'Evenement'),
                        'location': item.get('geo_point_2d', {}),
                        'address': item.get('address', ''),
                        'density_impact': 0.3,
                    }
                    for item in (data.get('results', [])[:10])
                ]
                _cache_set(key, results, 300)
                return results
        except Exception:
            pass

        _cache_set(key, [], 120)
        return []

    def get_transit_stations_near_point(self, point: Dict, radius_m: int = 200) -> List[Dict]:
        key = f"{_point_cache_key('transit', point)}:{radius_m}"
        cached = _cache_get(key)
        if cached is not None:
            return cached

        lat, lng = point['lat'], point['lng']
        delta = radius_m / 111000
        query = f"""
        [out:json][timeout:6];
        (
          node["public_transport"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
          node["railway"="station"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
          node["amenity"="bus_station"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
        );
        out body;
        """

        try:
            response = requests.post(
                OVERPASS_URL,
                data={'data': query},
                headers={'User-Agent': 'SafePath-PFE/1.0'},
                timeout=OSM_FALLBACK_TIMEOUT,
            )
            if response.status_code != 200:
                return []

            data = response.json()
            stations = [
                {
                    'lat': item.get('lat'),
                    'lng': item.get('lon'),
                    'name': item.get('tags', {}).get('name', 'Station'),
                    'type': item.get('tags', {}).get('public_transport')
                    or item.get('tags', {}).get('railway', 'transit'),
                }
                for item in data.get('elements', [])
                if item.get('lat') and item.get('lon')
            ]
            _cache_set(key, stations, 300)
            return stations
        except Exception:
            _cache_set(key, [], 120)
            return []
