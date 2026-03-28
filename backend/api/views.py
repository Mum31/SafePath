import math
import time
from datetime import datetime, timedelta

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CalmZone, RouteRequest, UserPreferences
from .utils.data_sources import DataSourceManager, geocode_address, geocode_search, reverse_geocode
from .utils.idfm_navitia import IDFMNavitiaClient, IDFMNavitiaError, TRANSPORT_MODES
from .utils.parallel import run_parallel_with_timeout
from .utils.zones_config import list_zones_for_api, resolve_zone
from ml_model.predict import (
    predict_density,
    predict_density_by_zone,
    predict_density_grid,
    predict_density_grid_by_zone,
)

EARTH_RADIUS_M = 6371000


@api_view(['GET'])
def test_api(request):
    return Response(
        {
            'message': 'API SafePath fonctionnelle !',
            'status': 'ok',
            'endpoints': {
                'calculate_route': '/api/calculate-route/',
                'user_preferences': '/api/user-preferences/',
                'calm_zones': '/api/calm-zones/',
                'zones': '/api/zones/',
                'density_prediction': '/api/density-prediction/',
                'geocode': '/api/geocode/',
                'reverse_geocode': '/api/reverse-geocode/',
                'test': '/api/test/',
                'health': '/api/health/',
            },
            'timestamp': datetime.now().isoformat(),
        }
    )


@api_view(['GET'])
def health_check(request):
    return Response(
        {
            'status': 'healthy',
            'service': 'SafePath API',
            'version': '1.0.0',
            'timestamp': datetime.now().isoformat(),
        }
    )


@api_view(['GET'])
def geocode_search_view(request):
    query = (request.GET.get('q') or '').strip()
    if not query:
        return Response({'error': 'Parametre q requis'}, status=status.HTTP_400_BAD_REQUEST)

    result = geocode_search(query)
    if not result:
        return Response({'error': 'Lieu introuvable'}, status=status.HTTP_404_NOT_FOUND)
    return Response(result)


@api_view(['GET'])
def reverse_geocode_view(request):
    lat = _get_param(request, 'lat')
    lng = _get_param(request, 'lng')
    if lat is None or lng is None:
        return Response({'error': 'Parametres lat et lng requis'}, status=status.HTTP_400_BAD_REQUEST)

    result = reverse_geocode(lat, lng)
    if not result:
        return Response({'error': 'Lieu introuvable pour ces coordonnees'}, status=status.HTTP_404_NOT_FOUND)
    return Response(result)


def _resolve_coordinates(location):
    if 'lat' in location and 'lng' in location:
        try:
            return {'lat': float(location['lat']), 'lng': float(location['lng'])}, None
        except (TypeError, ValueError):
            return None, 'Coordonnees invalides'

    if 'lat' in location and 'lon' in location:
        try:
            return {'lat': float(location['lat']), 'lng': float(location['lon'])}, None
        except (TypeError, ValueError):
            return None, 'Coordonnees invalides'

    street = location.get('street', '') or ''
    city = location.get('city', '') or ''
    postal_code = location.get('postal_code', '') or ''
    if not city and not postal_code:
        return None, 'Ville ou code postal requis'

    coords = geocode_address(street, city, postal_code)
    if coords:
        return coords, None
    return None, f'Adresse introuvable: {street}, {postal_code} {city}'


def _distance_meters(lat1, lng1, lat2, lng2):
    lat1_rad = math.radians(float(lat1))
    lng1_rad = math.radians(float(lng1))
    lat2_rad = math.radians(float(lat2))
    lng2_rad = math.radians(float(lng2))

    delta_lat = lat2_rad - lat1_rad
    delta_lng = lng2_rad - lng1_rad

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_M * c


def _distance_to_path_meters(path, lat, lng):
    sampled_path = path or []
    if len(sampled_path) > 24:
        step = max(1, len(sampled_path) // 24)
        sampled_path = sampled_path[::step]
        if sampled_path[-1] != path[-1]:
            sampled_path.append(path[-1])

    distances = []
    for point in sampled_path:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        point_lng, point_lat = point[0], point[1]
        distances.append(_distance_meters(lat, lng, point_lat, point_lng))

    return min(distances) if distances else None


def _estimate_walk_minutes(distance_m, walking_speed=1.4):
    safe_speed = max(float(walking_speed or 1.4), 0.4)
    return max(1, math.ceil(float(distance_m) / safe_speed / 60))


def _bearing_to_direction(lat1, lng1, lat2, lng2):
    distance = _distance_meters(lat1, lng1, lat2, lng2)
    if distance < 20:
        return 'Sur place'

    lat1_rad = math.radians(float(lat1))
    lat2_rad = math.radians(float(lat2))
    delta_lng = math.radians(float(lng2) - float(lng1))

    x = math.sin(delta_lng) * math.cos(lat2_rad)
    y = (
        math.cos(lat1_rad) * math.sin(lat2_rad)
        - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lng)
    )
    bearing = (math.degrees(math.atan2(x, y)) + 360) % 360
    directions = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest']
    return directions[round(bearing / 45) % len(directions)]


def _serialize_calm_zone(zone, distance=None):
    payload = {
        'id': zone.id,
        'name': zone.name,
        'type': zone.zone_type,
        'type_display': zone.get_zone_type_display(),
        'location': {'lat': zone.latitude, 'lng': zone.longitude},
        'comfort_score': zone.comfort_score,
        'capacity': zone.capacity,
        'opening_hours': zone.opening_hours,
    }
    if distance is not None:
        payload['distance'] = round(distance)
    return payload


def _route_density_point_count(distance_m):
    if not distance_m:
        return 3
    if distance_m < 1500:
        return 2
    if distance_m < 5000:
        return 3
    return 4


def _get_param(request, key, default=None, param_type=float):
    value = request.GET.get(key)
    if value is None:
        return default
    try:
        return param_type(value)
    except (ValueError, TypeError):
        return default


def _resolve_request_user_id(request, fallback='anonymous'):
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return f'auth_{user.pk}'
    return fallback


def _parse_target_datetime(request, hour=None):
    datetime_value = (request.GET.get('datetime') or '').strip()
    date_value = (request.GET.get('date') or '').strip()

    if datetime_value:
        normalized = datetime_value.replace('Z', '+00:00')
        try:
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is not None:
                return parsed.astimezone().replace(tzinfo=None)
            return parsed
        except ValueError:
            return None

    if date_value and hour is not None:
        try:
            return datetime.fromisoformat(f'{date_value}T{int(hour) % 24:02d}:00:00')
        except ValueError:
            return None

    if hour is not None:
        now = datetime.now()
        return now.replace(hour=hour % 24, minute=0, second=0, microsecond=0)

    return None


class CalculateRouteView(APIView):
    DEFAULT_MODE_ORDER = ['transit', 'walking', 'bike', 'car']

    def post(self, request):
        try:
            started_at = time.perf_counter()
            origin_raw = request.data['origin']
            destination_raw = request.data['destination']
            user_id = _resolve_request_user_id(request, request.data.get('user_id', 'anonymous'))
            preference_payload = request.data.get('preferences', {}) or {}

            requested_modes = request.data.get('modes')
            if isinstance(requested_modes, str):
                requested_modes = [requested_modes]
            requested_modes = [
                mode for mode in (requested_modes or self.DEFAULT_MODE_ORDER) if mode in TRANSPORT_MODES
            ] or list(self.DEFAULT_MODE_ORDER)

            preferred_mode = request.data.get('preferred_mode')
            requested_datetime = self._resolve_requested_datetime(request.data)
            if request.data.get('travel_datetime') or request.data.get('target_datetime'):
                if requested_datetime is None:
                    return Response(
                        {
                            'error': (
                                'Parametre travel_datetime/target_datetime invalide. '
                                'Utilisez un format ISO comme 2026-03-27T18:30:00.'
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            navitia_client = IDFMNavitiaClient()
            if not navitia_client.is_configured():
                return Response(
                    {
                        'error': (
                            'Cle API IDFM/Navitia manquante. Ajoutez IDFM_API_KEY '
                            'ou VITE_IDFM_API_KEY dans le fichier .env.'
                        ),
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            user_prefs = self._persist_user_preferences(user_id, preference_payload)

            place_results = run_parallel_with_timeout(
                {
                    'origin': lambda: navitia_client.resolve_location(origin_raw, fallback_name='Depart'),
                    'destination': lambda: navitia_client.resolve_location(destination_raw, fallback_name='Arrivee'),
                },
                timeout=4.2,
                defaults={'origin': None, 'destination': None},
                max_workers=2,
            )
            origin_place = place_results.get('origin')
            destination_place = place_results.get('destination')

            if not origin_place:
                return Response({'error': 'Depart introuvable'}, status=status.HTTP_400_BAD_REQUEST)
            if not destination_place:
                return Response({'error': 'Destination introuvable'}, status=status.HTTP_400_BAD_REQUEST)

            journey_results = run_parallel_with_timeout(
                {
                    mode: (
                        lambda mode=mode: navitia_client.fetch_mode_journeys(
                            origin_place,
                            destination_place,
                            requested_datetime,
                            mode,
                            count=3,
                        )
                    )
                    for mode in requested_modes
                },
                timeout=6.8,
                defaults={mode: [] for mode in requested_modes},
                max_workers=len(requested_modes),
            )

            line_ids = self._collect_line_ids_from_journeys(journey_results)
            disruptions_by_line = navitia_client.fetch_line_disruptions(line_ids) if line_ids else {}
            data_manager = DataSourceManager()
            route_options = {}
            all_routes = []

            for mode in self.DEFAULT_MODE_ORDER:
                if mode not in requested_modes:
                    continue

                normalized_routes = []
                for index, journey in enumerate(journey_results.get(mode) or []):
                    normalized = navitia_client.normalize_journey(
                        journey,
                        origin_place,
                        destination_place,
                        mode,
                        disruptions_by_line=disruptions_by_line,
                    )
                    enriched = self._enrich_route(
                        normalized,
                        origin_place,
                        destination_place,
                        user_prefs,
                        data_manager,
                        requested_datetime,
                    )
                    enriched['rank'] = index + 1
                    normalized_routes.append(enriched)

                normalized_routes.sort(key=self._route_sort_key)
                route_options[mode] = normalized_routes
                all_routes.extend(normalized_routes)

            if not all_routes:
                return Response(
                    {
                        'error': (
                            'Aucun itineraire IDFM/Navitia disponible pour cette recherche. '
                            "Verifiez les adresses ou changez l'heure de depart."
                        ),
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            recommended_route = max(
                all_routes,
                key=lambda route: (route.get('comfort', {}).get('calm_score', 0), -route.get('duration_minutes', 0)),
            )
            for route in all_routes:
                route['recommended'] = route['id'] == recommended_route['id']

            if preferred_mode and route_options.get(preferred_mode):
                selected_mode = preferred_mode
            elif route_options.get('transit'):
                selected_mode = 'transit'
            else:
                selected_mode = recommended_route['mode']
            primary_route = route_options.get(selected_mode, [recommended_route])[0]

            route_request = RouteRequest.objects.create(
                user_id=user_id,
                origin_lat=origin_place['coord']['lat'],
                origin_lng=origin_place['coord']['lng'],
                destination_lat=destination_place['coord']['lat'],
                destination_lng=destination_place['coord']['lng'],
                calculated_route=primary_route.get('path') or [],
                instructions=primary_route.get('steps') or [],
                stress_score=primary_route.get('total_stress'),
                distance=primary_route.get('distance'),
                user_preferences=self._serialize_user_preferences(user_prefs),
            )

            primary_route['route_id'] = route_request.id
            elapsed_ms = round((time.perf_counter() - started_at) * 1000)

            return Response(
                {
                    'success': True,
                    'route': primary_route,
                    'route_options': route_options,
                    'selected_mode': selected_mode,
                    'origin_place': origin_place,
                    'destination_place': destination_place,
                    'user_preferences': {
                        'user_id': user_id,
                        **self._serialize_user_preferences(user_prefs),
                    },
                    'metadata': {
                        'algorithm': 'SafePath Navitia Journey Engine v3.0',
                        'routing': 'IDFM Navitia',
                        'provider': 'Ile-de-France Mobilites / Navitia',
                        'recommendation_type': 'multi_modal_calm',
                        'recommendation_summary': self._build_recommendation_summary(recommended_route),
                        'timestamp': datetime.now().isoformat(),
                        'requested_datetime': requested_datetime.isoformat() if requested_datetime else None,
                        'calculation_time_ms': elapsed_ms,
                        'mode_counts': {mode: len(route_options.get(mode, [])) for mode in requested_modes},
                        'data_sources': [
                            'IDFM Navitia (journeys, stops, lines, disruptions)',
                            'TomTom Traffic',
                            'OpenWeather',
                            'Paris Open Data / OpenStreetMap',
                            'SafePath density prediction',
                            'Calm zones catalogue',
                        ],
                    },
                }
            )
        except KeyError as exc:
            return Response(
                {
                    'error': f'Donnee manquante: {str(exc)}',
                    'required_fields': ['origin', 'destination'],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except IDFMNavitiaError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            return Response({'error': f'Erreur interne: {str(exc)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _resolve_requested_datetime(self, data):
        raw_value = (data.get('travel_datetime') or data.get('target_datetime') or '').strip()
        if raw_value:
            try:
                normalized = raw_value.replace('Z', '+00:00')
                parsed = datetime.fromisoformat(normalized)
                if parsed.tzinfo is not None:
                    return parsed.astimezone().replace(tzinfo=None)
                return parsed
            except ValueError:
                return None

        target_hour = data.get('target_hour')
        if target_hour is None or target_hour == '':
            return None

        try:
            hour_value = int(target_hour) % 24
        except (TypeError, ValueError):
            return None

        now = datetime.now()
        candidate = now.replace(hour=hour_value, minute=0, second=0, microsecond=0)
        if candidate < now:
            candidate += timedelta(days=1)
        return candidate

    def _persist_user_preferences(self, user_id, preferences):
        existing_prefs = UserPreferences.objects.filter(user_id=user_id).first()
        defaults = {
            'max_crowd_density': preferences.get(
                'maxDensity',
                existing_prefs.max_crowd_density if existing_prefs else 0.7,
            ),
            'avoid_main_roads': preferences.get(
                'avoidMainRoads',
                existing_prefs.avoid_main_roads if existing_prefs else True,
            ),
            'prefer_parks': preferences.get(
                'preferParks',
                existing_prefs.prefer_parks if existing_prefs else True,
            ),
            'noise_sensitivity': preferences.get(
                'noiseSensitivity',
                existing_prefs.noise_sensitivity if existing_prefs else 5,
            ),
            'walking_speed': preferences.get(
                'walkingSpeed',
                existing_prefs.walking_speed if existing_prefs else 1.4,
            ),
            'consider_public_transport': preferences.get(
                'considerPublicTransport',
                existing_prefs.consider_public_transport if existing_prefs else True,
            ),
            'transport_factor': preferences.get(
                'transportFactor',
                existing_prefs.transport_factor if existing_prefs else 0.15,
            ),
        }
        prefs, _ = UserPreferences.objects.update_or_create(user_id=user_id, defaults=defaults)
        return prefs

    def _serialize_user_preferences(self, user_prefs):
        return {
            'max_crowd_density': user_prefs.max_crowd_density,
            'avoid_main_roads': user_prefs.avoid_main_roads,
            'prefer_parks': user_prefs.prefer_parks,
            'noise_sensitivity': user_prefs.noise_sensitivity,
            'walking_speed': user_prefs.walking_speed,
            'consider_public_transport': user_prefs.consider_public_transport,
            'transport_factor': user_prefs.transport_factor,
        }

    def _collect_line_ids_from_journeys(self, journey_results):
        line_ids = set()
        for journeys in journey_results.values():
            for journey in journeys or []:
                for section in journey.get('sections') or []:
                    display = section.get('display_informations') or {}
                    line_id = display.get('id')
                    if line_id:
                        line_ids.add(line_id)
        return sorted(line_ids)

    def _route_sort_key(self, route):
        comfort = route.get('comfort', {})
        return (
            -(comfort.get('calm_score') or 0),
            route.get('duration_minutes') or math.inf,
            route.get('transfers') or 0,
        )

    def _sample_route_points(self, route, origin_place, destination_place, max_points=5):
        path = route.get('path') or []
        sampled = []
        if path:
            total_points = len(path)
            if total_points <= max_points:
                indexes = range(total_points)
            else:
                indexes = {0, total_points - 1}
                for slot in range(1, max_points - 1):
                    indexes.add(round(slot * (total_points - 1) / (max_points - 1)))
                indexes = sorted(indexes)

            for index in indexes:
                point = path[index]
                if isinstance(point, (list, tuple)) and len(point) >= 2:
                    sampled.append({'lat': float(point[1]), 'lng': float(point[0])})

        if not sampled:
            sampled = [origin_place['coord'], destination_place['coord']]

        unique_points = []
        seen = set()
        for point in sampled:
            key = (round(point['lat'], 5), round(point['lng'], 5))
            if key in seen:
                continue
            seen.add(key)
            unique_points.append(point)
        return unique_points

    def _flow_label(self, value, low_label='Fluide', medium_label='Modere', high_label='Dense'):
        if value < 0.35:
            return low_label
        if value < 0.65:
            return medium_label
        return high_label

    def _comfort_label(self, score):
        if score >= 85:
            return 'Tres calme'
        if score >= 70:
            return 'Plutot calme'
        if score >= 55:
            return 'Equilibre'
        return 'Charge'

    def _build_route_reasons(self, route, avg_density, traffic_data, pedestrian_data, events_data):
        reasons = []

        if avg_density <= 0.45:
            reasons.append('foule moderee sur le parcours')
        elif avg_density <= 0.65:
            reasons.append('affluence globalement gerable')

        if route.get('mode') == 'transit' and route.get('transfers', 0) <= 1:
            reasons.append('peu de correspondances')

        if route.get('mode') in {'walking', 'bike'}:
            reasons.append('mode doux avec trajet direct')

        if route.get('mode') == 'car':
            reasons.append('itineraire routier direct')

        if not route.get('disruptions'):
            reasons.append('aucune perturbation signalee')

        if traffic_data.get('flow', 0.5) < 0.45:
            reasons.append('trafic routier contenu')

        if pedestrian_data.get('flow', 0.5) < 0.5:
            reasons.append('flux pieton plutot calme')

        if not events_data:
            reasons.append('pas d evenement dense a proximite')

        return reasons[:4]

    def _build_recommendation_summary(self, route):
        comfort = route.get('comfort', {})
        summary_parts = [
            f"{route.get('mode_label', route.get('mode', 'Trajet'))} recommande",
            f"{route.get('duration_minutes', 0)} min",
            comfort.get('label', 'Analyse confort'),
        ]
        disruptions = comfort.get('disruption_count', 0)
        if disruptions:
            summary_parts.append(f'{disruptions} perturbation(s)')
        else:
            summary_parts.append('aucune perturbation majeure')
        return ' | '.join(str(part) for part in summary_parts if part)

    def _enrich_route(self, route, origin_place, destination_place, user_prefs, data_manager, requested_datetime):
        route.setdefault('segments', route.get('steps') or route.get('instructions') or [])
        sample_points = self._sample_route_points(route, origin_place, destination_place, max_points=5)
        density_data = []
        densities = []

        for point in sample_points:
            prediction = predict_density(
                point['lat'],
                point['lng'],
                requested_datetime,
                skip_realtime=True,
            )
            density_value = float(prediction.get('density') or 0)
            densities.append(density_value)
            density_data.append(
                {
                    'location': {'lat': point['lat'], 'lng': point['lng']},
                    'density': round(density_value, 3),
                    'confidence': prediction.get('confidence'),
                    'hour': prediction.get('hour'),
                    'model_type': prediction.get('model_type'),
                }
            )

        average_density = sum(densities) / len(densities) if densities else 0.45
        peak_density = max(densities) if densities else average_density
        midpoint = sample_points[len(sample_points) // 2]

        context_results = run_parallel_with_timeout(
            {
                'traffic': lambda: data_manager.get_traffic_data(midpoint),
                'weather': lambda: data_manager.get_weather_data(midpoint),
                'pedestrian': lambda: data_manager.get_pedestrian_flow_data(midpoint),
                'events': lambda: data_manager.get_events_data(midpoint),
            },
            timeout=2.0,
            defaults={
                'traffic': {'flow': 0.5, 'confidence': 0.0},
                'weather': {'weather_factor': 1.0, 'temperature': 20},
                'pedestrian': {'flow': 0.5, 'confidence': 0.0},
                'events': [],
            },
            max_workers=4,
        )

        traffic_data = context_results.get('traffic') or {'flow': 0.5}
        weather_data = context_results.get('weather') or {'weather_factor': 1.0}
        pedestrian_data = context_results.get('pedestrian') or {'flow': 0.5}
        events_data = context_results.get('events') or []

        noise_factor = max(0.1, min(1.2, float(user_prefs.noise_sensitivity or 5) / 10))
        crowd_tolerance = max(0.1, min(1.0, float(user_prefs.max_crowd_density or 0.7)))
        transport_factor = max(0.05, min(0.5, float(user_prefs.transport_factor or 0.15)))

        density_penalty = average_density * 28
        density_penalty += max(0.0, average_density - crowd_tolerance) * 42
        density_penalty += peak_density * 6

        traffic_penalty = float(traffic_data.get('flow') or 0.5) * (8 + 8 * noise_factor)
        pedestrian_penalty = float(pedestrian_data.get('flow') or 0.5) * (8 + 6 * noise_factor)
        disruption_penalty = min(24, len(route.get('disruptions') or []) * 7)
        transfer_penalty = min(15, (route.get('transfers') or 0) * 4)
        duration_penalty = min(18, max(0.0, float(route.get('duration_minutes') or 0) - 10) * 0.22)
        event_penalty = min(10, len(events_data) * 2)

        weather_penalty = 0
        weather_text = (weather_data.get('weather') or '').lower()
        if route.get('mode') in {'walking', 'bike'}:
            if 'rain' in weather_text or 'pluie' in weather_text:
                weather_penalty += 10
            elif 'snow' in weather_text or 'neige' in weather_text:
                weather_penalty += 12

        bonus = 0
        if user_prefs.prefer_parks and route.get('mode') in {'walking', 'bike'}:
            bonus += 5
        if user_prefs.avoid_main_roads and route.get('mode') == 'car':
            bonus -= 8
        if user_prefs.consider_public_transport and route.get('mode') == 'transit':
            bonus += 3
            disruption_penalty += transport_factor * 10
        if not user_prefs.consider_public_transport and route.get('mode') == 'transit':
            bonus -= 6

        if route.get('mode') == 'walking' and float(route.get('walking_duration_minutes') or 0) > 30:
            walking_speed = max(0.6, float(user_prefs.walking_speed or 1.4))
            duration_penalty += max(0, (1.25 - walking_speed) * 10)

        raw_score = 92 - density_penalty - traffic_penalty - pedestrian_penalty
        raw_score -= disruption_penalty + transfer_penalty + duration_penalty + event_penalty + weather_penalty
        raw_score += bonus
        calm_score = round(min(99, max(18, raw_score)))
        comfort_label = self._comfort_label(calm_score)

        calm_zones = self.find_nearby_calm_zones(route.get('path') or [])
        primary_stop = (route.get('stops') or [{}])[0]
        preview_coord = (
            (primary_stop.get('coord') if route.get('mode') == 'transit' and primary_stop.get('coord') else None)
            or destination_place.get('coord')
            or midpoint
        )

        route['density_data'] = density_data
        route['distance'] = round(route.get('distance_m') or 0)
        route['estimated_time'] = round(route.get('duration_minutes') or 0, 1)
        route['calm_zones'] = calm_zones
        route['total_stress'] = round(max(0.5, min(9.9, (100 - calm_score) / 10)), 1)
        route['origin_place'] = origin_place
        route['destination_place'] = destination_place
        route['preview_point'] = {
            'lat': preview_coord.get('lat'),
            'lng': preview_coord.get('lng'),
            'name': destination_place.get('name') or route.get('summary'),
            'address': destination_place.get('address') or destination_place.get('name'),
        }
        route['traffic'] = {
            'road_flow_pct': round(float(traffic_data.get('flow') or 0) * 100),
            'road_level': self._flow_label(float(traffic_data.get('flow') or 0.5)),
            'pedestrian_flow_pct': round(float(pedestrian_data.get('flow') or 0) * 100),
            'pedestrian_level': self._flow_label(
                float(pedestrian_data.get('flow') or 0.5),
                low_label='Calme',
                medium_label='Anime',
                high_label='Charge',
            ),
            'events_count': len(events_data),
            'weather': weather_data,
        }
        route['comfort'] = {
            'calm_score': calm_score,
            'label': comfort_label,
            'average_density_pct': round(average_density * 100),
            'peak_density_pct': round(peak_density * 100),
            'disruption_count': len(route.get('disruptions') or []),
            'transfer_count': route.get('transfers') or 0,
            'road_level': route['traffic']['road_level'],
            'pedestrian_level': route['traffic']['pedestrian_level'],
            'rationale': self._build_route_reasons(
                route,
                average_density,
                traffic_data,
                pedestrian_data,
                events_data,
            ),
        }
        return route

    def find_nearby_calm_zones(self, path):
        try:
            ranked_zones = []
            for zone in CalmZone.objects.all():
                distance = _distance_to_path_meters(path, zone.latitude, zone.longitude)
                if distance is None:
                    continue
                ranked_zones.append((_serialize_calm_zone(zone, distance=distance), distance))

            if ranked_zones:
                ranked_zones.sort(key=lambda item: (item[1], -(item[0].get('comfort_score') or 0)))
                return [payload for payload, _distance in ranked_zones[:3]]
        except Exception:
            pass

        return [
            {
                'id': 'fallback-park',
                'name': 'Parc tranquille',
                'type': 'park',
                'type_display': 'Parc/Jardin',
                'location': {'lat': 48.857, 'lng': 2.357},
                'comfort_score': 0.9,
                'distance': 150,
            },
            {
                'id': 'fallback-library',
                'name': 'Bibliotheque calme',
                'type': 'library',
                'type_display': 'Bibliotheque',
                'location': {'lat': 48.858, 'lng': 2.359},
                'comfort_score': 0.85,
                'distance': 300,
            },
        ]


class UserPreferencesView(APIView):
    def get(self, request):
        user_id = _resolve_request_user_id(request, request.GET.get('user_id', 'anonymous'))
        try:
            prefs = UserPreferences.objects.get(user_id=user_id)
            return Response(
                {
                    'user_id': prefs.user_id,
                    'max_crowd_density': prefs.max_crowd_density,
                    'avoid_main_roads': prefs.avoid_main_roads,
                    'prefer_parks': prefs.prefer_parks,
                    'noise_sensitivity': prefs.noise_sensitivity,
                    'walking_speed': prefs.walking_speed,
                    'consider_public_transport': prefs.consider_public_transport,
                    'transport_factor': prefs.transport_factor,
                    'created_at': prefs.created_at,
                    'updated_at': prefs.updated_at,
                }
            )
        except UserPreferences.DoesNotExist:
            return Response(
                {
                    'message': f'Aucune preference trouvee pour {user_id}',
                    'default_preferences': {
                        'max_crowd_density': 0.7,
                        'avoid_main_roads': True,
                        'prefer_parks': True,
                        'noise_sensitivity': 5,
                        'walking_speed': 1.4,
                        'consider_public_transport': True,
                        'transport_factor': 0.15,
                    },
                }
            )

    def post(self, request):
        user_id = _resolve_request_user_id(request, request.data.get('user_id', 'anonymous'))
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
            },
        )

        return Response(
            {
                'success': True,
                'message': 'Preferences creees' if created else 'Preferences mises a jour',
                'user_id': prefs.user_id,
                'preferences': {
                    'max_crowd_density': prefs.max_crowd_density,
                    'avoid_main_roads': prefs.avoid_main_roads,
                    'prefer_parks': prefs.prefer_parks,
                    'noise_sensitivity': prefs.noise_sensitivity,
                    'walking_speed': prefs.walking_speed,
                    'consider_public_transport': prefs.consider_public_transport,
                    'transport_factor': prefs.transport_factor,
                },
            }
        )


class CalmZonesView(APIView):
    def get(self, request):
        lat = _get_param(request, 'lat')
        lng = _get_param(request, 'lng')
        radius = _get_param(request, 'radius', 1000, int)

        zone_list = []
        for zone in CalmZone.objects.all():
            distance = None
            if lat is not None and lng is not None:
                distance = _distance_meters(lat, lng, zone.latitude, zone.longitude)
                if distance > radius:
                    continue

            zone_list.append(_serialize_calm_zone(zone, distance=distance))

        if lat is not None and lng is not None:
            zone_list.sort(key=lambda zone: (zone.get('distance', math.inf), -(zone.get('comfort_score') or 0)))
            zone_list = zone_list[:5]

        return Response({'count': len(zone_list), 'calm_zones': zone_list})

    def post(self, request):
        zone = CalmZone.objects.create(
            name=request.data.get('name', 'Nouvelle zone calme'),
            zone_type=request.data.get('zone_type', 'park'),
            latitude=request.data.get('latitude', 48.8566),
            longitude=request.data.get('longitude', 2.3522),
            comfort_score=request.data.get('comfort_score', 0.8),
            capacity=request.data.get('capacity'),
            opening_hours=request.data.get('opening_hours', {}),
        )

        return Response(
            {
                'success': True,
                'message': 'Zone calme creee',
                'zone': {'id': zone.id, 'name': zone.name, 'type': zone.zone_type},
            }
        )


class EmergencyView(APIView):
    def get(self, request):
        lat = _get_param(request, 'lat')
        lng = _get_param(request, 'lng')

        if lat is None or lng is None:
            return Response(
                {'error': 'Coordonnees requises', 'usage': '/api/emergency/?lat=48.8566&lng=2.3522'},
                status=400,
            )

        zone = None
        best_distance = None
        try:
            for candidate in CalmZone.objects.all():
                distance = _distance_meters(lat, lng, candidate.latitude, candidate.longitude)
                if best_distance is None or distance < best_distance:
                    zone = candidate
                    best_distance = distance

            if zone is None:
                zone = CalmZone.objects.create(
                    name='Zone de secours',
                    zone_type='park',
                    latitude=lat + 0.001,
                    longitude=lng + 0.001,
                    comfort_score=0.9,
                )
                best_distance = _distance_meters(lat, lng, zone.latitude, zone.longitude)
        except Exception:
            zone = None

        if zone:
            zone_payload = _serialize_calm_zone(zone, distance=best_distance)
            zone_payload['direction'] = _bearing_to_direction(lat, lng, zone.latitude, zone.longitude)
            zone_payload['estimated_walk_time'] = _estimate_walk_minutes(best_distance, walking_speed=1.2)
            return Response(
                {
                    'emergency': True,
                    'message': 'Zone calme trouvee',
                    'zone': zone_payload,
                    'instructions': [
                        'Respirez profondement',
                        'Dirigez-vous vers cette zone',
                        'Prenez votre temps',
                    ],
                }
            )

        return Response(
            {
                'emergency': True,
                'message': 'Aucune zone calme trouvee a proximite',
                'alternative_advice': [
                    'Cherchez un cafe ou une boutique calme',
                    'Asseyez-vous sur un banc',
                    'Ecoutez de la musique relaxante',
                ],
            }
        )


class ZonesListView(APIView):
    def get(self, request):
        return Response(
            {
                'zones': list_zones_for_api(),
                'usage': 'Utilisez ?zone=paris ou ?city=Paris avec /api/density-prediction/',
            }
        )


class DensityPredictionView(APIView):
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
        target_dt = _parse_target_datetime(request, hour=hour)
        if (request.GET.get('datetime') or request.GET.get('date')) and target_dt is None:
            return Response(
                {
                    'error': 'Parametre datetime/date invalide. Utilisez un format ISO comme 2026-03-27T18:00:00.',
                },
                status=400,
            )

        if zone_or_city:
            resolved = resolve_zone(zone_or_city)
            if not resolved:
                return Response(
                    {
                        'error': f'Zone ou ville inconnue: "{zone_or_city}". Utilisez par ex. Paris, Lyon, Marseille.',
                        'zones_available': [zone['id'] for zone in list_zones_for_api()],
                    },
                    status=400,
                )

            zone_id, zone_config = resolved
            zone_label = zone_config.get('label', zone_id)

            if grid_size <= 1:
                prediction = predict_density_by_zone(zone_id, target_dt)
                if not prediction:
                    return Response({'error': 'Erreur prediction zone'}, status=500)
                return Response(
                    {
                        'zone_id': zone_id,
                        'zone_label': zone_label,
                        'point': zone_config.get('center'),
                        'density': prediction['density'],
                        'confidence': prediction['confidence'],
                        'hour': prediction.get('hour'),
                        'model_type': prediction.get('model_type', 'predictive'),
                        'source': 'Historique (habituel a cette heure) + ajustement temps reel',
                        'prediction_for_hour': prediction.get('hour'),
                        'requested_datetime': target_dt.isoformat() if target_dt else None,
                        'updated_at': datetime.now().isoformat(),
                    }
                )

            output = predict_density_grid_by_zone(zone_id, target_dt, grid_size)
            if not output:
                return Response({'error': 'Erreur prediction grille zone'}, status=500)
            label, predictions = output
            return Response(
                {
                    'zone_id': zone_id,
                    'zone_label': label,
                    'predictions': predictions,
                    'hour': hour,
                    'model_type': 'predictive',
                    'source': 'Historique (habituel a cette heure) + ajustement temps reel',
                    'prediction_for_hour': target_dt.hour if target_dt else hour,
                    'requested_datetime': target_dt.isoformat() if target_dt else None,
                    'updated_at': datetime.now().isoformat(),
                }
            )

        if lat is not None and lng is not None:
            prediction = predict_density(lat, lng, target_dt)
            return Response(
                {
                    'point': {'lat': lat, 'lng': lng},
                    'density': prediction['density'],
                    'confidence': prediction['confidence'],
                    'hour': prediction.get('hour'),
                    'model_type': prediction.get('model_type', 'predictive'),
                    'source': 'Historique (habituel a cette heure) + ajustement temps reel',
                    'prediction_for_hour': prediction.get('hour'),
                    'requested_datetime': target_dt.isoformat() if target_dt else None,
                    'updated_at': datetime.now().isoformat(),
                }
            )

        if all(value is not None for value in [south, west, north, east]):
            bbox = (south, west, north, east)
            results = predict_density_grid(bbox, target_dt, grid_size)
            return Response(
                {
                    'bbox': {'south': south, 'west': west, 'north': north, 'east': east},
                    'predictions': results,
                    'hour': hour,
                    'model_type': 'predictive',
                    'source': 'Historique (habituel a cette heure) + ajustement temps reel',
                    'prediction_for_hour': target_dt.hour if target_dt else hour,
                    'requested_datetime': target_dt.isoformat() if target_dt else None,
                    'updated_at': datetime.now().isoformat(),
                }
            )

        return Response(
            {
                'error': 'Parametres requis: zone ou city (ex. zone=Paris), ou lat+lng, ou south+west+north+east',
                'zones_available': list_zones_for_api(),
            },
            status=400,
        )
