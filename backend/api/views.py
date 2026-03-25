from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from django.http import JsonResponse
from .models import UserPreferences, CalmZone, RouteRequest
from .utils.data_aggregator import DataAggregator
from .utils.data_sources import DataSourceManager, geocode_address, geocode_search
from .utils.routing import get_walking_route
from ml_model.predict import predict_density, predict_density_grid, predict_density_by_zone, predict_density_grid_by_zone
from .utils.zones_config import resolve_zone, list_zones_for_api
import json
import math
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

@api_view(['GET'])
def test_api(request):
    """Endpoint de test pour vérifier que l'API fonctionne"""
    return Response({
        'message': 'API SafePath fonctionnelle ! 🚀',
        'status': 'ok',
        'endpoints': {
            'calculate_route': '/api/calculate-route/',
            'user_preferences': '/api/user-preferences/',
            'calm_zones': '/api/calm-zones/',
            'zones': '/api/zones/',
            'density_prediction': '/api/density-prediction/',
            'geocode': '/api/geocode/',
            'test': '/api/test/',
            'health': '/api/health/'
        },
        'timestamp': datetime.now().isoformat()
    })

@api_view(['GET'])
def health_check(request):
    """Endpoint de vérification de santé"""
    return Response({
        'status': 'healthy',
        'service': 'SafePath API',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
    })


@api_view(['GET'])
def geocode_search_view(request):
    """
    Géocode une requête de recherche (lieu, adresse, POI).
    GET ?q=Tour+Eiffel → { lat, lng, display_name }
    """
    q = (request.GET.get('q') or '').strip()
    if not q:
        return Response({'error': 'Paramètre q requis'}, status=status.HTTP_400_BAD_REQUEST)
    result = geocode_search(q)
    if not result:
        return Response({'error': 'Lieu introuvable'}, status=status.HTTP_404_NOT_FOUND)
    return Response(result)


def _resolve_coordinates(location):
    """
    Convertit une localisation en coordonnées {lat, lng}.
    Accepte: {lat, lng} ou {street, city, postal_code}
    Returns: (dict avec lat/lng, error_msg) - error_msg non vide si échec
    """
    if 'lat' in location and 'lng' in location:
        try:
            lat = float(location['lat'])
            lng = float(location['lng'])
            return {'lat': lat, 'lng': lng}, None
        except (TypeError, ValueError):
            return None, 'Coordonnées invalides'
    # Support aussi 'lon' pour compatibilité
    if 'lat' in location and 'lon' in location:
        try:
            lat = float(location['lat'])
            lng = float(location['lon'])
            return {'lat': lat, 'lng': lng}, None
        except (TypeError, ValueError):
            return None, 'Coordonnées invalides'
    street = location.get('street', '') or ''
    city = location.get('city', '') or ''
    postal_code = location.get('postal_code', '') or ''
    if not city and not postal_code:
        return None, 'Ville ou code postal requis'
    coords = geocode_address(street, city, postal_code)
    if coords:
        return coords, None
    return None, f'Adresse introuvable: {street}, {postal_code} {city}'


class CalculateRouteView(APIView):
    """Endpoint de calcul de trajet avec données simulées"""
    
    def post(self, request):
        try:
            origin_raw = request.data['origin']
            destination_raw = request.data['destination']
            user_id = request.data.get('user_id', 'anonymous')
            preferences = request.data.get('preferences', {})
            
            # Géocodage en parallèle si adresses fournies (réduit le temps total)
            with ThreadPoolExecutor(max_workers=2) as executor:
                fut_orig = executor.submit(_resolve_coordinates, origin_raw)
                fut_dest = executor.submit(_resolve_coordinates, destination_raw)
                try:
                    origin, err = fut_orig.result(timeout=6)
                except Exception:
                    origin, err = None, "timeout géocodage"
                if err:
                    return Response({'error': f'Départ: {err}'}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    destination, err = fut_dest.result(timeout=6)
                except Exception:
                    destination, err = None, "timeout géocodage"
                if err:
                    return Response({'error': f'Destination: {err}'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Récupère ou crée les préférences utilisateur
            user_prefs, _ = UserPreferences.objects.get_or_create(
                user_id=user_id,
                defaults={
                    'max_crowd_density': preferences.get('maxDensity', 0.7),
                    'avoid_main_roads': preferences.get('avoidMainRoads', True),
                    'prefer_parks': preferences.get('preferParks', True),
                    'noise_sensitivity': preferences.get('noiseSensitivity', 5),
                    'consider_public_transport': preferences.get('considerPublicTransport', True),
                    'transport_factor': preferences.get('transportFactor', 0.15)
                }
            )
            
            # Agrégation des données open data (trafic, météo, flux piétons, événements)
            data_aggregator = DataAggregator()
            data_manager = DataSourceManager()

            # OSRM + données externes en parallèle (réduit le temps total)
            def _osrm():
                return get_walking_route(
                    origin['lng'], origin['lat'],
                    destination['lng'], destination['lat']
                )
            def _traffic():
                return data_manager.get_traffic_data(origin)
            def _weather():
                return data_manager.get_weather_data(origin)
            def _pedestrian():
                return data_manager.get_pedestrian_flow_data(origin)
            def _events():
                return data_manager.get_events_data(origin)

            _timeout = 5
            with ThreadPoolExecutor(max_workers=5) as executor:
                fut_osrm = executor.submit(_osrm)
                fut_t = executor.submit(_traffic)
                fut_w = executor.submit(_weather)
                fut_p = executor.submit(_pedestrian)
                fut_e = executor.submit(_events)
                try:
                    path, instructions, osrm_distance = fut_osrm.result(timeout=_timeout)
                except Exception:
                    path, instructions, osrm_distance = None, None, None
                try:
                    traffic_data = fut_t.result(timeout=_timeout)
                except Exception:
                    traffic_data = {'flow': 0.5, 'confidence': 0.0}
                try:
                    weather_data = fut_w.result(timeout=_timeout)
                except Exception:
                    weather_data = {'weather_factor': 1.0}
                try:
                    pedestrian_data = fut_p.result(timeout=_timeout)
                except Exception:
                    pedestrian_data = {'flow': 0.5, 'confidence': 0.5}
                try:
                    events_data = fut_e.result(timeout=_timeout)
                except Exception:
                    events_data = []

            routing_source = 'OSRM' if path is not None else 'simulated'
            if path is None:
                path = self.generate_route_path(
                    origin['lng'], origin['lat'],
                    destination['lng'], destination['lat']
                )
                instructions = []

            # Densité agrégée (4 points max pour rapidité)
            density_data = data_aggregator.get_density_for_path(path, max_points=4)

            # Facteur transport en commun : lookups en parallèle (cache par zone)
            if getattr(user_prefs, 'consider_public_transport', True):
                transport_factor = getattr(user_prefs, 'transport_factor', 0.15) or 0.15
                from django.core.cache import cache

                def _transit_for(pt):
                    key = f"transit:{round(pt['location']['lat'],3)}:{round(pt['location']['lng'],3)}"
                    stations = cache.get(key)
                    if stations is None:
                        stations = data_manager.get_transit_stations_near_point(
                            pt['location'], radius_m=150
                        )
                        cache.set(key, stations, 300)
                    return pt, stations

                with ThreadPoolExecutor(max_workers=len(density_data)) as exec_transit:
                    futures = [exec_transit.submit(_transit_for, pt) for pt in density_data]
                    for fut in futures:
                        try:
                            pt, stations = fut.result(timeout=6)
                            if stations:
                                pt['density'] = round(min(1.0, pt['density'] + transport_factor * len(stations)), 3)
                                pt['near_transit'] = len(stations)
                        except Exception:
                            pass
            
            # Enrichissement avec prédiction ML par horaire (cartographie prédictive)
            target_hour = request.data.get('target_hour')
            target_datetime = None
            if target_hour is not None:
                now = datetime.now()
                target_datetime = now.replace(
                    hour=int(target_hour) % 24,
                    minute=0, second=0, microsecond=0
                )
            
            for i, pt in enumerate(density_data):
                pred = predict_density(
                    pt['location']['lat'], pt['location']['lng'],
                    target_datetime,
                    skip_realtime=True  # évite des appels API redondants (densité déjà agrégée)
                )
                pt['density'] = round((pt['density'] * 0.6 + pred['density'] * 0.4), 3)
                pt['predicted_for_hour'] = pred.get('hour')
            
            # Calcul des métriques
            distance = int(osrm_distance) if osrm_distance else self.calculate_distance(path)
            stress_score = self.calculate_stress_score(
                path, user_prefs,
                traffic_data=traffic_data,
                weather_data=weather_data,
                density_data=density_data
            )
            estimated_time = distance / (user_prefs.walking_speed * 60)  # minutes
            
            # Zones calmes proches
            calm_zones = self.find_nearby_calm_zones(path)
            
            # Sauvegarde de la requête
            route_request = RouteRequest.objects.create(
                user_id=user_id,
                origin_lat=origin['lat'],
                origin_lng=origin['lng'],
                destination_lat=destination['lat'],
                destination_lng=destination['lng'],
                calculated_route=path,
                instructions=instructions,
                stress_score=stress_score,
                distance=distance,
                user_preferences={
                    'max_crowd_density': user_prefs.max_crowd_density,
                    'avoid_main_roads': user_prefs.avoid_main_roads,
                    'prefer_parks': user_prefs.prefer_parks,
                    'noise_sensitivity': user_prefs.noise_sensitivity,
                    'consider_public_transport': getattr(user_prefs, 'consider_public_transport', True),
                    'transport_factor': getattr(user_prefs, 'transport_factor', 0.15)
                }
            )
            
            response_data = {
                'success': True,
                'route': {
                    'path': path,
                    'instructions': instructions,
                    'total_stress': round(stress_score, 2),
                    'distance': round(distance),
                    'estimated_time': round(estimated_time, 1),
                    'calm_zones': calm_zones,
                    'density_data': density_data,
                    'route_id': route_request.id
                },
                'user_preferences': {
                    'user_id': user_id,
                    'max_crowd_density': user_prefs.max_crowd_density,
                    'avoid_main_roads': user_prefs.avoid_main_roads,
                    'prefer_parks': user_prefs.prefer_parks,
                    'noise_sensitivity': user_prefs.noise_sensitivity
                },
                'metadata': {
                    'algorithm': 'Stress-Aware Path Finder v2.0',
                    'routing': routing_source,
                    'recommendation_type': 'calm_secure',
                    'recommendation_summary': 'Trajet recommandé par SafePath pour limiter le stress et la foule (densité, zones calmes, préférences utilisateur).',
                    'timestamp': datetime.now().isoformat(),
                    'data_sources': [
                        'OSRM (routage piéton)',
                        'OpenStreetMap',
                        'TomTom Traffic',
                        'OpenWeather',
                        'Paris Open Data (flux piétons, événements)',
                        'Transport en commun (proximité stations)'
                    ],
                    'aggregation': 'traffic,weather,pedestrian_flow,events,transit'
                }
            }
            
            return Response(response_data)
            
        except KeyError as e:
            return Response({
                'error': f'Donnée manquante: {str(e)}',
                'required_fields': ['origin', 'destination']
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'error': f'Erreur interne: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def generate_route_path(self, start_lng, start_lat, end_lng, end_lat):
        """Génère un chemin simulé avec points intermédiaires"""
        # Points intermédiaires aléatoires
        num_points = random.randint(3, 7)
        path = [[start_lng, start_lat]]
        
        for i in range(1, num_points - 1):
            progress = i / (num_points - 1)
            lng = start_lng + (end_lng - start_lng) * progress + random.uniform(-0.001, 0.001)
            lat = start_lat + (end_lat - start_lat) * progress + random.uniform(-0.001, 0.001)
            path.append([round(lng, 6), round(lat, 6)])
        
        path.append([end_lng, end_lat])
        return path
    
    def calculate_distance(self, path):
        """Calcule la distance totale en mètres (simplifié)"""
        total = 0
        for i in range(len(path) - 1):
            # Distance euclidienne simplifiée
            dx = (path[i+1][0] - path[i][0]) * 111000  # 1 degré ≈ 111km
            dy = (path[i+1][1] - path[i][1]) * 111000
            total += (dx**2 + dy**2)**0.5
        return max(100, round(total))
    
    def calculate_stress_score(
        self, path, user_prefs,
        traffic_data=None, weather_data=None, density_data=None
    ):
        """Calcule le score de stress à partir des données agrégées"""
        traffic_data = traffic_data or {}
        weather_data = weather_data or {}
        density_data = density_data or []
        
        # Base: densité moyenne sur le chemin
        if density_data:
            avg_density = sum(d.get('density', 0.5) for d in density_data) / len(density_data)
        else:
            avg_density = 0.5
        
        # Score 0-10 basé sur la densité et préférences
        base_score = avg_density * 8.0  # densité 0.5 -> score 4
        
        # Facteur trafic (zones circulées = plus stressant)
        flow = traffic_data.get('flow', 0.5)
        base_score += flow * 2.0
        
        # Facteur météo (pluie = moins de monde = moins stressant)
        weather_factor = weather_data.get('weather_factor', 1.0)
        base_score *= weather_factor
        
        # Ajustements selon préférences utilisateur
        if user_prefs.avoid_main_roads:
            base_score *= 0.8
        if user_prefs.prefer_parks:
            base_score *= 0.9
        
        # Seuil de densité max dépassé = pénalité
        if avg_density > user_prefs.max_crowd_density:
            base_score += (avg_density - user_prefs.max_crowd_density) * 5
        
        # Sensibilité au bruit
        noise_factor = user_prefs.noise_sensitivity / 5.0
        base_score *= (0.7 + 0.3 * noise_factor)
        
        return min(10.0, max(0.5, round(base_score, 1)))
    
    def find_nearby_calm_zones(self, path):
        """Trouve des zones calmes proches du chemin"""
        zones = []
        try:
            # Récupère quelques zones de la base
            calm_zones = CalmZone.objects.all()[:3]
            for zone in calm_zones:
                zones.append({
                    'name': zone.name,
                    'type': zone.zone_type,
                    'location': [zone.longitude, zone.latitude],
                    'comfort_score': zone.comfort_score,
                    'distance': random.randint(50, 500)  # mètres
                })
        except:
            # Zones par défaut si base vide
            zones = [
                {
                    'name': 'Parc tranquille',
                    'type': 'park',
                    'location': [2.357, 48.857],
                    'comfort_score': 0.9,
                    'distance': 150
                },
                {
                    'name': 'Bibliothèque calme',
                    'type': 'library',
                    'location': [2.359, 48.858],
                    'comfort_score': 0.85,
                    'distance': 300
                }
            ]
        return zones
    
class UserPreferencesView(APIView):
    """Gestion des préférences utilisateur"""
    
    def get(self, request):
        user_id = request.GET.get('user_id', 'anonymous')
        try:
            prefs = UserPreferences.objects.get(user_id=user_id)
            return Response({
                'user_id': prefs.user_id,
                'max_crowd_density': prefs.max_crowd_density,
                'avoid_main_roads': prefs.avoid_main_roads,
                'prefer_parks': prefs.prefer_parks,
                'noise_sensitivity': prefs.noise_sensitivity,
                'walking_speed': prefs.walking_speed,
                'created_at': prefs.created_at,
                'updated_at': prefs.updated_at
            })
        except UserPreferences.DoesNotExist:
            return Response({
                'message': f'Aucune préférence trouvée pour {user_id}',
                'default_preferences': {
                    'max_crowd_density': 0.7,
                    'avoid_main_roads': True,
                    'prefer_parks': True,
                    'noise_sensitivity': 5,
                    'walking_speed': 1.4
                }
            })
    
    def post(self, request):
        user_id = request.data.get('user_id', 'anonymous')
        
        prefs, created = UserPreferences.objects.update_or_create(
            user_id=user_id,
            defaults={
                'max_crowd_density': request.data.get('max_crowd_density', 0.7),
                'avoid_main_roads': request.data.get('avoid_main_roads', True),
                'prefer_parks': request.data.get('prefer_parks', True),
                'noise_sensitivity': request.data.get('noise_sensitivity', 5),
                'walking_speed': request.data.get('walking_speed', 1.4),
                'consider_public_transport': request.data.get('consider_public_transport', True),
                'transport_factor': request.data.get('transport_factor', 0.15),
            }
        )
        
        return Response({
            'success': True,
            'message': 'Préférences créées' if created else 'Préférences mises à jour',
            'user_id': prefs.user_id,
            'preferences': {
                'max_crowd_density': prefs.max_crowd_density,
                'avoid_main_roads': prefs.avoid_main_roads,
                'prefer_parks': prefs.prefer_parks,
                'noise_sensitivity': prefs.noise_sensitivity,
                'walking_speed': prefs.walking_speed,
            }
        })

def _get_param(request, key, default=None, param_type=float):
    """Récupère un paramètre GET avec conversion de type"""
    val = request.GET.get(key)
    if val is None:
        return default
    try:
        return param_type(val)
    except (ValueError, TypeError):
        return default


class CalmZonesView(APIView):
    """Liste des zones calmes disponibles"""
    
    def get(self, request):
        lat = _get_param(request, 'lat')
        lng = _get_param(request, 'lng')
        radius = _get_param(request, 'radius', 1000, int)
        
        zones = CalmZone.objects.all()
        
        if lat and lng:
            # Filtrage simple par distance (simulé)
            zones = zones[:5]  # Limite à 5 résultats
        
        zone_list = []
        for zone in zones:
            zone_list.append({
                'id': zone.id,
                'name': zone.name,
                'type': zone.zone_type,
                'type_display': zone.get_zone_type_display(),
                'location': {'lat': zone.latitude, 'lng': zone.longitude},
                'comfort_score': zone.comfort_score,
                'capacity': zone.capacity,
                'opening_hours': zone.opening_hours
            })
        
        return Response({
            'count': len(zone_list),
            'calm_zones': zone_list
        })
    
    def post(self, request):
        """Ajout d'une zone calme (pour démo)"""
        zone = CalmZone.objects.create(
            name=request.data.get('name', 'Nouvelle zone calme'),
            zone_type=request.data.get('zone_type', 'park'),
            latitude=request.data.get('latitude', 48.8566),
            longitude=request.data.get('longitude', 2.3522),
            comfort_score=request.data.get('comfort_score', 0.8),
            capacity=request.data.get('capacity'),
            opening_hours=request.data.get('opening_hours', {})
        )
        
        return Response({
            'success': True,
            'message': 'Zone calme créée',
            'zone': {
                'id': zone.id,
                'name': zone.name,
                'type': zone.zone_type
            }
        })

class EmergencyView(APIView):
    """Trouve la zone calme la plus proche en urgence"""
    
    def get(self, request):
        lat = _get_param(request, 'lat')
        lng = _get_param(request, 'lng')
        
        if not lat or not lng:
            return Response({
                'error': 'Coordonnées requises',
                'usage': '/api/emergency/?lat=48.8566&lng=2.3522'
            }, status=400)
        
        # Cherche la zone calme la plus proche (simulé)
        try:
            zones = CalmZone.objects.all()
            if zones.exists():
                zone = zones.first()  # Pour la démo, prend la première
            else:
                # Crée une zone par défaut si vide
                zone = CalmZone.objects.create(
                    name='Zone de secours',
                    zone_type='park',
                    latitude=lat + 0.001,
                    longitude=lng + 0.001,
                    comfort_score=0.9
                )
        except:
            zone = None
        
        if zone:
            return Response({
                'emergency': True,
                'message': 'Zone calme trouvée',
                'zone': {
                    'name': zone.name,
                    'type': zone.zone_type,
                    'location': {'lat': zone.latitude, 'lng': zone.longitude},
                    'comfort_score': zone.comfort_score,
                    'distance': 250,  # mètres (simulé)
                    'direction': 'Nord-Est',
                    'estimated_walk_time': 3  # minutes
                },
                'instructions': [
                    'Respirez profondément',
                    'Dirigez-vous vers cette zone',
                    'Prenez votre temps'
                ]
            })
        
        return Response({
            'emergency': True,
            'message': 'Aucune zone calme trouvée à proximité',
            'alternative_advice': [
                'Cherchez un café ou une boutique calme',
                'Asseyez-vous sur un banc',
                'Écoutez de la musique relaxante'
            ]
        })


class ZonesListView(APIView):
    """
    Liste des zones (villes) disponibles pour la prédiction de densité.
    GET /api/zones/ → zones avec id et label compréhensible.
    """
    def get(self, request):
        return Response({
            'zones': list_zones_for_api(),
            'usage': 'Utilisez ?zone=paris ou ?city=Paris avec /api/density-prediction/'
        })


class DensityPredictionView(APIView):
    """
    Prédiction de densité par zone (ville) ou par coordonnées.
    Données en temps réel uniquement (APIs : trafic, météo, flux piétons, événements).

    Par ville (recommandé pour l’utilisateur) :
      GET ?zone=paris&hour=14&grid=5
      GET ?city=Lyon&hour=18

    Par coordonnées (avancé) :
      GET ?lat=48.85&lng=2.35&hour=14
      GET ?south=48.84&west=2.34&north=48.86&east=2.36&hour=18&grid=5
    """
    def get(self, request):
        zone_or_city = request.GET.get('zone') or request.GET.get('city')
        lat = _get_param(request, 'lat')
        lng = _get_param(request, 'lng')
        hour = _get_param(request, 'hour', param_type=int)
        south = _get_param(request, 'south')
        west = _get_param(request, 'west')
        north = _get_param(request, 'north')
        east = _get_param(request, 'east')
        grid_size = _get_param(request, 'grid', 5, int)
        grid_size = min(max(1, grid_size), 10)

        from datetime import datetime as dt
        target_dt = None
        if hour is not None:
            now = dt.now()
            target_dt = now.replace(hour=hour % 24, minute=0, second=0, microsecond=0)

        # 1) Prédiction par zone (ville) : ?zone=paris ou ?city=Lyon
        if zone_or_city:
            resolved = resolve_zone(zone_or_city)
            if not resolved:
                return Response({
                    'error': f'Zone ou ville inconnue: "{zone_or_city}". Utilisez par ex. Paris, Lyon, Marseille.',
                    'zones_available': [z['id'] for z in list_zones_for_api()]
                }, status=400)
            zone_id, zone_config = resolved
            zone_label = zone_config.get('label', zone_id)

            if grid_size <= 1:
                pred = predict_density_by_zone(zone_id, target_dt)
                if not pred:
                    return Response({'error': 'Erreur prédiction zone'}, status=500)
                return Response({
                    'zone_id': zone_id,
                    'zone_label': zone_label,
                    'point': zone_config.get('center'),
                    'density': pred['density'],
                    'confidence': pred['confidence'],
                    'hour': pred.get('hour'),
                    'model_type': pred.get('model_type', 'predictive'),
                    'source': 'Historique (habituel à cette heure) + ajustement temps réel',
                    'prediction_for_hour': pred.get('hour'),
                    'updated_at': dt.now().isoformat()
                })

            out = predict_density_grid_by_zone(zone_id, target_dt, grid_size)
            if not out:
                return Response({'error': 'Erreur prédiction grille zone'}, status=500)
            label, predictions = out
            return Response({
                'zone_id': zone_id,
                'zone_label': label,
                'predictions': predictions,
                'hour': hour,
                'model_type': 'predictive',
                'source': 'Historique (habituel à cette heure) + ajustement temps réel',
                'prediction_for_hour': hour,
                'updated_at': dt.now().isoformat()
            })

        # 2) Point unique : ?lat=...&lng=...
        if lat is not None and lng is not None:
            pred = predict_density(lat, lng, target_dt)
            return Response({
                'point': {'lat': lat, 'lng': lng},
                'density': pred['density'],
                'confidence': pred['confidence'],
                'hour': pred.get('hour'),
                'model_type': pred.get('model_type', 'predictive'),
                'source': 'Historique (habituel à cette heure) + ajustement temps réel',
                'prediction_for_hour': pred.get('hour'),
                'updated_at': dt.now().isoformat()
            })

        # 3) Grille par bbox : ?south=...&west=...&north=...&east=...
        if all(x is not None for x in [south, west, north, east]):
            bbox = (south, west, north, east)
            results = predict_density_grid(bbox, target_dt, grid_size)
            return Response({
                'bbox': {'south': south, 'west': west, 'north': north, 'east': east},
                'predictions': results,
                'hour': hour,
                'model_type': 'predictive',
                'source': 'Historique (habituel à cette heure) + ajustement temps réel',
                'prediction_for_hour': hour,
                'updated_at': dt.now().isoformat()
            })

        return Response({
            'error': 'Paramètres requis: zone ou city (ex. zone=Paris), ou lat+lng, ou south+west+north+east',
            'zones_available': list_zones_for_api()
        }, status=400)