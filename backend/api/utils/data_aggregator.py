"""
Agregateur de donnees open data pour SafePath.
Combine trafic, meteo, flux pietons et evenements pour estimer la densite par point.
"""
from typing import Dict, List

from .data_sources import DataSourceManager
from .parallel import run_parallel_with_timeout

_AGGREGATOR_SOURCE_TIMEOUT = 1.25
_AGGREGATOR_POINT_TIMEOUT = 1.6


class DataAggregator:
    """Agrege les donnees de multiples sources pour estimer la densite."""

    def __init__(self):
        self.data_manager = DataSourceManager()

    def get_aggregated_density_for_point(self, point: Dict, target_datetime=None) -> Dict:
        """
        Agrege trafic, meteo, flux pietons, evenements pour un point.
        Les appels sont executes en parallele avec un timeout global court.
        """
        sources_used = []
        density_components = []

        def _traffic():
            try:
                return self.data_manager.get_traffic_data(point)
            except Exception:
                return {'flow': 0.5, 'confidence': 0.0}

        def _weather():
            try:
                return self.data_manager.get_weather_data(point)
            except Exception:
                return {'weather_factor': 1.0}

        def _pedestrian():
            try:
                return self.data_manager.get_pedestrian_flow_data(point)
            except Exception:
                return {'flow': 0.5, 'confidence': 0.5, 'source': 'default'}

        def _events():
            try:
                return self.data_manager.get_events_data(point)
            except Exception:
                return []

        results = run_parallel_with_timeout(
            {
                'traffic': _traffic,
                'weather': _weather,
                'pedestrian': _pedestrian,
                'events': _events,
            },
            timeout=_AGGREGATOR_SOURCE_TIMEOUT,
            defaults={
                'traffic': {'flow': 0.5, 'confidence': 0.0},
                'weather': {'weather_factor': 1.0},
                'pedestrian': {'flow': 0.5, 'confidence': 0.5, 'source': 'default'},
                'events': [],
            },
        )
        traffic = results['traffic']
        weather = results['weather']
        pedestrian = results['pedestrian']
        events = results['events']

        if traffic.get('confidence', 0) > 0:
            sources_used.append({
                'name': 'TomTom Traffic',
                'weight': 0.2,
                'value': traffic.get('flow', 0.5),
            })
            density_components.append(0.2 * traffic.get('flow', 0.5))
        else:
            sources_used.append({'name': 'TomTom Traffic', 'weight': 0, 'value': 0.5})
            density_components.append(0.1)

        weather_factor = weather.get('weather_factor', 1.0)
        sources_used.append({
            'name': 'OpenWeather',
            'weight': 0.15,
            'value': weather_factor,
        })
        density_components.append(0.15 * 0.4 * weather_factor)

        flow = pedestrian.get('flow', 0.5)
        conf = pedestrian.get('confidence', 0.5)
        sources_used.append({
            'name': pedestrian.get('source', 'pedestrian_flow'),
            'weight': 0.45,
            'value': flow,
            'confidence': conf,
        })
        density_components.append(0.45 * flow)

        events_impact = min(0.3, len(events) * 0.05)
        if events:
            sources_used.append({
                'name': 'Paris Open Data Events',
                'weight': 0.2,
                'value': 1 + events_impact,
                'events_count': len(events),
            })
            density_components.append(0.2 * (0.5 + events_impact))
        else:
            density_components.append(0.1)

        total_density = sum(density_components)
        aggregated = min(1.0, max(0.05, total_density))

        return {
            'density': round(aggregated, 3),
            'location': point,
            'sources': sources_used,
            'confidence': self._compute_overall_confidence(sources_used),
            'timestamp': point.get('timestamp'),
        }

    def _compute_overall_confidence(self, sources: List[Dict]) -> float:
        """Calcule la confiance globale des donnees agregees."""
        if not sources:
            return 0.0

        total_weight = sum(source.get('weight', 0.25) for source in sources)
        if total_weight == 0:
            return 0.5

        weighted_conf = sum(
            source.get('confidence', 0.7) * source.get('weight', 0.25)
            for source in sources
        )
        return min(1.0, weighted_conf / total_weight)

    def get_density_for_path(self, path: List[List[float]], interval_meters: int = 50, max_points: int = 6) -> List[Dict]:
        """
        Calcule la densite agregee pour des points echantillonnes du chemin.
        """
        del interval_meters
        if not path:
            return []

        n = len(path)
        if n <= max_points:
            indices = list(range(n))
        else:
            indices = sorted({int(i * (n - 1) / (max_points - 1)) for i in range(max_points)})

        def build_density_item(path_idx):
            coord = path[path_idx]
            point = {'lng': coord[0], 'lat': coord[1]}
            agg = self.get_aggregated_density_for_point(point)
            return {
                'location': {'lng': coord[0], 'lat': coord[1]},
                'density': agg['density'],
                'confidence': agg['confidence'],
                'source': 'aggregated',
            }

        task_map = {
            f'point_{position}': (lambda idx=index: build_density_item(idx))
            for position, index in enumerate(indices)
        }
        task_results = run_parallel_with_timeout(
            task_map,
            timeout=_AGGREGATOR_POINT_TIMEOUT,
            defaults={key: None for key in task_map},
        )

        results = [None] * len(indices)
        for position in range(len(indices)):
            payload = task_results.get(f'point_{position}')
            if payload is not None:
                results[position] = payload

        for position, index in enumerate(indices):
            if results[position] is None:
                coord = path[index]
                results[position] = {
                    'location': {'lng': coord[0], 'lat': coord[1]},
                    'density': 0.5,
                    'confidence': 0.0,
                    'source': 'aggregated',
                }

        return results
