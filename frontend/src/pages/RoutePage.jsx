import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Route, MapPin, BarChart3, Ruler, Clock, Map, Download, RotateCcw, CheckCircle, Sparkles } from 'lucide-react';
import MapComponent from '../components/MapComponent';
import RouteForm, { CITIES } from '../components/RouteForm';
import StressFilters from '../components/StressFilters';
import EmergencyButton from '../components/EmergencyButton';
import ApiStatus from '../components/ApiStatus';
import '../App.css';

const RoutePage = () => {
  const [route, setRoute] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [apiStatus, setApiStatus] = useState('Vérification...');
  const [calmZones, setCalmZones] = useState([]);
  const [densityData, setDensityData] = useState([]);
  const [selectedCity, setSelectedCity] = useState('paris');
  const [userPreferences, setUserPreferences] = useState({
    maxDensity: 0.7,
    avoidMainRoads: true,
    preferParks: true,
    noiseSensitivity: 5,
    walkingSpeed: 1.4,
    considerPublicTransport: true,
    transportFactor: 0.15,
  });
  const [userId] = useState(() => `user_${Date.now()}`);
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
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
      const res = await axios.get('/api/user-preferences/', { params: { user_id: userId } });
      if (res.data.user_id) {
        setUserPreferences({
          maxDensity: res.data.max_crowd_density,
          avoidMainRoads: res.data.avoid_main_roads,
          preferParks: res.data.prefer_parks,
          noiseSensitivity: res.data.noise_sensitivity,
          walkingSpeed: res.data.walking_speed,
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
        transport_factor: prefs.transportFactor ?? 0.15,
      });
    } catch {}
  };

  const fetchCalmZones = async () => {
    try {
      const res = await axios.get('/api/calm-zones/');
      setCalmZones(res.data.calm_zones || []);
    } catch {}
  };

  const handleCalculateRoute = async (origin, destination, targetHour = null) => {
    setRouteError(null);
    setLoading(true);
    try {
      const payload = { origin, destination, user_id: userId, preferences: userPreferences };
      if (targetHour != null) payload.target_hour = targetHour;
      const res = await axios.post('/api/calculate-route/', payload);
      const data = res?.data;
      if (!data || !data.route) {
        setRouteError('Réponse API invalide. Réessayez.');
        return;
      }
      const routeData = data.route;
      const path = Array.isArray(routeData.path) ? routeData.path : [];
      const densityDataList = Array.isArray(routeData.density_data) ? routeData.density_data : [];
      setRoute({ ...routeData, path });
      setRouteMetadata(data.metadata || null);
      setDensityData(densityDataList);
      setShowRouteDetails(true);
      setRouteHistory((prev) => [
        { id: Date.now(), origin, destination, stress: routeData.total_stress ?? 0, distance: routeData.distance ?? 0, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 4),
      ]);
      saveUserPreferences(userPreferences);
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Impossible de calculer le trajet';
      setRouteError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreferencesChange = (newPrefs) => setUserPreferences(newPrefs);

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
    setRouteError(null);
    setShowRouteDetails(false);
  };

  const exportGpx = () => {
    if (!route?.path?.length) return;
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="SafePath">',
      '  <trk><name>SafePath - Trajet zen</name><trkseg>',
      ...route.path.map(([lng, lat]) => `    <trkpt lat="${lat}" lon="${lng}"></trkpt>`),
      '  </trkseg></trk></gpx>',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safe-path-${Date.now()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="route-page">
      <div className="route-page-body">
      <main className="route-page-main">
        <div className="route-tagline-strip">
          <p className="route-tagline-text">Calculez votre <span className="route-tagline-accent">trajet zen</span> en un clic</p>
        </div>
        <div className="route-form-wrap">
          <RouteForm
            onCalculateRoute={handleCalculateRoute}
            userLocation={userLocation}
            loading={loading}
            selectedCity={selectedCity}
            onCityChange={setSelectedCity}
            error={routeError}
            onClearError={() => setRouteError(null)}
          />
        </div>

        <div className="route-map-wrap">
          <MapComponent route={route} userLocation={userLocation} densityData={densityData} />
        </div>

        {route && (
          <section className="route-results">
            <div className="route-results-header">
              <h2><BarChart3 size={20} /> Résultats du trajet</h2>
              {routeMetadata?.routing === 'OSRM' && <span className="route-badge">OSRM</span>}
              <div className="route-results-actions">
                <button type="button" className="route-btn" onClick={() => setShowRouteDetails(!showRouteDetails)}>
                  {showRouteDetails ? 'Masquer détails' : 'Détails'}
                </button>
                <button type="button" className="route-btn" onClick={exportGpx}><Download size={14} /> GPX</button>
                <button type="button" className="route-btn route-btn-outline" onClick={handleReset}>
                  <RotateCcw size={14} /> Nouveau trajet
                </button>
              </div>
            </div>
            <div className="route-metrics">
              <div className="route-metric route-metric-stress">
                <BarChart3 size={22} />
                <div>
                  <span className="route-metric-label">Score de stress</span>
                  <span className="route-metric-value">{(route.total_stress ?? 0).toFixed(1)}/10</span>
                  <div className="route-stress-bar"><div className="route-stress-fill" style={{ width: `${(route.total_stress ?? 0) * 10}%` }} /></div>
                </div>
              </div>
              <div className="route-metric">
                <Ruler size={22} />
                <div>
                  <span className="route-metric-label">Distance</span>
                  <span className="route-metric-value">{route.distance ?? 0} m</span>
                </div>
              </div>
              <div className="route-metric">
                <Clock size={22} />
                <div>
                  <span className="route-metric-label">Temps estimé</span>
                  <span className="route-metric-value">{route.estimated_time ?? 0} min</span>
                </div>
              </div>
            </div>
            <div className="reco-ia-section">
              <div className="reco-ia-badge"><Sparkles size={18} /> Recommandation IA</div>
              <p className="reco-ia-desc">Trajet calme et sécurisé selon la densité et vos préférences.</p>
            </div>
            <div className="comparateur-section">
              <div className="comparateur-cards">
                <div className="comparateur-card trajet-rapide">
                  <span className="comparateur-label">Trajet rapide</span>
                  <span className="comparateur-time">{Math.max(1, Math.round((route.estimated_time ?? 0) * 0.7))} min</span>
                </div>
                <div className="comparateur-card trajet-serein active">
                  <span className="comparateur-reco-ia"><Sparkles size={12} /> Recommandation</span>
                  <span className="comparateur-time">{route.estimated_time ?? 0} min</span>
                </div>
              </div>
              <div className="trajet-waypoints">
                <h4>Détails</h4>
                <ul>
                  {route.calm_zones?.slice(0, 3).map((z, i) => (
                    <li key={i}><MapPin size={14} /> {z.name}</li>
                  ))}
                  {(!route.calm_zones?.length && route.instructions?.length) ? route.instructions.slice(0, 4).map((inst, i) => (
                    <li key={i}>{formatManeuver(inst.type, inst.modifier)} — {Math.round(inst.distance)} m</li>
                  )) : null}
                  {(!route.calm_zones?.length && !route.instructions?.length) && <li>Itinéraire piéton</li>}
                </ul>
              </div>
            </div>
            {showRouteDetails && (
              <div className="details-section">
                {densityData.length > 0 && (
                  <div className="detail-card">
                    <h3><BarChart3 size={16} /> Densité</h3>
                    <p>Moyenne: {Math.round(densityData.reduce((s, p) => s + (p.density ?? 0), 0) / densityData.length * 100)}%</p>
                  </div>
                )}
                <div className="detail-card">
                  <h3><MapPin size={16} /> Points du chemin</h3>
                  <div className="path-points">
                    {(Array.isArray(route.path) ? route.path.slice(0, 10) : []).map((point, i) => {
                      const pathLen = route.path?.length ?? 0;
                      const isFirst = i === 0;
                      const isLast = pathLen <= 10 ? i === pathLen - 1 : i === 9;
                      const label = isFirst ? 'Départ' : isLast ? 'Arrivée' : `Point ${i}`;
                      const coords = Array.isArray(point) ? [Number(point[0]).toFixed(5), Number(point[1]).toFixed(5)] : ['?', '?'];
                      return (
                        <div key={i} className="path-point">
                          {label} — [{coords[0]}, {coords[1]}]
                        </div>
                      );
                    })}
                    {Array.isArray(route.path) && route.path.length > 10 && (
                      <div className="path-point">… et {route.path.length - 10} points</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {!route && (
          <section className="route-welcome">
            <Map size={40} className="route-welcome-icon" />
            <h2>Calculez votre trajet zen</h2>
            <p>Indiquez le départ et l&apos;arrivée puis cliquez sur GO. Le trajet recommandé tient compte de la densité et des zones calmes.</p>
            <ul className="features-list">
              <li><CheckCircle size={16} /> Recommandation IA calme et sécurisée</li>
              <li><CheckCircle size={16} /> Routage piéton OSRM</li>
              <li><CheckCircle size={16} /> Export GPX</li>
            </ul>
          </section>
        )}
      </main>

      <aside className="route-sidebar">
        <StressFilters preferences={userPreferences} onPreferencesChange={handlePreferencesChange} />
        {routeHistory.length > 0 && (
          <div className="history-card">
            <h3><Route size={16} /> Historique</h3>
            {routeHistory.slice(0, 3).map((item) => (
              <div key={item.id} className="history-item">
                <span>{item.time}</span>
                <span className={`stress-badge ${item.stress < 4 ? 'low' : item.stress < 7 ? 'medium' : 'high'}`}>{item.stress.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
        <ApiStatus status={apiStatus} />
      </aside>
      </div>

      <EmergencyButton
        userLocation={userLocation}
        onStartRouteToZone={(zone) => {
          if (!userLocation?.lat || !zone?.location) return;
          handleCalculateRoute(
            { lat: userLocation.lat, lng: userLocation.lng },
            { lat: zone.location.lat, lng: zone.location.lng }
          );
        }}
      />
    </div>
  );
};

export default RoutePage;
