import requests
import os
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'


def geocode_address(street: str, city: str, postal_code: str) -> Optional[Dict]:
    """
    Convertit une adresse (rue, ville, code postal) en coordonnées lat/lng.
    Utilise TomTom puis Nominatim en fallback.
    Returns: {'lat': float, 'lng': float} ou None si échec.
    """
    # Construction de l'adresse pour la requête (format FR: rue, code postal ville, France)
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
    # Fallback: sans code postal (mieux pour les noms de lieux type "Place de la Bastille")
    if street and (city or postal_code):
        fallback_query = f"{street}, {city or postal_code}, France"
        if fallback_query != address_query:
            return _geocode_query_cached(fallback_query)
    return None


def _geocode_query_cached(address_query: str) -> Optional[Dict]:
    """Appel Nominatim/TomTom avec cache. Retourne {'lat', 'lng'} ou None."""
    cache_key = f"geocode:{hash(address_query) % (2**32)}"
    try:
        from django.core.cache import cache
        cached = cache.get(cache_key)
        if cached:
            return cached
    except Exception:
        pass

    tomtom_key = os.getenv('TOMTOM_API_KEY', '')
    if tomtom_key:
        try:
            url = 'https://api.tomtom.com/search/2/geocode/' + requests.utils.quote(address_query) + '.json'
            resp = requests.get(url, params={'key': tomtom_key, 'limit': 1, 'countrySet': 'FR'}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get('results', [])
                if results:
                    pos = results[0].get('position', {})
                    lat, lon = pos.get('lat'), pos.get('lon')
                    if lat is not None and lon is not None:
                        result = {'lat': float(lat), 'lng': float(lon)}
                        try:
                            from django.core.cache import cache
                            cache.set(cache_key, result, 86400)
                        except Exception:
                            pass
                        return result
        except Exception as e:
            print(f"TomTom geocoding: {e}")

    try:
        resp = requests.get(
            'https://nominatim.openstreetmap.org/search',
            params={'q': address_query, 'format': 'json', 'limit': 1},
            headers={'User-Agent': 'SafePath-PFE/1.0'},
            timeout=10
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                r = results[0]
                result = {'lat': float(r['lat']), 'lng': float(r['lon'])}
                try:
                    from django.core.cache import cache
                    cache.set(cache_key, result, 86400)
                except Exception:
                    pass
                return result
    except Exception as e:
        print(f"Nominatim geocoding: {e}")
    return None


def geocode_search(query: str) -> Optional[Dict]:
    """
    Géocode une requête libre (lieu, adresse, POI) pour la barre de recherche.
    Retourne {'lat', 'lng', 'display_name'} ou None.
    """
    q = (query or '').strip()
    if not q:
        return None
    address_query = q + ', France'
    cache_key = f"geocode_search:{hash(address_query) % (2**32)}"
    try:
        from django.core.cache import cache
        cached = cache.get(cache_key)
        if cached:
            return cached
    except Exception:
        pass

    tomtom_key = os.getenv('TOMTOM_API_KEY', '')
    if tomtom_key:
        try:
            url = 'https://api.tomtom.com/search/2/geocode/' + requests.utils.quote(address_query) + '.json'
            resp = requests.get(url, params={'key': tomtom_key, 'limit': 1, 'countrySet': 'FR'}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get('results', [])
                if results:
                    r = results[0]
                    pos = r.get('position', {})
                    lat, lon = pos.get('lat'), pos.get('lon')
                    if lat is not None and lon is not None:
                        addr = r.get('address', {}) or {}
                        display_name = addr.get('freeformAddress') or addr.get('municipality') or q
                        result = {'lat': float(lat), 'lng': float(lon), 'display_name': display_name}
                        try:
                            from django.core.cache import cache
                            cache.set(cache_key, result, 86400)
                        except Exception:
                            pass
                        return result
        except Exception as e:
            print(f"TomTom search geocoding: {e}")

    try:
        resp = requests.get(
            'https://nominatim.openstreetmap.org/search',
            params={'q': address_query, 'format': 'json', 'limit': 1},
            headers={'User-Agent': 'SafePath-PFE/1.0'},
            timeout=10
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                r = results[0]
                result = {
                    'lat': float(r['lat']),
                    'lng': float(r['lon']),
                    'display_name': r.get('display_name', q),
                }
                try:
                    from django.core.cache import cache
                    cache.set(cache_key, result, 86400)
                except Exception:
                    pass
                return result
    except Exception as e:
        print(f"Nominatim search geocoding: {e}")
    return None


class DataSourceManager:
    def __init__(self):
        self.sources = {
            'openstreetmap': {
                'url': 'https://nominatim.openstreetmap.org/search',
                'rate_limit': 1
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
                'limit': 100
            },
            'paris_opendata_events': {
                'url': 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris/records',
                'limit': 50
            }
        }
    
    def get_osm_data(self, query: str, bbox: Optional[List] = None) -> List[Dict]:
        """Récupère les données OpenStreetMap"""
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
                timeout=5
            )
            return response.json()
        except Exception as e:
            print(f"Erreur OSM: {e}")
            return []
    
    def get_traffic_data(self, point: Dict, radius: int = 500) -> Dict:
        """Récupère les données de trafic TomTom"""
        if not self.sources['tomtom_traffic']['api_key']:
            return {'flow': 0.5, 'confidence': 0.0}
        try:
            from django.core.cache import cache
            key = f"traffic:{round(point['lat'],3)}:{round(point['lng'],3)}"
            cached = cache.get(key)
            if cached:
                return cached
        except Exception:
            pass
        params = {
            'point': f"{point['lat']},{point['lng']}",
            'radius': radius,
            'unit': 'KMPH',
            'thickness': 1,
            'key': self.sources['tomtom_traffic']['api_key']
        }
        
        try:
            response = requests.get(
                self.sources['tomtom_traffic']['url'],
                params=params,
                timeout=4
            )
            data = response.json()
            
            result = {
                'flow': data.get('flowSegmentData', {}).get('currentSpeed', 30) / 50,  # Normalisé
                'confidence': 0.8,
                'timestamp': datetime.now().isoformat()
            }
            try:
                cache.set(key, result, 300)  # 5 min
            except Exception:
                pass
            return result
        except:
            return {'flow': 0.5, 'confidence': 0.0}
    
    def get_weather_data(self, point: Dict) -> Dict:
        """Récupère les données météo"""
        try:
            from django.core.cache import cache
            key = f"weather:{round(point['lat'],3)}:{round(point['lng'],3)}"
            cached = cache.get(key)
            if cached:
                return cached
        except Exception:
            pass
        params = {
            'lat': point['lat'],
            'lon': point['lng'],
            'appid': self.sources['openweather']['api_key'],
            'units': 'metric',
            'lang': 'fr'
        }
        
        try:
            response = requests.get(
                self.sources['openweather']['url'],
                params=params,
                timeout=4
            )
            response.raise_for_status()
            data = response.json()
            
            weather_list = data.get('weather') or []
            main_data = data.get('main') or {}
            
            if not weather_list:
                return {'weather_factor': 1.0, 'temperature': 20}
            
            weather_first = weather_list[0]
            
            # Facteur météo sur la densité (pluie = moins de monde)
            weather_factor = 1.0
            if 'rain' in data:
                weather_factor = 0.7
            elif weather_first.get('main') == 'Clear':
                weather_factor = 1.2
            
            result = {
                'temperature': main_data.get('temp', 20),
                'weather': weather_first.get('description', ''),
                'weather_factor': weather_factor,
                'icon': weather_first.get('icon', '')
            }
            try:
                from django.core.cache import cache
                cache.set(f"weather:{round(point['lat'],3)}:{round(point['lng'],3)}", result, 600)  # 10 min
            except Exception:
                pass
            return result
        except Exception:
            return {'weather_factor': 1.0, 'temperature': 20}

    def get_osm_pedestrian_routes(self, bbox: Tuple[float, float, float, float]) -> List[Dict]:
        """Récupère les chemins piétons OSM via Overpass API (footways, pedestrian)"""
        south, west, north, east = bbox
        query = f"""
        [out:json][timeout:25];
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
                timeout=30
            )
            data = response.json()
            return data.get('elements', [])
        except Exception as e:
            print(f"Erreur Overpass: {e}")
            return []

    def get_pedestrian_flow_data(self, point: Dict, radius_km: float = 0.5) -> Dict:
        """Estime le flux piéton - Open Data Paris ou estimation via POI OSM"""
        try:
            # Paris Open Data - compteurs piétons (si disponible)
            url = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptage-compteur/records'
            params = {
                'limit': 20,
                'where': f'within_distance(geo_point_2d, geom\'POINT({point["lng"]} {point["lat"]})\', {int(radius_km*1000)}m)'
            }
            response = requests.get(url, params=params, headers={'User-Agent': 'SafePath-PFE/1.0'}, timeout=10)
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                if results:
                    # Agrégation des comptages
                    total = sum(r.get('sum', 0) or 0 for r in results)
                    return {
                        'flow': min(1.0, total / 5000) if total else 0.5,
                        'source': 'opendata_paris',
                        'confidence': 0.85,
                        'counters_count': len(results)
                    }
        except Exception:
            pass

        # Fallback: estimation via densité POI OSM (zones commerciales = plus de piétons)
        try:
            lat, lng = point['lat'], point['lng']
            delta = 0.005
            query = f"""
            [out:json][timeout:15];
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
                timeout=15
            )
            data = response.json()
            count = len([e for e in data.get('elements', []) if e.get('type') == 'node'])
            # Normalisation: 0-50 POI -> 0.2-0.8 densité
            flow = min(0.9, 0.2 + (count / 80))
            return {
                'flow': flow,
                'source': 'osm_poi_estimation',
                'confidence': 0.6,
                'poi_count': count
            }
        except Exception:
            return {'flow': 0.5, 'source': 'default', 'confidence': 0.0}

    def get_events_data(self, point: Dict, radius_km: float = 2.0) -> List[Dict]:
        """Récupère les événements à proximité - Open Data Paris"""
        try:
            url = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris/records'
            params = {
                'limit': 20,
                'where': f'within_distance(geo_point_2d, geom\'POINT({point["lng"]} {point["lat"]})\', {int(radius_km*1000)}m)'
            }
            response = requests.get(url, params=params, headers={'User-Agent': 'SafePath-PFE/1.0'}, timeout=10)
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                return [
                    {
                        'title': r.get('title', 'Événement'),
                        'location': r.get('geo_point_2d', {}),
                        'address': r.get('address', ''),
                        'density_impact': 0.3  # Événement = +30% densité estimée
                    }
                    for r in results[:10]
                ]
        except Exception:
            pass
        return []

    def get_transit_stations_near_point(
        self, point: Dict, radius_m: int = 200
    ) -> List[Dict]:
        """
        Récupère les stations de transport en commun (métro, bus, tram) à proximité.
        Proximité = augmentation de la densité (zones bondées aux heures de pointe).
        """
        lat, lng = point['lat'], point['lng']
        delta = radius_m / 111000  # approx 1 deg = 111km
        query = f"""
        [out:json][timeout:5];
        (
          node["public_transport"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
          node["railway"="station"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
          node["amenity"="bus_station"]({lat-delta},{lng-delta},{lat+delta},{lng+delta});
        );
        out body;
        """
        try:
            resp = requests.post(
                OVERPASS_URL,
                data={'data': query},
                headers={'User-Agent': 'SafePath-PFE/1.0'},
                timeout=5
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            return [
                {
                    'lat': e.get('lat'),
                    'lng': e.get('lon'),
                    'name': e.get('tags', {}).get('name', 'Station'),
                    'type': e.get('tags', {}).get('public_transport') or e.get('tags', {}).get('railway', 'transit')
                }
                for e in data.get('elements', [])
                if e.get('lat') and e.get('lon')
            ]
        except Exception:
            return []