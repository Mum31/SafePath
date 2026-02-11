import heapq
import math
from typing import List, Dict, Tuple

class StressAwarePathFinder:
    def __init__(self, user_prefs: Dict):
        self.user_prefs = user_prefs
        self.weights = {
            'distance': 0.3,
            'crowd_density': 0.4,
            'noise_level': 0.2,
            'road_type': 0.1,
        }
    
    def calculate_stress_cost(self, segment: Dict) -> float:
        """Calcule le coût de stress pour un segment"""
        cost = 0
        
        # Coût distance (normalisé)
        distance_km = segment.get('distance', 0) / 1000
        cost += self.weights['distance'] * distance_km
        
        # Coût densité de foule
        density = segment.get('crowd_density', 0.5)
        if density > self.user_prefs.get('max_crowd_density', 0.7):
            density_penalty = (density - self.user_prefs['max_crowd_density']) * 10
            cost += self.weights['crowd_density'] * density_penalty
        
        # Coût bruit
        noise = segment.get('noise_level', 60)
        noise_cost = max(0, (noise - 50) / 40)  # Normalisé 50-90 dB
        cost += self.weights['noise_level'] * noise_cost
        
        # Bonus pour espaces verts
        if segment.get('has_greenery', False):
            cost -= 0.2
        
        return max(0, cost)
    
    def find_optimal_path(self, graph, start, end) -> Dict:
        """Algorithme A* avec coût de stress"""
        open_set = []
        heapq.heappush(open_set, (0, start))
        
        came_from = {}
        g_score = {start: 0}  # Coût réel
        f_score = {start: self.heuristic(start, end)}  # Coût estimé
        
        while open_set:
            current = heapq.heappop(open_set)[1]
            
            if current == end:
                return self.reconstruct_path(came_from, current, graph)
            
            for neighbor in graph.neighbors(current):
                segment_data = graph[current][neighbor]
                tentative_g_score = g_score[current] + self.calculate_stress_cost(segment_data)
                
                if neighbor not in g_score or tentative_g_score < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g_score
                    f_score[neighbor] = tentative_g_score + self.heuristic(neighbor, end)
                    heapq.heappush(open_set, (f_score[neighbor], neighbor))
        
        return None
    
    def heuristic(self, a, b):
        """Distance euclidienne comme heuristique"""
        return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)
    
    def reconstruct_path(self, came_from, current, graph):
        """Reconstruit le chemin optimal"""
        path = [current]
        total_stress = 0
        
        while current in came_from:
            previous = came_from[current]
            segment_data = graph[previous][current]
            total_stress += self.calculate_stress_cost(segment_data)
            path.append(previous)
            current = previous
        
        path.reverse()
        
        return {
            'path': path,
            'total_stress': total_stress,
            'segments': self._get_segment_details(path, graph)
        }

    def _get_segment_details(self, path: List, graph) -> List[Dict]:
        """Reconstruit les détails des segments à partir du chemin"""
        segments = []
        for i in range(len(path) - 1):
            a, b = path[i], path[i + 1]
            segment_data = graph[a][b] if graph.has_edge(a, b) else {
                'distance': _haversine_distance(a, b),
                'crowd_density': 0.5,
                'noise_level': 60,
                'has_greenery': False
            }
            segments.append(segment_data)
        return segments


def _haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """Distance en mètres entre deux points (lat, lng)"""
    R = 6371000  # Rayon Terre en m
    lat1, lng1 = math.radians(coord1[1]), math.radians(coord1[0])
    lat2, lng2 = math.radians(coord2[1]), math.radians(coord2[0])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c