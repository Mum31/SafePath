from django.urls import path
from . import views

urlpatterns = [
    path('test/', views.test_api, name='test_api'),
    path('health/', views.health_check, name='health_check'),
    path('geocode/', views.geocode_search_view, name='geocode_search'),
    path('calculate-route/', views.CalculateRouteView.as_view(), name='calculate_route'),
    path('user-preferences/', views.UserPreferencesView.as_view(), name='user_preferences'),
    path('calm-zones/', views.CalmZonesView.as_view(), name='calm_zones'),
    path('emergency/', views.EmergencyView.as_view(), name='emergency'),
    path('zones/', views.ZonesListView.as_view(), name='zones_list'),
    path('density-prediction/', views.DensityPredictionView.as_view(), name='density_prediction'),
]