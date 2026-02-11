"""
Agrégateur de données open data pour SafePath.
Combine trafic, météo, flux piétons et événements pour estimer la densité par point.
"""
from typing import Dict, List
from .data_sources import DataSourceManager


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
        Retourne densité estimée 0-1 et métadonnées des sources.
        """
        sources_used = []
        density_components = []

        # 1. Trafic (proxy densité véhicules -> piétons aux carrefours)
        traffic = self.data_manager.get_traffic_data(point)
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

        # 2. Météo (pluie = moins de monde)
        weather = self.data_manager.get_weather_data(point)
        weather_factor = weather.get('weather_factor', 1.0)
        sources_used.append({
            'name': 'OpenWeather',
            'weight': 0.15,
            'value': weather_factor
        })
        base_density = 0.4
        density_components.append(0.15 * base_density * weather_factor)

        # 3. Flux piétons (Open Data Paris ou estimation POI)
        pedestrian = self.data_manager.get_pedestrian_flow_data(point)
        flow = pedestrian.get('flow', 0.5)
        conf = pedestrian.get('confidence', 0.5)
        sources_used.append({
            'name': pedestrian.get('source', 'pedestrian_flow'),
            'weight': 0.45,
            'value': flow,
            'confidence': conf
        })
        density_components.append(0.45 * flow)

        # 4. Événements (augmentent la densité)
        events = self.data_manager.get_events_data(point)
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
        max_points: int = 15
    ) -> List[Dict]:
        """
        Calcule la densité agrégée pour des points échantillonnés du chemin.
        Échantillonnage pour éviter 100+ appels API (TomTom, OpenWeather, etc. par point).
        path: [[lng, lat], ...]
        """
        if not path:
            return []
        # Échantillonnage : max 15 points pour limiter les appels API
        n = len(path)
        if n <= max_points:
            indices = list(range(n))
        else:
            indices = [
                int(i * (n - 1) / (max_points - 1))
                for i in range(max_points)
            ]
            indices = sorted(set(indices))
        results = []
        for i in indices:
            coord = path[i]
            point = {'lng': coord[0], 'lat': coord[1]}
            agg = self.get_aggregated_density_for_point(point)
            results.append({
                'location': {'lng': coord[0], 'lat': coord[1]},
                'density': agg['density'],
                'confidence': agg['confidence'],
                'source': 'aggregated'
            })
        return results
