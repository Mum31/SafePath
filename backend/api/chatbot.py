import json
import os
import re
from datetime import datetime, timedelta

import requests
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ml_model.predict import predict_density, predict_density_by_zone

from .utils.data_sources import DataSourceManager, geocode_search
from .utils.idfm_navitia import IDFMNavitiaClient, IDFMNavitiaError
from .utils.parallel import run_parallel_with_timeout
from .utils.zones_config import resolve_zone
from .views import CalculateRouteView, _resolve_request_user_id

MISTRAL_API_URL = os.getenv('MISTRAL_API_URL', 'https://api.mistral.ai/v1/chat/completions')
MISTRAL_MODEL = os.getenv('MISTRAL_MODEL', 'mistral-small-latest')
SUPPORTED_INTENTS = {'route_plan', 'density_explanation', 'alert_query', 'reassurance', 'general'}


def _get_mistral_api_key():
    return os.getenv('MISTRAL_API_KEY') or os.getenv('VITE_MISTRAL_API_KEY')


def _clean_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'1', 'true', 'oui', 'yes'}:
            return True
        if lowered in {'0', 'false', 'non', 'no'}:
            return False
    return bool(value)


def _sanitize_history(history):
    cleaned = []
    for message in history or []:
        if not isinstance(message, dict):
            continue
        role = (message.get('role') or 'user').strip().lower()
        if role not in {'user', 'assistant'}:
            continue
        content = _clean_text(message.get('content') or message.get('text'))
        if not content:
            continue
        cleaned.append({'role': role, 'content': content})
    return cleaned[-10:]


def _extract_message_content(payload):
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list):
        fragments = []
        for item in payload:
            if isinstance(item, str):
                fragments.append(item)
            elif isinstance(item, dict):
                text = item.get('text') or item.get('content')
                if text:
                    fragments.append(str(text))
        return '\n'.join(fragment for fragment in fragments if fragment).strip()
    if isinstance(payload, dict):
        return str(payload.get('content') or payload.get('text') or '').strip()
    return str(payload or '').strip()


def _call_mistral(messages, temperature=0.2, max_tokens=700):
    api_key = _get_mistral_api_key()
    if not api_key:
        raise RuntimeError('Cle Mistral absente')

    response = requests.post(
        MISTRAL_API_URL,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        json={
            'model': MISTRAL_MODEL,
            'temperature': temperature,
            'max_tokens': max_tokens,
            'messages': messages,
        },
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    choices = payload.get('choices') or []
    if not choices:
        raise RuntimeError('Reponse Mistral vide')
    return _extract_message_content((choices[0].get('message') or {}).get('content'))


def _extract_json_object(text):
    cleaned = _clean_text(text)
    if not cleaned:
        raise ValueError('Reponse JSON vide')

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start == -1 or end == -1 or end <= start:
        raise ValueError('Objet JSON introuvable')
    return json.loads(cleaned[start : end + 1])


def _parse_iso_datetime(value):
    text = _clean_text(value)
    if not text:
        return None
    try:
        normalized = text.replace('Z', '+00:00')
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is not None:
            return parsed.astimezone().replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def _format_hour_label(dt):
    return dt.strftime('%Hh%M')


def _density_level(value):
    ratio = float(value or 0)
    if ratio < 0.35:
        return 'calme'
    if ratio < 0.65:
        return 'moderee'
    return 'dense'


def _density_label(value):
    labels = {
        'calme': 'calme',
        'moderee': 'moderee',
        'dense': 'tres frequentee',
    }
    return labels[_density_level(value)]


def _density_scale():
    return [
        {'label': 'Calme', 'range': '< 35 %', 'description': 'circulation fluide et pression faible'},
        {'label': 'Modere', 'range': '35 a 64 %', 'description': 'flux present mais encore gerable'},
        {'label': 'Dense', 'range': '>= 65 %', 'description': 'zones chargees, attente et stress plus probables'},
    ]


def _normalize_intent(raw_intent):
    intent = raw_intent if isinstance(raw_intent, dict) else {}
    normalized = {
        'intent': _clean_text(intent.get('intent')) or 'general',
        'origin_query': _clean_text(intent.get('origin_query')),
        'destination_query': _clean_text(intent.get('destination_query')),
        'zone_query': _clean_text(intent.get('zone_query')),
        'travel_datetime_iso': None,
        'requested_hour': None,
        'wants_calm': _coerce_bool(intent.get('wants_calm')),
        'needs_reassurance': _coerce_bool(intent.get('needs_reassurance')),
        'wants_density_explanation': _coerce_bool(intent.get('wants_density_explanation')),
        'wants_alerts': _coerce_bool(intent.get('wants_alerts')),
        'topic_summary': _clean_text(intent.get('topic_summary')),
        'follow_up_question': _clean_text(intent.get('follow_up_question')),
    }

    if normalized['intent'] not in SUPPORTED_INTENTS:
        normalized['intent'] = 'general'

    parsed_datetime = _parse_iso_datetime(intent.get('travel_datetime_iso'))
    if parsed_datetime:
        normalized['travel_datetime_iso'] = parsed_datetime.isoformat()

    try:
        requested_hour = intent.get('requested_hour')
        if requested_hour is not None and requested_hour != '':
            normalized['requested_hour'] = int(requested_hour) % 24
    except (TypeError, ValueError):
        normalized['requested_hour'] = None

    if normalized['origin_query'] and normalized['destination_query'] and normalized['intent'] == 'general':
        normalized['intent'] = 'route_plan'

    if normalized['zone_query'] and normalized['intent'] == 'general':
        normalized['intent'] = 'alert_query' if normalized['wants_alerts'] else 'density_explanation'

    return normalized


def _extract_intent_with_llm(message, history):
    history_lines = '\n'.join(
        f"{entry['role']}: {entry['content']}"
        for entry in history[-6:]
    )
    prompt = [
        {
            'role': 'system',
            'content': (
                "Tu es un extracteur d intention pour SafePath. "
                "Analyse la demande en francais et reponds uniquement avec un objet JSON valide. "
                "Champs attendus: intent, origin_query, destination_query, zone_query, "
                "travel_datetime_iso, requested_hour, wants_calm, needs_reassurance, "
                "wants_density_explanation, wants_alerts, topic_summary, follow_up_question. "
                "intent doit etre l une de ces valeurs: route_plan, density_explanation, alert_query, reassurance, general. "
                "Si une information n est pas presente, mets null."
            ),
        },
        {
            'role': 'user',
            'content': (
                f"Date actuelle: {datetime.now().isoformat()}\n"
                f"Historique recent:\n{history_lines or 'Aucun'}\n\n"
                f"Demande utilisateur:\n{message}"
            ),
        },
    ]
    return _normalize_intent(_extract_json_object(_call_mistral(prompt, temperature=0.0, max_tokens=350)))


def _extract_route_entities_with_regex(message):
    patterns = [
        re.compile(
            r"(?:aller|trajet|itin[eé]raire|rejoindre|partir)[^.!?\n]*?(?:de|depuis)\s+(.+?)\s+[aà]\s+(.+?)\s+(?:a|à|vers)\s+(\d{1,2})(?:h(\d{2}))?",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:de|depuis)\s+(.+?)\s+[aà]\s+(.+?)(?:$|[,.!?])",
            re.IGNORECASE,
        ),
    ]
    for pattern in patterns:
        match = pattern.search(message)
        if not match:
            continue
        origin = _clean_text(match.group(1))
        destination = _clean_text(match.group(2))
        hour = None
        minute = 0
        if len(match.groups()) >= 3 and match.group(3):
            try:
                hour = int(match.group(3)) % 24
            except (TypeError, ValueError):
                hour = None
        if len(match.groups()) >= 4 and match.group(4):
            try:
                minute = int(match.group(4)) % 60
            except (TypeError, ValueError):
                minute = 0
        return origin, destination, hour, minute
    return None, None, None, 0


def _extract_intent_with_rules(message, history):
    lowered = (message or '').lower()
    previous_user_message = next(
        (entry['content'] for entry in reversed(history) if entry['role'] == 'user'),
        None,
    )
    del previous_user_message

    origin_query, destination_query, requested_hour, requested_minute = _extract_route_entities_with_regex(message)
    explicit_hour_match = re.search(r"(?:a|à|vers)\s+(\d{1,2})(?:h(\d{2}))?", lowered)
    if requested_hour is None and explicit_hour_match:
        try:
            requested_hour = int(explicit_hour_match.group(1)) % 24
            requested_minute = int(explicit_hour_match.group(2) or 0) % 60
        except (TypeError, ValueError):
            requested_hour = None
            requested_minute = 0

    zone_match = re.search(r"(?:zone|quartier|secteur|a|à)\s+([a-zA-Z0-9À-ÿ' -]{3,})", message)
    zone_query = _clean_text(zone_match.group(1)) if zone_match else None

    wants_calm = any(token in lowered for token in ['sans foule', 'calme', 'eviter la foule', 'éviter la foule'])
    needs_reassurance = any(token in lowered for token in ['stress', 'angoisse', 'peur', 'rassure', 'rassurant'])
    wants_density_explanation = any(
        token in lowered for token in ['explique', 'difference', 'différence', 'niveau', 'densite', 'densité']
    )
    wants_alerts = any(token in lowered for token in ['alerte', 'alertes', 'frequentee', 'fréquentée', 'pic', 'pointe'])

    if origin_query and destination_query:
        intent = 'route_plan'
    elif wants_alerts and (zone_query or 'zone' in lowered or 'heure' in lowered):
        intent = 'alert_query'
    elif wants_density_explanation:
        intent = 'density_explanation'
    elif needs_reassurance or wants_calm:
        intent = 'reassurance'
    else:
        intent = 'general'

    travel_datetime_iso = None
    if requested_hour is not None:
        candidate = datetime.now().replace(
            hour=requested_hour,
            minute=requested_minute,
            second=0,
            microsecond=0,
        )
        if candidate < datetime.now() - timedelta(minutes=10):
            candidate += timedelta(days=1)
        travel_datetime_iso = candidate.isoformat()

    return _normalize_intent(
        {
            'intent': intent,
            'origin_query': origin_query,
            'destination_query': destination_query,
            'zone_query': zone_query,
            'travel_datetime_iso': travel_datetime_iso,
            'requested_hour': requested_hour,
            'wants_calm': wants_calm,
            'needs_reassurance': needs_reassurance,
            'wants_density_explanation': wants_density_explanation,
            'wants_alerts': wants_alerts,
            'topic_summary': _clean_text(message),
            'follow_up_question': (
                "Quel est votre point de depart et votre destination ?"
                if intent == 'route_plan' and (not origin_query or not destination_query)
                else None
            ),
        }
    )


def _extract_intent(message, history):
    try:
        return _extract_intent_with_llm(message, history)
    except Exception:
        return _extract_intent_with_rules(message, history)


def _resolve_requested_datetime(intent):
    parsed_datetime = _parse_iso_datetime(intent.get('travel_datetime_iso'))
    if parsed_datetime:
        return parsed_datetime

    hour = intent.get('requested_hour')
    if hour is None:
        return None

    now = datetime.now()
    candidate = now.replace(hour=int(hour) % 24, minute=0, second=0, microsecond=0)
    if candidate < now - timedelta(minutes=10):
        candidate += timedelta(days=1)
    return candidate


def _build_density_windows(lat, lng, requested_datetime=None):
    base = requested_datetime or datetime.now().replace(minute=0, second=0, microsecond=0)
    now = datetime.now()
    offsets = [-60, 0, 60, 120, 180] if requested_datetime else [0, 60, 120, 180, 240]
    windows = []

    for offset in offsets:
        candidate = base + timedelta(minutes=offset)
        if candidate < now - timedelta(minutes=5):
            continue
        prediction = predict_density(lat, lng, candidate, skip_realtime=True)
        density_value = float(prediction.get('density') or 0)
        windows.append(
            {
                'datetime': candidate.isoformat(),
                'label': _format_hour_label(candidate),
                'density_pct': round(density_value * 100),
                'level': _density_label(density_value),
            }
        )

    ranked = sorted(
        windows,
        key=lambda item: (
            item['density_pct'],
            abs((_parse_iso_datetime(item['datetime']) - base).total_seconds()),
        ),
    )
    return ranked[:3]


def _build_alerts_for_density(label, density_ratio, requested_datetime=None):
    density_pct = round(float(density_ratio or 0) * 100)
    hour_label = _format_hour_label(requested_datetime) if requested_datetime else 'maintenant'
    alerts = []

    if density_pct >= 70:
        alerts.append(
            {
                'level': 'high',
                'title': 'Zone tres frequentee',
                'text': f'{label} risque d etre tres frequentee vers {hour_label}.',
            }
        )
    elif density_pct >= 45:
        alerts.append(
            {
                'level': 'medium',
                'title': 'Affluence moderee',
                'text': f'{label} devrait rester animee vers {hour_label}.',
            }
        )
    else:
        alerts.append(
            {
                'level': 'low',
                'title': 'Fenetre plutot calme',
                'text': f'{label} devrait rester assez fluide vers {hour_label}.',
            }
        )
    return alerts


def _route_preferences_from_intent(intent):
    wants_calm = intent.get('wants_calm')
    needs_reassurance = intent.get('needs_reassurance')
    return {
        'maxDensity': 0.35 if wants_calm else 0.6,
        'avoidMainRoads': True,
        'preferParks': True,
        'noiseSensitivity': 8 if needs_reassurance else 6,
        'walkingSpeed': 1.25 if wants_calm else 1.4,
        'considerPublicTransport': True,
        'transportFactor': 0.18 if wants_calm else 0.15,
    }


def _route_card_payload(route):
    comfort = route.get('comfort') or {}
    return {
        'id': route.get('id'),
        'mode': route.get('mode'),
        'mode_label': route.get('mode_label'),
        'duration_minutes': route.get('duration_minutes'),
        'calm_score': comfort.get('calm_score'),
        'average_density_pct': comfort.get('average_density_pct'),
        'summary': route.get('summary') or route.get('recommendation_summary'),
    }


def _plan_route_from_intent(intent, user_id):
    origin_query = intent.get('origin_query')
    destination_query = intent.get('destination_query')
    if not origin_query or not destination_query:
        return {'error': 'missing_locations'}

    navitia_client = IDFMNavitiaClient()
    if not navitia_client.is_configured():
        return {
            'error': 'routing_unavailable',
            'message': 'Le moteur de trajet IDFM/Navitia n est pas configure pour le moment.',
        }

    helper = CalculateRouteView()
    requested_datetime = _resolve_requested_datetime(intent)
    user_prefs = helper._persist_user_preferences(user_id, _route_preferences_from_intent(intent))

    place_results = run_parallel_with_timeout(
        {
            'origin': lambda: navitia_client.resolve_location({'query': origin_query}, fallback_name='Depart'),
            'destination': lambda: navitia_client.resolve_location({'query': destination_query}, fallback_name='Arrivee'),
        },
        timeout=4.2,
        defaults={'origin': None, 'destination': None},
        max_workers=2,
    )
    origin_place = place_results.get('origin')
    destination_place = place_results.get('destination')
    if not origin_place or not destination_place:
        return {
            'error': 'location_not_found',
            'message': 'Je n ai pas reussi a retrouver le point de depart ou d arrivee.',
        }

    requested_modes = ['transit', 'walking', 'bike']
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

    line_ids = helper._collect_line_ids_from_journeys(journey_results)
    disruptions_by_line = navitia_client.fetch_line_disruptions(line_ids) if line_ids else {}
    data_manager = DataSourceManager()
    route_options = {}
    all_routes = []

    for mode in helper.DEFAULT_MODE_ORDER:
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
            enriched = helper._enrich_route(
                normalized,
                origin_place,
                destination_place,
                user_prefs,
                data_manager,
                requested_datetime,
            )
            enriched['rank'] = index + 1
            normalized_routes.append(enriched)

        normalized_routes.sort(key=helper._route_sort_key)
        route_options[mode] = normalized_routes
        all_routes.extend(normalized_routes)

    if not all_routes:
        return {
            'error': 'no_route',
            'message': 'Aucun itineraire fiable n est disponible pour cette demande.',
        }

    recommended_route = max(
        all_routes,
        key=lambda route: (
            route.get('comfort', {}).get('calm_score', 0),
            -(route.get('duration_minutes') or 0),
        ),
    )
    preview_point = recommended_route.get('preview_point') or destination_place.get('coord') or origin_place.get('coord')
    quieter_windows = _build_density_windows(
        preview_point.get('lat'),
        preview_point.get('lng'),
        requested_datetime=requested_datetime,
    )

    selected_density_pct = recommended_route.get('comfort', {}).get('average_density_pct') or 0
    alerts = []
    if (recommended_route.get('comfort', {}).get('peak_density_pct') or 0) >= 70:
        alerts.append(
            {
                'level': 'high',
                'title': 'Pic d affluence',
                'text': (
                    f"Le trajet entre {origin_place.get('name')} et {destination_place.get('name')} "
                    f"peut devenir charge vers {_format_hour_label(requested_datetime) if requested_datetime else 'maintenant'}."
                ),
            }
        )
    if recommended_route.get('disruptions'):
        alerts.append(
            {
                'level': 'medium',
                'title': 'Perturbations signalees',
                'text': f"{len(recommended_route.get('disruptions') or [])} perturbation(s) a surveiller sur le trajet.",
            }
        )
    if quieter_windows and quieter_windows[0]['density_pct'] + 8 < selected_density_pct:
        alerts.append(
            {
                'level': 'low',
                'title': 'Depart plus calme possible',
                'text': f"Un depart vers {quieter_windows[0]['label']} devrait etre plus serein.",
            }
        )

    alternative_cards = []
    for mode in helper.DEFAULT_MODE_ORDER:
        if not route_options.get(mode):
            continue
        alternative_cards.append(_route_card_payload(route_options[mode][0]))

    return {
        'route_summary': {
            'origin': origin_place.get('name') or origin_query,
            'destination': destination_place.get('name') or destination_query,
            'travel_datetime': requested_datetime.isoformat() if requested_datetime else None,
            'requested_time_label': _format_hour_label(requested_datetime) if requested_datetime else None,
            'recommended_mode': recommended_route.get('mode'),
            'recommended_mode_label': recommended_route.get('mode_label'),
            'duration_minutes': recommended_route.get('duration_minutes'),
            'calm_score': recommended_route.get('comfort', {}).get('calm_score'),
            'comfort_label': recommended_route.get('comfort', {}).get('label'),
            'average_density_pct': selected_density_pct,
            'peak_density_pct': recommended_route.get('comfort', {}).get('peak_density_pct'),
            'summary': helper._build_recommendation_summary(recommended_route),
            'reasons': recommended_route.get('comfort', {}).get('rationale') or [],
            'quieter_windows': quieter_windows,
            'calm_zones': recommended_route.get('calm_zones') or [],
            'alternatives': alternative_cards[:3],
            'provider': 'IDFM Navitia',
        },
        'alerts': alerts,
        'user_preferences': helper._serialize_user_preferences(user_prefs),
    }


def _resolve_density_subject(intent):
    zone_query = intent.get('zone_query')
    if zone_query:
        resolved = resolve_zone(zone_query)
        if resolved:
            zone_id, config = resolved
            return {
                'type': 'zone',
                'zone_id': zone_id,
                'label': config.get('label', zone_id),
                'point': config.get('center') or {},
            }

        geocoded = geocode_search(zone_query)
        if geocoded:
            return {
                'type': 'place',
                'label': geocoded.get('name') or geocoded.get('display_name') or zone_query,
                'point': {'lat': geocoded.get('lat'), 'lng': geocoded.get('lng')},
            }

    default_zone = resolve_zone('paris')
    if default_zone:
        zone_id, config = default_zone
        return {
            'type': 'zone',
            'zone_id': zone_id,
            'label': config.get('label', zone_id),
            'point': config.get('center') or {},
        }
    return None


def _build_density_context(intent):
    subject = _resolve_density_subject(intent)
    requested_datetime = _resolve_requested_datetime(intent)
    if not subject or not subject.get('point'):
        return {
            'density_overview': {'scale': _density_scale()},
            'alerts': [],
            'error': 'density_subject_not_found',
        }

    point = subject['point']
    density_result = None
    if subject.get('type') == 'zone' and subject.get('zone_id'):
        density_result = predict_density_by_zone(subject['zone_id'], requested_datetime)
    if not density_result:
        density_result = predict_density(point.get('lat'), point.get('lng'), requested_datetime)
        density_result['zone_label'] = subject.get('label')

    density_ratio = float(density_result.get('density') or 0)
    label = density_result.get('zone_label') or subject.get('label')

    return {
        'density_overview': {
            'label': label,
            'travel_datetime': requested_datetime.isoformat() if requested_datetime else None,
            'density_pct': round(density_ratio * 100),
            'level': _density_label(density_ratio),
            'confidence': density_result.get('confidence'),
            'hour': density_result.get('hour'),
            'scale': _density_scale(),
            'quieter_windows': _build_density_windows(
                point.get('lat'),
                point.get('lng'),
                requested_datetime=requested_datetime,
            ),
        },
        'alerts': _build_alerts_for_density(label, density_ratio, requested_datetime=requested_datetime),
    }


def _build_context(message, intent, user_id):
    del message
    if intent.get('intent') == 'route_plan':
        if not intent.get('origin_query') or not intent.get('destination_query'):
            return {
                'needs_clarification': True,
                'follow_up_question': intent.get('follow_up_question')
                or 'Quel est votre point de depart et votre destination ?',
                'alerts': [],
            }
        return _plan_route_from_intent(intent, user_id)

    if intent.get('intent') in {'density_explanation', 'alert_query'}:
        return _build_density_context(intent)

    if intent.get('intent') == 'reassurance':
        return {
            'needs_clarification': True,
            'follow_up_question': (
                intent.get('follow_up_question')
                or 'Dites-moi votre depart, votre destination et l heure visee, et je vous proposerai l option la plus calme.'
            ),
            'density_overview': {'scale': _density_scale()},
            'alerts': [],
        }

    return {
        'needs_clarification': True,
        'follow_up_question': (
            'Je peux vous aider a choisir un trajet plus calme, expliquer la densite ou signaler un risque de foule. '
            'Que voulez-vous faire ?'
        ),
        'alerts': [],
    }


def _build_local_reply(intent, context):
    if context.get('message'):
        return context.get('message')

    if context.get('route_summary'):
        route_summary = context['route_summary']
        quieter = route_summary.get('quieter_windows') or []
        best_window = quieter[0] if quieter else None
        pieces = [
            (
                f"Pour aller de {route_summary.get('origin')} a {route_summary.get('destination')}, "
                f"je vous conseille {route_summary.get('recommended_mode_label', 'cet itineraire')}."
            ),
            (
                f"Comptez environ {route_summary.get('duration_minutes')} min, avec une densite estimee a "
                f"{route_summary.get('average_density_pct')} % et un score de calme de {route_summary.get('calm_score')}/100."
            ),
        ]
        if best_window:
            pieces.append(
                f"Si vous pouvez decaler, {best_window.get('label')} devrait etre plus calme "
                f"({best_window.get('density_pct')} %)."
            )
        if context.get('alerts'):
            pieces.append(context['alerts'][0].get('text'))
        return ' '.join(piece for piece in pieces if piece)

    if context.get('density_overview'):
        overview = context['density_overview']
        scale = overview.get('scale') or _density_scale()
        if overview.get('label'):
            pieces = [
                f"Pour {overview.get('label')}, l estimation est de {overview.get('density_pct')} %, donc une zone {overview.get('level')}.",
            ]
            quieter = overview.get('quieter_windows') or []
            if quieter:
                pieces.append(
                    f"Le meilleur creux proche est vers {quieter[0].get('label')} avec {quieter[0].get('density_pct')} %."
                )
            pieces.append(
                f"Niveaux SafePath: {scale[0]['label']} {scale[0]['range']}, "
                f"{scale[1]['label']} {scale[1]['range']}, {scale[2]['label']} {scale[2]['range']}."
            )
            return ' '.join(pieces)
        return (
            f"Niveaux SafePath: {scale[0]['label']} {scale[0]['range']}, "
            f"{scale[1]['label']} {scale[1]['range']}, {scale[2]['label']} {scale[2]['range']}."
        )

    if context.get('follow_up_question'):
        if intent.get('needs_reassurance') or intent.get('intent') == 'reassurance':
            return (
                "Je peux vous aider a choisir une option plus sereine et eviter les pics de foule. "
                f"{context.get('follow_up_question')}"
            )
        return context.get('follow_up_question')

    return (
        "Je peux vous aider a planifier un trajet plus calme, expliquer les niveaux de densite "
        "ou signaler une zone chargee."
    )


def _compose_reply_with_llm(message, history, intent, context):
    payload = {
        'intent': intent,
        'context': context,
        'current_datetime': datetime.now().isoformat(),
    }
    messages = [
        {
            'role': 'system',
            'content': (
                "Tu es SafePath, un assistant mobilite rassurant. "
                "Reponds en francais, de maniere chaleureuse, concrete et concise. "
                "Tu dois t appuyer uniquement sur les faits fournis. "
                "Priorite: recommandation utile, densite, horaires plus calmes, alertes, ton rassurant. "
                "Si des informations manquent, pose une seule question courte."
            ),
        },
        *history[-4:],
        {
            'role': 'user',
            'content': (
                f"Demande: {message}\n"
                f"Faits verifies: {json.dumps(payload, ensure_ascii=True)}"
            ),
        },
    ]
    return _clean_text(_call_mistral(messages, temperature=0.35, max_tokens=420))


def _compose_reply(message, history, intent, context):
    try:
        if _get_mistral_api_key():
            reply = _compose_reply_with_llm(message, history, intent, context)
            if reply:
                return reply
    except Exception:
        pass
    return _build_local_reply(intent, context)


class ChatbotView(APIView):
    def post(self, request):
        message = _clean_text(request.data.get('message'))
        if not message:
            return Response({'error': 'Message requis'}, status=status.HTTP_400_BAD_REQUEST)

        history = _sanitize_history(request.data.get('history'))
        user_id = _resolve_request_user_id(request, request.data.get('user_id', 'chatbot-user'))

        try:
            intent = _extract_intent(message, history)
            context = _build_context(message, intent, user_id)
            reply = _compose_reply(message, history, intent, context)
        except IDFMNavitiaError as exc:
            intent = _extract_intent_with_rules(message, history)
            context = {'alerts': [], 'follow_up_question': None, 'error': 'navitia_error'}
            reply = (
                f"Je n arrive pas a interroger le moteur d itineraire pour le moment: {str(exc)}. "
                "Reessayez dans un instant ou donnez-moi une autre heure."
            )
        except Exception:
            intent = _extract_intent_with_rules(message, history)
            context = {'alerts': [], 'follow_up_question': None, 'error': 'internal_error'}
            reply = _build_local_reply(intent, context)

        return Response(
            {
                'reply': reply,
                'intent': intent.get('intent'),
                'structured_intent': intent,
                'route_summary': context.get('route_summary'),
                'density_overview': context.get('density_overview'),
                'alerts': context.get('alerts') or [],
                'follow_up_question': context.get('follow_up_question'),
                'metadata': {
                    'provider': 'Mistral + SafePath',
                    'llm_enabled': bool(_get_mistral_api_key()),
                    'model': MISTRAL_MODEL if _get_mistral_api_key() else None,
                },
            }
        )
