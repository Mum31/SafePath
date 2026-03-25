import os
import django
import json
from django.contrib.gis.geos import Point

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'safe_path_api.settings')
django.setup()

from api.models import CalmZone

def initialize_calm_zones():
    """Initialise la base de données avec des zones calmes de test"""
    
    calm_zones_data = [
        {
            'name': 'Jardin du Luxembourg',
            'location': Point(2.3367, 48.8462),
            'zone_type': 'park',
            'comfort_score': 0.9,
            'capacity': 500,
            'opening_hours': {'open': '07:30', 'close': '21:30'}
        },
        {
            'name': 'Bibliothèque Sainte-Geneviève',
            'location': Point(2.3444, 48.8468),
            'zone_type': 'library',
            'comfort_score': 0.85,
            'capacity': 200,
            'opening_hours': {'open': '10:00', 'close': '22:00'}
        },
        {
            'name': 'Rue Mouffetard',
            'location': Point(2.3508, 48.8413),
            'zone_type': 'quiet_street',
            'comfort_score': 0.75,
            'opening_hours': {'open': '00:00', 'close': '23:59'}
        },
    ]
    
    for zone_data in calm_zones_data:
        CalmZone.objects.get_or_create(
            name=zone_data['name'],
            defaults=zone_data
        )
    
    print(f"{len(calm_zones_data)} zones calmes initialisées.")

if __name__ == '__main__':
    initialize_calm_zones() 
