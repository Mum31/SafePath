"""
Agrégateur de données open data pour SafePath.
Combine trafic, météo, flux piétons et événements pour estimer la densité par point.
"""
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List
from .data_sources import DataSourceManager

_AGGREGATOR_SOURCE_TIMEOUT = 2


class DataAggregator:
    """Agrège les données de multiples sources pour estimer la densité"""

    def __init__(self):
        self.data_manager = DataSourceManager()

    def get_aggregated_density_for_point(
        self,
        point: Dict,
        target_datetime=None
    ) -> Dict:
        """
        Agrège trafic, météo, flux piétons, événements pour un point.
        Les 4 sources sont appelées en parallèle pour réduire le temps.
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

        with ThreadPoolExecutor(max_workers=4) as executor:
            fut_t = executor.submit(_traffic)
            fut_w = executor.submit(_weather)
            fut_p = executor.submit(_pedestrian)
            fut_e = executor.submit(_events)
            try:
                traffic = fut_t.result(timeout=_AGGREGATOR_SOURCE_TIMEOUT)
            except Exception:
                traffic = {'flow': 0.5, 'confidence': 0.0}
            try:
                weather = fut_w.result(timeout=_AGGREGATOR_SOURCE_TIMEOUT)
            except Exception:
                weather = {'weather_factor': 1.0}
            try:
                pedestrian = fut_p.result(timeout=_AGGREGATOR_SOURCE_TIMEOUT)
            except Exception:
                pedestrian = {'flow': 0.5, 'confidence': 0.5, 'source': 'default'}
            try:
                events = fut_e.result(timeout=_AGGREGATOR_SOURCE_TIMEOUT)
            except Exception:
                events = []

        if traffic.get('confidence', 0) > 0:
            sources_used.append({
                'name': 'TomTom Traffic',
                'weight': 0.2,
                'value': traffic.get('flow', 0.5)
            })
            density_components.append(0.2 * traffic.get('flow', 0.5))
        else:
            sources_used.append({'name': 'TomTom Traffic', 'weight': 0, 'value': 0.5})
            density_components.append(0.1)

        weather_factor = weather.get('weather_factor', 1.0)
        sources_used.append({
            'name': 'OpenWeather',
            'weight': 0.15,
            'value': weather_factor
        })
        density_components.append(0.15 * 0.4 * weather_factor)

        flow = pedestrian.get('flow', 0.5)
        conf = pedestrian.get('confidence', 0.5)
        sources_used.append({
            'name': pedestrian.get('source', 'pedestrian_flow'),
            'weight': 0.45,
            'value': flow,
            'confidence': conf
        })
        density_components.append(0.45 * flow)
        events_impact = min(0.3, len(events) * 0.05)
        if events:
            sources_used.append({
                'name': 'Paris Open Data Events',
                'weight': 0.2,
                'value': 1 + events_impact,
                'events_count': len(events)
            })
            density_components.append(0.2 * (0.5 + events_impact))
        else:
            density_components.append(0.1)

        # Densité agrégée normalisée [0, 1]
        total_density = sum(density_components)
        aggregated = min(1.0, max(0.05, total_density))

        return {
            'density': round(aggregated, 3),
            'location': point,
            'sources': sources_used,
            'confidence': self._compute_overall_confidence(sources_used),
            'timestamp': point.get('timestamp')
        }

    def _compute_overall_confidence(self, sources: List[Dict]) -> float:
        """Calcule la confiance globale des données agrégées"""
        if not sources:
            return 0.0
        total_weight = sum(s.get('weight', 0.25) for s in sources)
        if total_weight == 0:
            return 0.5
        weighted_conf = sum(s.get('confidence', 0.7) * s.get('weight', 0.25) for s in sources)
        return min(1.0, weighted_conf / total_weight)

    def get_density_for_path(
        self,
        path: List[List[float]],
        interval_meters: int = 50,
        max_points: int = 6
    ) -> List[Dict]:
        """
        Calcule la densité agrégée pour des points échantillonnés du chemin.
        Échantillonnage pour limiter les appels API (max_points=6 pour garder le calcul rapide).
        path: [[lng, lat], ...]
        """
        if not path:
            return []
        n = len(path)
        if n <= max_points:
            indices = list(range(n))
        else:
            indices = [
                int(i * (n - 1) / (max_points - 1))
                for i in range(max_points)
            ]
            indices = sorted(set(indices))
        def task(pos, path_idx):
            coord = path[path_idx]
            point = {'lng': coord[0], 'lat': coord[1]}
            agg = self.get_aggregated_density_for_point(point)
            return pos, {'location': {'lng': coord[0], 'lat': coord[1]}, 'density': agg['density'], 'confidence': agg['confidence'], 'source': 'aggregated'}

        results = [None] * len(indices)
        with ThreadPoolExecutor(max_workers=len(indices)) as executor:
            futures = [executor.submit(task, pos, idx) for pos, idx in enumerate(indices)]
            for fut in futures:
                try:
                    pos, item = fut.result(timeout=_AGGREGATOR_SOURCE_TIMEOUT * 3)
                    results[pos] = item
                except Exception:
                    pass
        # Remplir les échecs par une densité par défaut
        for pos in range(len(results)):
            if results[pos] is None:
                idx = indices[pos]
                coord = path[idx]
                results[pos] = {'location': {'lng': coord[0], 'lat': coord[1]}, 'density': 0.5, 'confidence': 0.0, 'source': 'aggregated'}
        return results
