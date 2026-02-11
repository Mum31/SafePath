import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Route, MapPin, BarChart3, Ruler, Clock, Map, Download, RotateCcw, CheckCircle, Lightbulb, Target } from 'lucide-react';
import MapComponent from '../components/MapComponent';
import RouteControls from '../components/RouteControls';
import StressFilters from '../components/StressFilters';
import EmergencyButton from '../components/EmergencyButton';
import ApiStatus from '../components/ApiStatus';
import '../App.css';

const RoutePage = () => {
  const [route, setRoute] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState('Vérification...');
  const [calmZones, setCalmZones] = useState([]);
  const [densityData, setDensityData] = useState([]);
  const [userPreferences, setUserPreferences] = useState({
    maxDensity: 0.7,
    avoidMainRoads: true,
    preferParks: true,
    noiseSensitivity: 5,
    walkingSpeed: 1.4,
    considerPublicTransport: true,
    transportFactor: 0.15
  });
  const [userId] = useState(`user_${Date.now()}`);
  const [routeHistory, setRouteHistory] = useState([]);
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [routeMetadata, setRouteMetadata] = useState(null);

  useEffect(() => {
    checkApiConnection();
    fetchCalmZones();
    getUserLocation();
    loadUserPreferences();
  }, []);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }),
        () => setUserLocation({ lat: 48.8566, lng: 2.3522 })
      );
    } else {
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
    }
  };

  const checkApiConnection = async () => {
    try {
      await axios.get('/api/test/');
      setApiStatus('API connectée');
    } catch {
      setApiStatus('API non connectée');
    }
  };

  const loadUserPreferences = async () => {
    try {
      const response = await axios.get('/api/user-preferences/', { params: { user_id: userId } });
      if (response.data.user_id) {
        setUserPreferences({
          maxDensity: response.data.max_crowd_density,
          avoidMainRoads: response.data.avoid_main_roads,
          preferParks: response.data.prefer_parks,
          noiseSensitivity: response.data.noise_sensitivity,
          walkingSpeed: response.data.walking_speed
        });
      }
    } catch {}
  };

  const saveUserPreferences = async (prefs) => {
    try {
      await axios.post('/api/user-preferences/', {
        user_id: userId,
        max_crowd_density: prefs.maxDensity,
        avoid_main_roads: prefs.avoidMainRoads,
        prefer_parks: prefs.preferParks,
        noise_sensitivity: prefs.noiseSensitivity,
        walking_speed: prefs.walkingSpeed,
        consider_public_transport: prefs.considerPublicTransport ?? true,
        transport_factor: prefs.transportFactor ?? 0.15
      });
    } catch {}
  };

  const fetchCalmZones = async () => {
    try {
      const response = await axios.get('/api/calm-zones/');
      setCalmZones(response.data.calm_zones || []);
    } catch {}
  };

  const handleCalculateRoute = async (origin, destination, targetHour = null) => {
    setLoading(true);
    try {
      const payload = { origin, destination, user_id: userId, preferences: userPreferences };
      if (targetHour !== null && targetHour !== undefined) payload.target_hour = targetHour;
      const response = await axios.post('/api/calculate-route/', payload);
      const routeData = response.data.route;
      setRoute(routeData);
      setRouteMetadata(response.data.metadata || null);
      setDensityData(routeData.density_data || []);
      setRouteHistory(prev => [{
        id: Date.now(),
        origin,
        destination,
        stress: routeData.total_stress,
        distance: routeData.distance,
        time: new Date().toLocaleTimeString()
      }, ...prev.slice(0, 4)]);
      saveUserPreferences(userPreferences);
    } catch (error) {
      alert(`Erreur: ${error.response?.data?.error || 'Impossible de calculer le trajet'}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePreferencesChange = (newPreferences) => {
    setUserPreferences(newPreferences);
  };

  const formatManeuver = (type, modifier) => {
    const modMap = { left: 'à gauche', right: 'à droite', slight_left: 'légèrement à gauche', slight_right: 'légèrement à droite', sharp_left: 'à gauche', sharp_right: 'à droite' };
    const mod = modMap[modifier] || modifier || '';
    if (type === 'depart') return 'Départ';
    if (type === 'arrive') return 'Arrivée';
    if (type === 'turn') return mod ? `Tourner ${mod}` : 'Tourner';
    if (type === 'continue') return 'Continuer tout droit';
    return type || 'Continuer';
  };

  const handleReset = () => {
    setRoute(null);
    setDensityData([]);
    setShowRouteDetails(false);
  };

  const exportRouteData = () => {
    if (!route) return;
    const blob = new Blob([JSON.stringify({ route, userPreferences, timestamp: new Date().toISOString(), calmZones }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safe-path-route-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert('Trajet exporté en JSON');
  };

  const exportGpx = () => {
    if (!route?.path?.length) return;
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="SafePath">',
      '  <trk><name>SafePath - Trajet zen</name><trkseg>'
    ];
    route.path.forEach(([lng, lat]) => {
      lines.push(`    <trkpt lat="${lat}" lon="${lng}"></trkpt>`);
    });
    lines.push('  </trkseg></trk></gpx>');
    const blob = new Blob([lines.join('\n')], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safe-path-${Date.now()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    alert('Trajet exporté en GPX');
  };

  return (
    <div className="main-content">
      <div className="sidebar">
        <RouteControls onCalculateRoute={handleCalculateRoute} userLocation={userLocation} loading={loading} />
        <StressFilters preferences={userPreferences} onPreferencesChange={handlePreferencesChange} />
        {routeHistory.length > 0 && (
          <div className="history-card">
            <h3><Route size={16} /> Historique récent</h3>
            <div className="history-list">
              {routeHistory.map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-time">{item.time}</div>
                  <div className="history-stress">
                    Stress: <span className={`stress-badge ${item.stress < 4 ? 'low' : item.stress < 7 ? 'medium' : 'high'}`}>{item.stress.toFixed(1)}</span>
                  </div>
                  <div className="history-distance">{item.distance}m</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="status-card">
          <ApiStatus status={apiStatus} />
        </div>
      </div>

      <div className="main-area">
        <div className="map-section">
          <MapComponent route={route} userLocation={userLocation} densityData={densityData} />
        </div>

        {route && (
          <div className="results-section">
            <div className="results-header">
              <h2><BarChart3 size={18} /> Résultats du trajet</h2>
              {routeMetadata?.routing === 'OSRM' && (
                <span className="routing-badge">Routage OSRM</span>
              )}
              <div className="result-actions">
                <button onClick={() => setShowRouteDetails(!showRouteDetails)} className="action-btn">
                  {showRouteDetails ? 'Masquer détails' : 'Afficher détails'}
                </button>
                <button onClick={exportRouteData} className="action-btn export">
                  <Download size={14} /> JSON
                </button>
                <button onClick={exportGpx} className="action-btn export">
                  <Download size={14} /> GPX
                </button>
                <button onClick={handleReset} className="action-btn reset">
                  <RotateCcw size={14} /> Nouveau trajet
                </button>
              </div>
            </div>

            <div className="metrics-grid">
              <div className="metric-card main-stress">
                <div className="metric-icon"><BarChart3 size={20} /></div>
                <div className="metric-content">
                  <div className="metric-label">Score de stress</div>
                  <div className="metric-value">{route.total_stress.toFixed(1)}/10</div>
                  <div className="stress-bar">
                    <div className="stress-fill" style={{ width: `${route.total_stress * 10}%` }} />
                  </div>
                  <div className="metric-description">
                    {route.total_stress < 3 ? 'Très calme' : route.total_stress < 6 ? 'Modérément stressant' : 'Très stressant'}
                  </div>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-icon"><Ruler size={20} /></div>
                <div className="metric-content">
                  <div className="metric-label">Distance</div>
                  <div className="metric-value">{route.distance} m</div>
                  <div className="metric-description">≈ {Math.round(route.distance / 1.4)} pas</div>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-icon"><Clock size={20} /></div>
                <div className="metric-content">
                  <div className="metric-label">Temps estimé</div>
                  <div className="metric-value">{route.estimated_time} min</div>
                  <div className="metric-description">à {userPreferences.walkingSpeed} m/s</div>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-icon"><MapPin size={20} /></div>
                <div className="metric-content">
                  <div className="metric-label">Points de passage</div>
                  <div className="metric-value">{route.path.length}</div>
                  <div className="metric-description">Segmenté en {route.path.length - 1} tronçons</div>
                </div>
              </div>
            </div>

            {showRouteDetails && (
              <div className="details-section">
                {route.calm_zones?.length > 0 && (
                  <div className="detail-card">
                    <h3><MapPin size={16} /> Zones calmes sur votre chemin</h3>
                    <div className="calm-zones-grid">
                      {route.calm_zones.map((zone, index) => (
                        <div key={index} className="calm-zone-card">
                          <div className="zone-header">
                            <span className="zone-name">{zone.name}</span>
                            <span className={`zone-type ${zone.type}`}>{zone.type}</span>
                          </div>
                          <div className="zone-details">
                            <div className="zone-distance">
                              <span className="label">Distance:</span>
                              <span className="value">{zone.distance} m</span>
                            </div>
                            <div className="zone-comfort">
                              <span className="label">Confort:</span>
                              <span className="value">{Math.round(zone.comfort_score * 100)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {densityData.length > 0 && (
                  <div className="detail-card prediction-highlight">
                    <h3><BarChart3 size={16} /> Prédictions de densité</h3>
                    <div className="density-info">
                      <div className="density-average">
                        <span className="label">Densité moyenne:</span>
                        <span className="value">
                          {Math.round(densityData.reduce((s, p) => s + p.density, 0) / densityData.length * 100)}%
                        </span>
                      </div>
                      <div className="density-max">
                        <span className="label">Point le plus dense:</span>
                        <span className="value">
                          {Math.round(Math.max(...densityData.map(p => p.density)) * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="density-legend">
                      <div className="legend-item"><span className="color low" /><span>Faible (0-30%)</span></div>
                      <div className="legend-item"><span className="color medium" /><span>Moyenne (31-60%)</span></div>
                      <div className="legend-item"><span className="color high" /><span>Élevée (61-100%)</span></div>
                    </div>
                  </div>
                )}

                <div className="detail-card">
                  <h3><MapPin size={16} /> Points du chemin</h3>
                  <div className="path-points">
                    {route.path.map((point, index) => (
                      <div key={index} className="path-point">
                        <div className="point-number">
                          {index === 0 ? <><MapPin size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Départ</> :
                            index === route.path.length - 1 ? <><Target size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Arrivée</> :
                            `Point ${index}`}
                        </div>
                        <div className="point-coords">[{point[0].toFixed(6)}, {point[1].toFixed(6)}]</div>
                        {densityData[index] && (
                          <div className="point-density">Densité: {Math.round(densityData[index].density * 100)}%</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!route && (
          <div className="welcome-section">
            <div className="welcome-content">
              <div className="welcome-icon"><Map size={48} /></div>
              <h2>Bienvenue sur SafePath</h2>
              <p>Calculez votre trajet piéton le plus zen en fonction de :</p>
              <ul className="features-list">
                <li><CheckCircle size={16} /> Densité de foule estimée</li>
                <li><CheckCircle size={16} /> Routage piéton réel (OSRM)</li>
                <li><CheckCircle size={16} /> Facteur transport en commun</li>
                <li><CheckCircle size={16} /> Zones calmes identifiées</li>
                <li><CheckCircle size={16} /> Export GPX pour navigation</li>
              </ul>
              <div className="welcome-tips">
                <h4><Lightbulb size={16} /> Pour commencer</h4>
                <ol>
                  <li>Entrez l'adresse de départ et d'arrivée</li>
                  <li>Ajustez vos préférences dans le panneau de gauche</li>
                  <li>Cliquez sur "Calculer le trajet zen"</li>
                  <li>Utilisez le bouton urgence en cas de besoin</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

      <EmergencyButton userLocation={userLocation} />
    </div>
  );
};

export default RoutePage;
