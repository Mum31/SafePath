from django.urls import path
from . import views
from . import auth_views
from . import chatbot

urlpatterns = [
    path('auth/register/', auth_views.RegisterView.as_view(), name='auth_register'),
    path('auth/login/', auth_views.LoginView.as_view(), name='auth_login'),
    path('auth/refresh/', auth_views.RefreshTokenView.as_view(), name='auth_refresh'),
    path('auth/me/', auth_views.MeView.as_view(), name='auth_me'),
    path('test/', views.test_api, name='test_api'),
    path('health/', views.health_check, name='health_check'),
    path('geocode/', views.geocode_search_view, name='geocode_search'),
    path('reverse-geocode/', views.reverse_geocode_view, name='reverse_geocode'),
    path('calculate-route/', views.CalculateRouteView.as_view(), name='calculate_route'),
    path('user-preferences/', views.UserPreferencesView.as_view(), name='user_preferences'),
    path('calm-zones/', views.CalmZonesView.as_view(), name='calm_zones'),
    path('emergency/', views.EmergencyView.as_view(), name='emergency'),
    path('zones/', views.ZonesListView.as_view(), name='zones_list'),
    path('density-prediction/', views.DensityPredictionView.as_view(), name='density_prediction'),
    path('chatbot/', chatbot.ChatbotView.as_view(), name='chatbot'),
]
