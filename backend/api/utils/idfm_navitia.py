import os
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import quote

import requests

from .data_sources import geocode_search


IDFM_NAVITIA_BASE_URL = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia'
IDFM_NAVITIA_TIMEOUT = 8
TRANSPORT_MODES = {
    'transit': {
        'label': 'Transports',
        'api_mode': None,
    },
    'walking': {
        'label': 'A pied',
        'api_mode': 'walking',
    },
    'bike': {
        'label': 'Velo',
        'api_mode': 'bike',
    },
    'car': {
        'label': 'Voiture',
        'api_mode': 'car',
    },
}

PHYSICAL_MODE_FAMILIES = {
    'metro': 'metro',
    'rapid_transit': 'metro',
    'rer': 'rer',
    'rail_shuttle': 'train',
    'train': 'train',
    'local_train': 'train',
    'long_distance_train': 'train',
    'bus': 'bus',
    'coach': 'bus',
    'tramway': 'tram',
    'funicular': 'funicular',
}


class IDFMNavitiaError(Exception):
    pass


def _get_api_key() -> str:
    return (
        os.getenv('IDFM_API_KEY')
        or os.getenv('IDFM_NAVITIA_API_KEY')
        or os.getenv('VITE_IDFM_API_KEY')
        or ''
    )


def _format_navitia_datetime(value: Optional[datetime]) -> str:
    target = value or datetime.now()
    return target.strftime('%Y%m%dT%H%M%S')


def _parse_navitia_datetime(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    for pattern in ('%Y%m%dT%H%M%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(value, pattern).isoformat()
        except ValueError:
            continue
    return value


def _safe_float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coord_from_any(payload: Optional[Dict]) -> Optional[Dict]:
    payload = payload or {}
    coord = payload.get('coord') or payload.get('address', {}).get('coord') or {}
    lat = _safe_float(coord.get('lat'))
    lng = _safe_float(coord.get('lon') or coord.get('lng'))
    if lat is None or lng is None:
        return None
    return {'lat': lat, 'lng': lng}


def _label_from_place(place: Dict) -> str:
    embedded_type = place.get('embedded_type')
    embedded = place.get(embedded_type or '', {}) if embedded_type else {}
    return (
        place.get('name')
        or embedded.get('name')
        or place.get('label')
        or embedded.get('label')
        or 'Lieu'
    )


def _address_from_place(place: Dict) -> str:
    embedded_type = place.get('embedded_type')
    embedded = place.get(embedded_type or '', {}) if embedded_type else {}
    return place.get('label') or embedded.get('label') or _label_from_place(place)


def _score_place(place: Dict) -> tuple:
    embedded_type = place.get('embedded_type') or ''
    priority = {
        'address': 0,
        'poi': 1,
        'stop_area': 2,
        'stop_point': 3,
        'administrative_region': 4,
    }.get(embedded_type, 10)
    quality = place.get('quality', 0)
    return (priority, -quality)


def _build_query_variants(query: str) -> List[str]:
    base = (query or '').strip()
    if not base:
        return []

    normalized = base.casefold()
    variants = [base]

    if ',' not in base and 'paris' not in normalized:
        variants.append(f'{base}, Paris')

    if 'ile-de-france' not in normalized and 'ile de france' not in normalized:
        variants.append(f'{base}, Ile-de-France')

    if 'france' not in normalized:
        variants.append(f'{base}, France')

    unique_variants = []
    seen = set()
    for item in variants:
        key = item.casefold().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        unique_variants.append(item)

    return unique_variants


def _normalize_fare(total_fare: Dict) -> Dict:
    raw_value = _safe_float((total_fare or {}).get('value'))
    raw_currency = str((total_fare or {}).get('currency') or 'EUR').strip()
    normalized_currency_key = raw_currency.casefold()

    if raw_value is None:
        return {
            'value': None,
            'currency': 'EUR',
            'raw_currency': raw_currency or 'EUR',
        }

    if normalized_currency_key in {'centime', 'centimes', 'cent', 'cents'}:
        return {
            'value': round(raw_value / 100, 2),
            'currency': 'EUR',
            'raw_currency': raw_currency,
        }

    if normalized_currency_key in {'eur', 'euro', 'euros'}:
        return {
            'value': raw_value,
            'currency': 'EUR',
            'raw_currency': raw_currency,
        }

    normalized_currency = raw_currency.upper()
    if len(normalized_currency) == 3 and normalized_currency.isalpha():
        return {
            'value': raw_value,
            'currency': normalized_currency,
            'raw_currency': raw_currency,
        }

    return {
        'value': raw_value,
        'currency': 'EUR',
        'raw_currency': raw_currency or 'EUR',
    }


def _extract_lines_from_sections(sections: List[Dict]) -> List[Dict]:
    lines = []
    seen_ids = set()

    for section in sections:
        if section.get('type') != 'public_transport':
            continue

        display = section.get('display_informations') or {}
        line_id = display.get('id') or display.get('code') or display.get('name')
        if not line_id or line_id in seen_ids:
            continue

        seen_ids.add(line_id)
        lines.append(
            {
                'id': line_id,
                'code': display.get('code') or display.get('name'),
                'name': display.get('name') or display.get('commercial_mode'),
                'mode': display.get('commercial_mode'),
                'physical_mode': display.get('physical_mode'),
                'mode_family': _resolve_mode_family(display),
                'network': display.get('network'),
                'color': display.get('color'),
                'text_color': display.get('text_color'),
                'direction': display.get('direction'),
            }
        )

    return lines


def _extract_stops_from_sections(sections: List[Dict]) -> List[Dict]:
    stops = []
    seen = set()

    for section in sections:
        for key, role in (('from', 'depart'), ('to', 'arrivee')):
            payload = section.get(key) or {}
            stop_id = payload.get('id') or f"{payload.get('name')}::{role}"
            coord = _coord_from_any(payload)
            if not stop_id or stop_id in seen:
                continue

            seen.add(stop_id)
            stops.append(
                {
                    'id': stop_id,
                    'name': payload.get('name') or role.title(),
                    'role': role,
                    'coord': coord,
                }
            )

    return stops


def _collect_path_from_sections(sections: List[Dict], fallback_origin: Dict, fallback_destination: Dict) -> List[List[float]]:
    coordinates = []

    for section in sections:
        geojson = section.get('geojson') or {}
        for coord in geojson.get('coordinates') or []:
            if not isinstance(coord, (list, tuple)) or len(coord) < 2:
                continue
            lng = _safe_float(coord[0])
            lat = _safe_float(coord[1])
            if lat is None or lng is None:
                continue
            point = [lng, lat]
            if not coordinates or coordinates[-1] != point:
                coordinates.append(point)

    if coordinates:
        return coordinates

    origin_coord = fallback_origin.get('coord')
    destination_coord = fallback_destination.get('coord')
    if origin_coord and destination_coord:
        return [
            [origin_coord['lng'], origin_coord['lat']],
            [destination_coord['lng'], destination_coord['lat']],
        ]
    return []


def _distance_from_sections(sections: List[Dict]) -> int:
    total_distance = 0

    for section in sections:
        try:
            total_distance += int(section.get('distance') or 0)
        except (TypeError, ValueError):
            continue

    return total_distance


def _resolve_mode_family(display: Optional[Dict]) -> str:
    display = display or {}
    physical_mode = str(display.get('physical_mode') or '').strip().lower().replace(' ', '_')
    commercial_mode = str(display.get('commercial_mode') or '').strip().lower().replace(' ', '_')

    if physical_mode in PHYSICAL_MODE_FAMILIES:
        return PHYSICAL_MODE_FAMILIES[physical_mode]

    if 'rer' in commercial_mode:
        return 'rer'
    if 'metro' in commercial_mode:
        return 'metro'
    if 'tram' in commercial_mode:
        return 'tram'
    if 'bus' in commercial_mode:
        return 'bus'
    if 'train' in commercial_mode or 'rail' in commercial_mode:
        return 'train'

    return commercial_mode or physical_mode or 'transit'


def _extract_intermediate_stops(section: Dict) -> List[Dict]:
    intermediate_stops = []
    stop_date_times = section.get('stop_date_times') or []

    for item in stop_date_times:
        stop_point = item.get('stop_point') or {}
        coord = _coord_from_any(stop_point)
        stop_name = stop_point.get('name')
        if not stop_name:
            continue

        intermediate_stops.append(
            {
                'id': stop_point.get('id') or stop_name,
                'name': stop_name,
                'coord': coord,
                'arrival_time': _parse_navitia_datetime(item.get('arrival_date_time')),
                'departure_time': _parse_navitia_datetime(item.get('departure_date_time')),
            }
        )

    return intermediate_stops


def _summarize_transport_mix(lines: List[Dict]) -> List[Dict]:
    mix = {}

    for line in lines:
        family = line.get('mode_family') or 'transit'
        entry = mix.setdefault(
            family,
            {
                'family': family,
                'count': 0,
                'lines': [],
            },
        )
        entry['count'] += 1
        entry['lines'].append(
            {
                'id': line.get('id'),
                'code': line.get('code'),
                'name': line.get('name'),
                'color': line.get('color'),
                'text_color': line.get('text_color'),
            }
        )

    return list(mix.values())


def _parse_street_steps(section: Dict) -> List[Dict]:
    steps = []
    mode = section.get('mode') or 'walking'
    start_coord = _coord_from_any(section.get('from'))
    end_coord = _coord_from_any(section.get('to'))
    departure_name = (section.get('from') or {}).get('name') or 'Depart'
    arrival_name = (section.get('to') or {}).get('name') or 'Arrivee'

    for item in section.get('path') or []:
        instruction = item.get('instruction') or item.get('name') or 'Continuer'
        steps.append(
            {
                'type': 'street_network',
                'mode': mode,
                'label': instruction,
                'detail': item.get('name') or section.get('from', {}).get('name') or '',
                'distance': item.get('length') or item.get('distance') or 0,
                'duration': item.get('duration') or 0,
                'departure_stop': departure_name,
                'arrival_stop': arrival_name,
                'from_coord': start_coord,
                'to_coord': end_coord,
                'coord': end_coord or start_coord,
            }
        )

    if steps:
        return steps

    return [
        {
            'type': 'street_network',
            'mode': mode,
            'label': f'Trajet {TRANSPORT_MODES.get(mode, {}).get("label", mode)}',
            'detail': '',
            'distance': section.get('distance') or 0,
            'duration': section.get('duration') or 0,
            'departure_stop': departure_name,
            'arrival_stop': arrival_name,
            'from_coord': start_coord,
            'to_coord': end_coord,
            'coord': end_coord or start_coord,
        }
    ]


def _parse_public_transport_step(section: Dict) -> Dict:
    display = section.get('display_informations') or {}
    departure_name = (section.get('from') or {}).get('name') or 'Depart'
    arrival_name = (section.get('to') or {}).get('name') or 'Arrivee'
    line_code = display.get('code') or display.get('name') or 'Ligne'
    direction = display.get('direction') or arrival_name
    departure_coord = _coord_from_any(section.get('from'))
    arrival_coord = _coord_from_any(section.get('to'))
    intermediate_stops = _extract_intermediate_stops(section)
    mode_family = _resolve_mode_family(display)
    return {
        'type': 'public_transport',
        'mode': 'transit',
        'label': f'Prendre {line_code}',
        'detail': f'{departure_name} -> {arrival_name}',
        'line': {
            'id': display.get('id'),
            'code': display.get('code'),
            'name': display.get('name'),
            'mode': display.get('commercial_mode'),
            'physical_mode': display.get('physical_mode'),
            'mode_family': mode_family,
            'network': display.get('network'),
            'direction': direction,
            'color': display.get('color'),
            'text_color': display.get('text_color'),
        },
        'departure_stop': departure_name,
        'arrival_stop': arrival_name,
        'departure_time': _parse_navitia_datetime(section.get('departure_date_time')),
        'arrival_time': _parse_navitia_datetime(section.get('arrival_date_time')),
        'distance': section.get('distance') or 0,
        'duration': section.get('duration') or 0,
        'stop_count': max(0, len(section.get('stop_date_times') or []) - 1),
        'intermediate_stops': intermediate_stops,
        'network': display.get('network'),
        'mode_family': mode_family,
        'from_coord': departure_coord,
        'to_coord': arrival_coord,
        'coord': departure_coord or arrival_coord,
    }


def _parse_transfer_step(section: Dict) -> Dict:
    label = {
        'waiting': 'Attente',
        'transfer': 'Correspondance',
        'crow_fly': 'Transition',
    }.get(section.get('type'), 'Transition')
    departure_coord = _coord_from_any(section.get('from'))
    arrival_coord = _coord_from_any(section.get('to'))
    return {
        'type': section.get('type') or 'transition',
        'mode': 'transit',
        'label': label,
        'detail': f"{(section.get('from') or {}).get('name') or ''} -> {(section.get('to') or {}).get('name') or ''}".strip(' ->'),
        'distance': section.get('distance') or 0,
        'duration': section.get('duration') or 0,
        'departure_time': _parse_navitia_datetime(section.get('departure_date_time')),
        'arrival_time': _parse_navitia_datetime(section.get('arrival_date_time')),
        'from_coord': departure_coord,
        'to_coord': arrival_coord,
        'coord': arrival_coord or departure_coord,
    }


def _parse_steps_from_sections(sections: List[Dict]) -> List[Dict]:
    steps = []

    for section in sections:
        section_type = section.get('type')
        if section_type == 'street_network':
            steps.extend(_parse_street_steps(section))
        elif section_type == 'public_transport':
            steps.append(_parse_public_transport_step(section))
        elif section_type in {'waiting', 'transfer', 'crow_fly'}:
            steps.append(_parse_transfer_step(section))

    return steps


def _extract_schedule_rows(sections: List[Dict]) -> List[Dict]:
    rows = []

    for section in sections:
        if section.get('type') != 'public_transport':
            continue

        display = section.get('display_informations') or {}
        rows.append(
            {
                'line_id': display.get('id'),
                'line_code': display.get('code') or display.get('name'),
                'line_name': display.get('name'),
                'mode': display.get('commercial_mode'),
                'mode_family': _resolve_mode_family(display),
                'network': display.get('network'),
                'direction': display.get('direction'),
                'color': display.get('color'),
                'text_color': display.get('text_color'),
                'from': (section.get('from') or {}).get('name'),
                'to': (section.get('to') or {}).get('name'),
                'departure_time': _parse_navitia_datetime(section.get('departure_date_time')),
                'arrival_time': _parse_navitia_datetime(section.get('arrival_date_time')),
            }
        )

    return rows


def _flatten_disruptions(payload: Dict) -> List[Dict]:
    disruptions = []
    seen = set()

    for item in payload.get('disruptions') or []:
        disruption_id = item.get('id') or item.get('disruption_id') or item.get('headsign')
        if disruption_id in seen:
            continue
        seen.add(disruption_id)

        messages = []
        for message in item.get('messages') or []:
            text = message.get('text')
            if text:
                messages.append(text)

        disruptions.append(
            {
                'id': disruption_id,
                'title': item.get('title') or item.get('cause') or item.get('category') or 'Perturbation',
                'severity': ((item.get('severity') or {}).get('name') if isinstance(item.get('severity'), dict) else item.get('severity')) or '',
                'messages': messages,
                'updated_at': item.get('updated_at'),
            }
        )

    return disruptions


class IDFMNavitiaClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or _get_api_key()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _request(self, path: str, params: Optional[Dict] = None, timeout: int = IDFM_NAVITIA_TIMEOUT) -> Dict:
        if not self.api_key:
            raise IDFMNavitiaError('Cle API IDFM/Navitia manquante')

        response = requests.get(
            f'{IDFM_NAVITIA_BASE_URL}/{path.lstrip("/")}',
            params=params,
            headers={
                'Accept': 'application/json',
                'apikey': self.api_key,
            },
            timeout=timeout,
        )

        if response.status_code >= 400:
            raise IDFMNavitiaError(f'Erreur IDFM/Navitia {response.status_code}: {response.text[:200]}')
        return response.json()

    def search_places(self, query: str, count: int = 5) -> List[Dict]:
        payload = self._request('places', params={'q': query, 'count': count})
        return payload.get('places') or []

    def resolve_location(self, location: Dict, fallback_name: Optional[str] = None) -> Dict:
        if 'lat' in location and 'lng' in location:
            lat = _safe_float(location.get('lat'))
            lng = _safe_float(location.get('lng'))
            if lat is None or lng is None:
                raise IDFMNavitiaError('Coordonnees invalides')
            name = fallback_name or location.get('name') or location.get('label') or 'Ma position'
            return {
                'name': name,
                'address': location.get('address') or name,
                'coord': {'lat': lat, 'lng': lng},
                'uri': f'{lng};{lat}',
                'embedded_type': 'coord',
            }

        query = (location.get('query') or location.get('address') or location.get('name') or '').strip()
        if not query:
            query_parts = [
                (location.get('street') or '').strip(),
                (location.get('postal_code') or '').strip(),
                (location.get('city') or '').strip(),
            ]
            query = ', '.join(part for part in query_parts if part)
        if not query:
            raise IDFMNavitiaError('Lieu introuvable')

        best_place = None
        coord = None

        for variant in _build_query_variants(query):
            try:
                places = self.search_places(variant, count=6)
            except Exception:
                places = []
            if not places:
                continue

            candidate = sorted(places, key=_score_place)[0]
            candidate_coord = _coord_from_any(candidate)
            if not candidate_coord:
                continue

            best_place = candidate
            coord = candidate_coord
            break

        if best_place and coord:
            return {
                'name': _label_from_place(best_place),
                'address': _address_from_place(best_place),
                'coord': coord,
                'uri': best_place.get('id') or f"{coord['lng']};{coord['lat']}",
                'embedded_type': best_place.get('embedded_type'),
                'raw': best_place,
            }

        fallback_geo = None
        for variant in _build_query_variants(query):
            fallback_geo = geocode_search(variant)
            if fallback_geo:
                break

        if fallback_geo and fallback_geo.get('lat') is not None and fallback_geo.get('lng') is not None:
            lat = _safe_float(fallback_geo.get('lat'))
            lng = _safe_float(fallback_geo.get('lng'))
            if lat is not None and lng is not None:
                return {
                    'name': fallback_geo.get('name') or fallback_name or query,
                    'address': fallback_geo.get('address') or fallback_geo.get('display_name') or query,
                    'coord': {'lat': lat, 'lng': lng},
                    'uri': f'{lng};{lat}',
                    'embedded_type': 'coord',
                    'raw': fallback_geo,
                }

        raise IDFMNavitiaError(f'Lieu introuvable: {query}')

    def fetch_mode_journeys(
        self,
        origin: Dict,
        destination: Dict,
        requested_datetime: Optional[datetime],
        mode: str,
        count: int = 3,
    ) -> List[Dict]:
        params = {
            'from': f"{origin['coord']['lng']};{origin['coord']['lat']}",
            'to': f"{destination['coord']['lng']};{destination['coord']['lat']}",
            'datetime': _format_navitia_datetime(requested_datetime),
            'count': count,
            '_current_datetime': _format_navitia_datetime(datetime.now()),
            'data_freshness': 'realtime',
        }

        if mode == 'transit':
            params['first_section_mode[]'] = 'walking'
            params['last_section_mode[]'] = 'walking'
        else:
            api_mode = TRANSPORT_MODES[mode]['api_mode']
            params['direct_path'] = 'only'
            params['direct_path_mode'] = api_mode

        payload = self._request('journeys', params=params)
        return payload.get('journeys') or []

    def fetch_line_disruptions(self, line_ids: List[str]) -> Dict[str, List[Dict]]:
        disruptions_by_line = {}

        for line_id in line_ids:
            if not line_id:
                continue
            try:
                payload = self._request(
                    f"line_reports/lines/{quote(line_id, safe='')}/line_reports",
                    params={'count': 20},
                )
                disruptions_by_line[line_id] = _flatten_disruptions(payload)
            except Exception:
                disruptions_by_line[line_id] = []

        return disruptions_by_line

    def normalize_journey(
        self,
        journey: Dict,
        origin: Dict,
        destination: Dict,
        mode: str,
        disruptions_by_line: Optional[Dict[str, List[Dict]]] = None,
    ) -> Dict:
        sections = journey.get('sections') or []
        steps = _parse_steps_from_sections(sections)
        lines = _extract_lines_from_sections(sections)
        path = _collect_path_from_sections(sections, origin, destination)
        schedules = _extract_schedule_rows(sections)
        stops = _extract_stops_from_sections(sections)

        disruptions = []
        seen_disruption_ids = set()
        for line in lines:
            for disruption in (disruptions_by_line or {}).get(line['id'], []):
                if disruption['id'] in seen_disruption_ids:
                    continue
                seen_disruption_ids.add(disruption['id'])
                disruptions.append(disruption)

        fare = journey.get('fare') or {}
        total_fare = fare.get('total') or {}
        normalized_fare = _normalize_fare(total_fare)

        return {
            'id': journey.get('internal_id') or journey.get('type') or f'{mode}-{journey.get("departure_date_time")}',
            'mode': mode,
            'mode_label': TRANSPORT_MODES[mode]['label'],
            'departure_time': _parse_navitia_datetime(journey.get('departure_date_time')),
            'arrival_time': _parse_navitia_datetime(journey.get('arrival_date_time')),
            'duration_seconds': journey.get('duration') or 0,
            'duration_minutes': round((journey.get('duration') or 0) / 60, 1),
            'distance_m': _distance_from_sections(sections),
            'co2_emission': journey.get('co2_emission', {}).get('value'),
            'transfers': journey.get('nb_transfers', 0),
            'walking_duration_minutes': round((journey.get('durations', {}).get('walking') or 0) / 60, 1),
            'fare': normalized_fare,
            'tags': journey.get('tags') or [],
            'status': journey.get('status'),
            'path': path,
            'steps': steps,
            'segments': steps,
            'instructions': steps,
            'lines': lines,
            'stops': stops,
            'schedules': schedules,
            'disruptions': disruptions,
            'transport_mix': _summarize_transport_mix(lines),
            'summary': self._build_summary(mode, steps, journey),
        }

    def _build_summary(self, mode: str, steps: List[Dict], journey: Dict) -> str:
        if mode == 'transit':
            pt_steps = [step for step in steps if step.get('type') == 'public_transport']
            if not pt_steps:
                return 'Trajet en transports'
            first = pt_steps[0]
            return (
                f"{len(pt_steps)} segment(s) transport, "
                f"{journey.get('nb_transfers', 0)} correspondance(s), "
                f"depart {first.get('departure_stop') or 'transport'}"
            )

        return f"Trajet {TRANSPORT_MODES[mode]['label'].lower()} direct"
