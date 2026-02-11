from django.db import models
import json

class UserPreferences(models.Model):
    """Préférences utilisateur pour le calcul de trajet"""
    user_id = models.CharField(max_length=100, unique=True)
    max_crowd_density = models.FloatField(default=0.7)  # 0-1
    avoid_main_roads = models.BooleanField(default=True)
    prefer_parks = models.BooleanField(default=True)
    noise_sensitivity = models.IntegerField(default=5)  # 1-10
    walking_speed = models.FloatField(default=1.4)  # m/s
    consider_public_transport = models.BooleanField(default=True)  # Proximité arrêts = +densité
    transport_factor = models.FloatField(default=0.15)  # Poids 0-1 pour le facteur transport
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'user_preferences'
    
    def __str__(self):
        return f"Prefs {self.user_id}"

class CalmZone(models.Model):
    """Zones calmes (parcs, bibliothèques, etc.)"""
    ZONE_TYPES = [
        ('park', 'Parc/Jardin'),
        ('library', 'Bibliothèque'),
        ('quiet_street', 'Rue calme'),
        ('cafe', 'Café tranquille'),
        ('monument', 'Monument/Place'),
    ]
    
    name = models.CharField(max_length=200)
    zone_type = models.CharField(max_length=50, choices=ZONE_TYPES)
    latitude = models.FloatField()
    longitude = models.FloatField()
    comfort_score = models.FloatField(default=0.8)  # 0-1
    capacity = models.IntegerField(null=True, blank=True)
    opening_hours = models.JSONField(default=dict, blank=True)
    
    class Meta:
        db_table = 'calm_zones'
    
    def __str__(self):
        return f"{self.name} ({self.get_zone_type_display()})"
    
    @property
    def location(self):
        return {'lat': self.latitude, 'lng': self.longitude}

class RouteRequest(models.Model):
    """Historique des demandes de trajet"""
    user_id = models.CharField(max_length=100, default='anonymous', db_index=True)
    origin_lat = models.FloatField()
    origin_lng = models.FloatField()
    destination_lat = models.FloatField()
    destination_lng = models.FloatField()
    calculated_route = models.JSONField(default=list, blank=True)
    instructions = models.JSONField(default=list, blank=True)  # Instructions étape par étape
    stress_score = models.FloatField(null=True, blank=True)
    distance = models.FloatField(null=True, blank=True)  # en mètres
    user_preferences = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'route_requests'
        indexes = [
            models.Index(fields=['created_at']),
        ]

class CrowdDataPoint(models.Model):
    """Point de données de densité de foule"""
    SOURCE_CHOICES = [
        ('sensor', 'Capteur'),
        ('prediction', 'Prédiction'),
        ('crowdsource', 'Crowdsourcing'),
        ('manual', 'Manuel'),
    ]
    
    latitude = models.FloatField()
    longitude = models.FloatField()
    density = models.FloatField()  # 0-1
    confidence = models.FloatField(default=0.8)  # Fiabilité 0-1
    source = models.CharField(max_length=50, choices=SOURCE_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'crowd_data_points'
        indexes = [
            models.Index(fields=['latitude', 'longitude']),
            models.Index(fields=['timestamp']),
        ]