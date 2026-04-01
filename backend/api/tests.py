import json
from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import CalmZone, UserPreferences
from .utils.idfm_navitia import IDFMNavitiaClient, IDFMNavitiaError

User = get_user_model()


class AuthFlowTests(TestCase):
    def test_register_login_refresh_and_me(self):
        register_response = self.client.post(
            reverse('auth_register'),
            data=json.dumps(
                {
                    'username': 'alice',
                    'email': 'alice@example.com',
                    'password': 'SecuriteTest123!',
                    'password_confirm': 'SecuriteTest123!',
                    'first_name': 'Alice',
                    'last_name': 'Martin',
                }
            ),
            content_type='application/json',
        )

        self.assertEqual(register_response.status_code, 201)
        register_payload = register_response.json()
        self.assertIn('access', register_payload['tokens'])
        self.assertIn('refresh', register_payload['tokens'])
        self.assertEqual(register_payload['user']['username'], 'alice')

        login_response = self.client.post(
            reverse('auth_login'),
            data=json.dumps({'identifier': 'alice@example.com', 'password': 'SecuriteTest123!'}),
            content_type='application/json',
        )
        self.assertEqual(login_response.status_code, 200)
        access_token = login_response.json()['tokens']['access']
        refresh_token = login_response.json()['tokens']['refresh']

        me_response = self.client.get(reverse('auth_me'), HTTP_AUTHORIZATION=f'Bearer {access_token}')
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()['user']['email'], 'alice@example.com')

        refresh_response = self.client.post(
            reverse('auth_refresh'),
            data=json.dumps({'refresh_token': refresh_token}),
            content_type='application/json',
        )
        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn('access', refresh_response.json()['tokens'])

    def test_authenticated_user_preferences_ignore_foreign_user_id(self):
        user = User.objects.create_user(username='bob', email='bob@example.com', password='SecuriteTest123!')
        foreign_pref = UserPreferences.objects.create(user_id='foreign-user', max_crowd_density=0.2)
        own_pref = UserPreferences.objects.create(user_id=f'auth_{user.pk}', max_crowd_density=0.9)

        login_response = self.client.post(
            reverse('auth_login'),
            data=json.dumps({'identifier': 'bob', 'password': 'SecuriteTest123!'}),
            content_type='application/json',
        )
        access_token = login_response.json()['tokens']['access']

        response = self.client.get(
            reverse('user_preferences'),
            {'user_id': foreign_pref.user_id},
            HTTP_AUTHORIZATION=f'Bearer {access_token}',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user_id'], own_pref.user_id)
        self.assertEqual(response.json()['max_crowd_density'], own_pref.max_crowd_density)


class ReverseGeocodeViewTests(TestCase):
    @patch('api.views.reverse_geocode')
    def test_reverse_geocode_returns_exact_place_details(self, mock_reverse_geocode):
        mock_reverse_geocode.return_value = {
            'lat': 48.85837,
            'lng': 2.29448,
            'name': 'Tour Eiffel',
            'address': '5 Avenue Anatole France, 75007 Paris',
            'display_name': 'Tour Eiffel, 5 Avenue Anatole France, 75007 Paris',
        }

        response = self.client.get(reverse('reverse_geocode'), {'lat': 48.85837, 'lng': 2.29448})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['name'], 'Tour Eiffel')
        self.assertEqual(response.json()['address'], '5 Avenue Anatole France, 75007 Paris')


class DensityPredictionViewTests(TestCase):
    @patch('api.views.predict_density')
    def test_density_prediction_accepts_explicit_datetime(self, mock_predict_density):
        target_datetime = '2026-03-28T01:00:00'
        mock_predict_density.return_value = {
            'density': 0.42,
            'confidence': 0.81,
            'hour': 1,
            'model_type': 'predictive',
        }

        response = self.client.get(
            reverse('density_prediction'),
            {'lat': 48.8566, 'lng': 2.3522, 'datetime': target_datetime},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['requested_datetime'], target_datetime)
        _lat, _lng, parsed_datetime = mock_predict_density.call_args.args
        self.assertEqual(parsed_datetime.hour, 1)
        self.assertEqual(parsed_datetime.day, 28)

    def test_zone_grid_predictions_are_not_all_identical(self):
        from ml_model.predict import predict_density_grid_by_zone

        target_datetime = datetime.now() + timedelta(hours=6)
        _label, predictions = predict_density_grid_by_zone('paris', target_datetime, 4)

        unique_densities = {prediction['density'] for prediction in predictions}
        self.assertGreater(len(unique_densities), 1)

    def test_historical_profile_uses_low_night_fallback_for_missing_hours(self):
        from ml_model.predict import predict_density

        target_datetime = datetime(2026, 3, 30, 1, 0, 0)
        prediction = predict_density(48.85837, 2.29448, target_datetime, skip_realtime=True)

        self.assertLess(prediction['density'], 0.3)
        self.assertLess(prediction['historical_base'], 0.3)

    @patch('api.utils.data_aggregator.DataAggregator.get_aggregated_density_for_point')
    def test_low_confidence_realtime_signal_is_not_blended(self, mock_get_aggregated_density):
        from ml_model.predict import predict_density

        target_datetime = datetime.now().replace(hour=1, minute=0, second=0, microsecond=0)
        mock_get_aggregated_density.return_value = {
            'density': 0.95,
            'confidence': 0.1,
        }

        prediction = predict_density(48.85837, 2.29448, target_datetime)

        self.assertEqual(prediction['model_type'], 'predictive')
        self.assertLess(prediction['density'], 0.3)


class IDFMNavitiaClientTests(TestCase):
    @patch('api.utils.idfm_navitia.geocode_search')
    @patch.object(IDFMNavitiaClient, 'search_places')
    def test_resolve_location_falls_back_to_generic_geocode_when_places_are_empty(
        self,
        mock_search_places,
        mock_geocode_search,
    ):
        mock_search_places.return_value = []
        mock_geocode_search.return_value = {
            'lat': 48.85837,
            'lng': 2.29448,
            'name': 'Tour Eiffel',
            'address': '5 Avenue Anatole France, 75007 Paris',
            'display_name': 'Tour Eiffel, 5 Avenue Anatole France, 75007 Paris',
        }

        client = IDFMNavitiaClient(api_key='test-key')
        resolved = client.resolve_location({'query': 'Tour Eiffel'}, fallback_name='Arrivee')

        self.assertEqual(resolved['name'], 'Tour Eiffel')
        self.assertEqual(resolved['address'], '5 Avenue Anatole France, 75007 Paris')
        self.assertEqual(resolved['coord']['lat'], 48.85837)
        self.assertEqual(resolved['coord']['lng'], 2.29448)
        self.assertEqual(resolved['embedded_type'], 'coord')
        self.assertEqual(resolved['uri'], '2.29448;48.85837')
        self.assertGreaterEqual(mock_search_places.call_count, 1)
        self.assertGreaterEqual(mock_geocode_search.call_count, 1)

    @patch('api.utils.idfm_navitia.geocode_search')
    @patch.object(IDFMNavitiaClient, 'search_places')
    def test_resolve_location_falls_back_when_navitia_places_errors(
        self,
        mock_search_places,
        mock_geocode_search,
    ):
        mock_search_places.side_effect = IDFMNavitiaError('Erreur IDFM/Navitia 500')
        mock_geocode_search.return_value = {
            'lat': 48.8606,
            'lng': 2.3376,
            'name': 'Musee du Louvre',
            'address': 'Rue de Rivoli, 75001 Paris',
            'display_name': 'Musee du Louvre, Rue de Rivoli, 75001 Paris',
        }

        client = IDFMNavitiaClient(api_key='test-key')
        resolved = client.resolve_location({'query': 'Musee du Louvre'}, fallback_name='Arrivee')

        self.assertEqual(resolved['name'], 'Musee du Louvre')
        self.assertEqual(resolved['coord']['lat'], 48.8606)
        self.assertEqual(resolved['coord']['lng'], 2.3376)
        self.assertEqual(resolved['embedded_type'], 'coord')
        self.assertGreaterEqual(mock_geocode_search.call_count, 1)

    def test_normalize_journey_converts_centime_fares_to_euros(self):
        client = IDFMNavitiaClient(api_key='test-key')

        journey = {
            'internal_id': 'journey-centime',
            'departure_date_time': '20260327T180000',
            'arrival_date_time': '20260327T182000',
            'duration': 1200,
            'durations': {'walking': 120},
            'nb_transfers': 0,
            'fare': {
                'total': {
                    'value': 250,
                    'currency': 'centime',
                }
            },
            'sections': [],
        }
        origin = {'coord': {'lat': 48.8566, 'lng': 2.3522}}
        destination = {'coord': {'lat': 48.8606, 'lng': 2.3376}}

        normalized = client.normalize_journey(journey, origin, destination, 'transit')

        self.assertEqual(normalized['fare']['value'], 2.5)
        self.assertEqual(normalized['fare']['currency'], 'EUR')
        self.assertEqual(normalized['fare']['raw_currency'], 'centime')


class CalculateRouteViewTests(TestCase):
    @patch('api.views.predict_density')
    @patch('api.views.DataSourceManager')
    @patch('api.views.IDFMNavitiaClient')
    def test_calculate_route_updates_user_preferences_on_every_request(
        self,
        mock_navitia_client,
        mock_data_source_manager,
        mock_predict_density,
    ):
        client_instance = mock_navitia_client.return_value
        client_instance.is_configured.return_value = True
        client_instance.resolve_location.side_effect = [
            {
                'name': 'Bastille',
                'address': 'Place de la Bastille, Paris',
                'coord': {'lat': 48.8532, 'lng': 2.3692},
                'uri': '2.3692;48.8532',
            },
            {
                'name': 'Chatelet',
                'address': 'Place du Chatelet, Paris',
                'coord': {'lat': 48.8582, 'lng': 2.347},
                'uri': '2.347;48.8582',
            },
            {
                'name': 'Bastille',
                'address': 'Place de la Bastille, Paris',
                'coord': {'lat': 48.8532, 'lng': 2.3692},
                'uri': '2.3692;48.8532',
            },
            {
                'name': 'Chatelet',
                'address': 'Place du Chatelet, Paris',
                'coord': {'lat': 48.8582, 'lng': 2.347},
                'uri': '2.347;48.8582',
            },
        ]

        def fetch_mode_journeys(_origin, _destination, _requested_datetime, mode, count=3):
            del count
            if mode == 'transit':
                return [{'internal_id': 'journey-transit'}]
            if mode == 'walking':
                return [{'internal_id': 'journey-walking'}]
            return []

        def normalize_journey(journey, _origin, _destination, mode, disruptions_by_line=None):
            del journey
            disruptions_by_line = disruptions_by_line or {}
            base = {
                'id': f'{mode}-1',
                'mode': mode,
                'mode_label': 'Transport' if mode == 'transit' else 'A pied',
                'departure_time': '2026-03-27T09:00:00',
                'arrival_time': '2026-03-27T09:20:00' if mode == 'transit' else '2026-03-27T09:28:00',
                'duration_seconds': 1200 if mode == 'transit' else 1680,
                'duration_minutes': 20 if mode == 'transit' else 28,
                'distance_m': 4300 if mode == 'transit' else 2400,
                'walking_duration_minutes': 7 if mode == 'transit' else 28,
                'transfers': 1 if mode == 'transit' else 0,
                'path': [[2.3692, 48.8532], [2.36, 48.856], [2.347, 48.8582]],
                'steps': [
                    {
                        'label': 'Rejoindre le quai',
                        'detail': 'Vers la ligne 1',
                        'duration': 240,
                        'distance': 180,
                        'coord': {'lat': 48.8532, 'lng': 2.3692},
                        'to_coord': {'lat': 48.854, 'lng': 2.366},
                        'arrival_stop': 'Bastille',
                    }
                ],
                'instructions': [],
                'lines': [{'id': 'line:1', 'code': 'M1', 'name': 'Metro 1'}] if mode == 'transit' else [],
                'stops': [
                    {'id': 'stop:1', 'name': 'Bastille', 'role': 'depart', 'coord': {'lat': 48.8532, 'lng': 2.3692}},
                    {'id': 'stop:2', 'name': 'Chatelet', 'role': 'arrivee', 'coord': {'lat': 48.8582, 'lng': 2.347}},
                ] if mode == 'transit' else [],
                'schedules': [
                    {
                        'line_id': 'line:1',
                        'line_code': 'M1',
                        'line_name': 'Metro 1',
                        'from': 'Bastille',
                        'to': 'Chatelet',
                        'departure_time': '2026-03-27T09:05:00',
                        'arrival_time': '2026-03-27T09:15:00',
                    }
                ] if mode == 'transit' else [],
                'disruptions': disruptions_by_line.get('line:1', []) if mode == 'transit' else [],
                'summary': 'Transport direct' if mode == 'transit' else 'Marche directe',
            }
            base['instructions'] = base['steps']
            return base

        client_instance.fetch_mode_journeys.side_effect = fetch_mode_journeys
        client_instance.fetch_line_disruptions.return_value = {
            'line:1': [{'id': 'disruption-1', 'title': 'Travaux', 'messages': ['Trafic ralenti']}]
        }
        client_instance.normalize_journey.side_effect = normalize_journey

        manager = mock_data_source_manager.return_value
        manager.get_traffic_data.return_value = {'flow': 0.2}
        manager.get_weather_data.return_value = {'weather_factor': 1.0, 'weather': 'clear'}
        manager.get_pedestrian_flow_data.return_value = {'flow': 0.25, 'confidence': 0.8}
        manager.get_events_data.return_value = []
        mock_predict_density.return_value = {'density': 0.25, 'confidence': 0.8, 'hour': 9, 'model_type': 'predictive'}

        first_payload = {
            'origin': {'query': 'Bastille'},
            'destination': {'query': 'Chatelet'},
            'user_id': 'route-user',
            'preferences': {
                'maxDensity': 0.6,
                'avoidMainRoads': True,
                'preferParks': True,
                'noiseSensitivity': 4,
                'walkingSpeed': 1.0,
                'considerPublicTransport': True,
                'transportFactor': 0.1,
            },
        }
        second_payload = {
            **first_payload,
            'preferences': {
                'maxDensity': 0.9,
                'avoidMainRoads': False,
                'preferParks': False,
                'noiseSensitivity': 7,
                'walkingSpeed': 2.0,
                'considerPublicTransport': False,
                'transportFactor': 0.3,
            },
        }

        first_response = self.client.post(
            reverse('calculate_route'),
            data=json.dumps(first_payload),
            content_type='application/json',
        )
        second_response = self.client.post(
            reverse('calculate_route'),
            data=json.dumps(second_payload),
            content_type='application/json',
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        first_body = first_response.json()
        self.assertEqual(first_body['metadata']['routing'], 'IDFM Navitia')
        self.assertIn('transit', first_body['route_options'])
        self.assertIn('walking', first_body['route_options'])
        self.assertIn('preview_point', first_body['route'])
        self.assertIn('segments', first_body['route'])
        self.assertIn('calculation_time_ms', first_response.json()['metadata'])
        self.assertGreaterEqual(mock_predict_density.call_count, 2)

        prefs = UserPreferences.objects.get(user_id='route-user')
        self.assertEqual(prefs.max_crowd_density, 0.9)
        self.assertFalse(prefs.avoid_main_roads)
        self.assertFalse(prefs.prefer_parks)
        self.assertEqual(prefs.noise_sensitivity, 7)
        self.assertEqual(prefs.walking_speed, 2.0)
        self.assertFalse(prefs.consider_public_transport)
        self.assertEqual(prefs.transport_factor, 0.3)


class CalmZonesViewTests(TestCase):
    def setUp(self):
        CalmZone.objects.create(
            name='Tres proche',
            zone_type='park',
            latitude=48.8567,
            longitude=2.3523,
            comfort_score=0.8,
        )
        CalmZone.objects.create(
            name='Moyenne distance',
            zone_type='library',
            latitude=48.8605,
            longitude=2.358,
            comfort_score=0.9,
        )
        CalmZone.objects.create(
            name='Hors rayon',
            zone_type='cafe',
            latitude=48.90,
            longitude=2.45,
            comfort_score=0.7,
        )

    def test_calm_zones_are_sorted_by_distance_and_filtered_by_radius(self):
        response = self.client.get(
            reverse('calm_zones'),
            {'lat': 48.8566, 'lng': 2.3522, 'radius': 1500},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()['calm_zones']
        self.assertEqual(len(payload), 2)
        self.assertEqual(payload[0]['name'], 'Tres proche')
        self.assertLess(payload[0]['distance'], payload[1]['distance'])


class EmergencyViewTests(TestCase):
    def test_emergency_returns_the_nearest_zone(self):
        CalmZone.objects.create(
            name='Zone proche',
            zone_type='park',
            latitude=48.8568,
            longitude=2.3521,
            comfort_score=0.95,
        )
        CalmZone.objects.create(
            name='Zone lointaine',
            zone_type='library',
            latitude=48.87,
            longitude=2.39,
            comfort_score=0.9,
        )

        response = self.client.get(reverse('emergency'), {'lat': 48.8566, 'lng': 2.3522})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['zone']['name'], 'Zone proche')
        self.assertGreater(payload['zone']['distance'], 0)
        self.assertIn('direction', payload['zone'])
        self.assertIn('estimated_walk_time', payload['zone'])


class ChatbotViewTests(TestCase):
    def test_chatbot_requires_message(self):
        response = self.client.post(
            reverse('chatbot'),
            data=json.dumps({}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Message requis')

    @patch('api.chatbot._plan_route_from_intent')
    @patch('api.chatbot._get_mistral_api_key', return_value=None)
    def test_chatbot_route_request_returns_structured_summary_without_llm(
        self,
        _mock_api_key,
        mock_plan_route,
    ):
        mock_plan_route.return_value = {
            'route_summary': {
                'origin': 'Republique',
                'destination': 'Bastille',
                'recommended_mode_label': 'Metro',
                'duration_minutes': 16,
                'average_density_pct': 32,
                'calm_score': 84,
                'quieter_windows': [{'label': '17h30', 'density_pct': 24}],
            },
            'alerts': [{'level': 'low', 'title': 'Fenetre calme', 'text': '17h30 est plus calme.'}],
        }

        response = self.client.post(
            reverse('chatbot'),
            data=json.dumps({'message': 'Je veux aller de Republique a Bastille a 18h sans foule.'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['intent'], 'route_plan')
        self.assertEqual(payload['route_summary']['destination'], 'Bastille')
        self.assertIn('score de calme', payload['reply'])
        self.assertEqual(payload['alerts'][0]['title'], 'Fenetre calme')

    @patch('api.chatbot._build_density_context')
    @patch('api.chatbot._compose_reply_with_llm', return_value='Zone animee a 18h. Visez 19h si vous voulez plus de calme.')
    @patch(
        'api.chatbot._extract_intent_with_llm',
        return_value={
            'intent': 'alert_query',
            'zone_query': 'Chatelet',
            'wants_alerts': True,
            'wants_density_explanation': True,
            'travel_datetime_iso': '2026-03-28T18:00:00',
        },
    )
    @patch('api.chatbot._get_mistral_api_key', return_value='test-key')
    def test_chatbot_can_use_llm_for_alert_queries(
        self,
        _mock_api_key,
        _mock_extract,
        _mock_compose,
        mock_density_context,
    ):
        mock_density_context.return_value = {
            'density_overview': {
                'label': 'Chatelet',
                'density_pct': 68,
                'level': 'tres frequentee',
                'quieter_windows': [{'label': '19h00', 'density_pct': 42}],
                'scale': [],
            },
            'alerts': [{'level': 'high', 'title': 'Zone tres frequentee', 'text': 'Chatelet sera charge a 18h.'}],
        }

        response = self.client.post(
            reverse('chatbot'),
            data=json.dumps({'message': 'Alerte foule a Chatelet a 18h ?'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['intent'], 'alert_query')
        self.assertEqual(payload['density_overview']['label'], 'Chatelet')
        self.assertEqual(payload['reply'], 'Zone animee a 18h. Visez 19h si vous voulez plus de calme.')
