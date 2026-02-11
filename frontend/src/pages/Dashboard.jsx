import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  TrendingUp, Clock, MapPin, BarChart3, Activity, 
  AlertCircle, RefreshCw, Layers, MapPinned 
} from 'lucide-react';
import MapComponent from '../components/MapComponent';
import './Dashboard.css';

const ZONES_FALLBACK = [
  { id: 'paris', label: 'Paris' },
  { id: 'lyon', label: 'Lyon' },
  { id: 'marseille', label: 'Marseille' },
  { id: 'bordeaux', label: 'Bordeaux' },
  { id: 'toulouse', label: 'Toulouse' },
  { id: 'nantes', label: 'Nantes' },
  { id: 'lille', label: 'Lille' },
  { id: 'strasbourg', label: 'Strasbourg' },
];

const Dashboard = () => {
  const [zones, setZones] = useState(ZONES_FALLBACK);
  const [predictions, setPredictions] = useState([]);
  const [zoneLabel, setZoneLabel] = useState('Paris');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [predictionForHour, setPredictionForHour] = useState(new Date().getHours());
  const [sourceDescription, setSourceDescription] = useState('');
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gridSize, setGridSize] = useState(5);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedZone, setSelectedZone] = useState('paris');

  useEffect(() => {
    axios.get('/api/zones/').then((res) => {
      if (res.data?.zones?.length) setZones(res.data.zones);
    }).catch(() => {});
  }, []);

  const fetchPredictions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/density-prediction/', {
        params: { zone: selectedZone, hour: selectedHour, grid: gridSize }
      });
      setPredictions(res.data.predictions || []);
      setZoneLabel(res.data.zone_label || zones.find(z => z.id === selectedZone)?.label || selectedZone);
      setUpdatedAt(res.data.updated_at || null);
      setPredictionForHour(res.data.prediction_for_hour ?? res.data.hour ?? selectedHour);
      setSourceDescription(res.data.source || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de chargement des prédictions');
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, [selectedHour, gridSize, selectedZone]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 48.8566, lng: 2.3522 })
      );
    } else {
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
    }
  }, []);

  const densityData = predictions.map(p => ({
    location: p.location,
    density: p.density,
    confidence: p.confidence || 0.7
  }));

  const avgDensity = predictions.length
    ? predictions.reduce((s, p) => s + p.density, 0) / predictions.length
    : 0;
  const maxDensity = predictions.length ? Math.max(...predictions.map(p => p.density)) : 0;

  const getDensityLevel = (d) => {
    if (d < 0.3) return { label: 'Faible', color: 'var(--color-success)' };
    if (d < 0.6) return { label: 'Moyenne', color: 'var(--color-warning)' };
    return { label: 'Élevée', color: 'var(--color-danger)' };
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1><Activity size={28} /> Cartographie prédictive</h1>
          <p>Densité probable par zone et horaire — pour choisir l’itinéraire le moins dense et planifier vos déplacements</p>
        </div>
      </div>

      <div className="dashboard-controls">
        <div className="control-group control-zone">
          <label><MapPinned size={16} /> Ville</label>
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="zone-select"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label><Clock size={16} /> Heure cible</label>
          <div className="hour-selector">
            <input
              type="range"
              min="0"
              max="23"
              value={selectedHour}
              onChange={(e) => setSelectedHour(parseInt(e.target.value))}
              className="hour-slider"
            />
            <span className="hour-value">{String(selectedHour).padStart(2, '0')}:00</span>
          </div>
        </div>
        <div className="control-group">
          <label><Layers size={16} /> Grille</label>
          <select 
            value={gridSize} 
            onChange={(e) => setGridSize(parseInt(e.target.value))}
            className="grid-select"
          >
            <option value="3">3×3</option>
            <option value="5">5×5</option>
            <option value="7">7×7</option>
            <option value="10">10×10</option>
          </select>
        </div>
        <button onClick={fetchPredictions} className="refresh-btn" disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Actualiser
        </button>
      </div>
      <p className="dashboard-prediction-info">
        <strong>Prédiction pour {String(predictionForHour).padStart(2, '0')}h</strong>
        {sourceDescription && <> — {sourceDescription}</>}
        {updatedAt && <> · Maj. {new Date(updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>}
      </p>

      {error && (
        <div className="dashboard-error">
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div className="dashboard-kpis">
        <div className="kpi-card kpi-main">
          <div className="kpi-icon"><TrendingUp size={24} /></div>
          <div className="kpi-content">
            <span className="kpi-label">Densité moyenne</span>
            <span className="kpi-value">{Math.round(avgDensity * 100)}%</span>
            <div className="kpi-bar">
              <div 
                className="kpi-bar-fill" 
                style={{ 
                  width: `${avgDensity * 100}%`,
                  backgroundColor: getDensityLevel(avgDensity).color
                }}
              />
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><BarChart3 size={24} /></div>
          <div className="kpi-content">
            <span className="kpi-label">Point max</span>
            <span className="kpi-value">{Math.round(maxDensity * 100)}%</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><MapPin size={24} /></div>
          <div className="kpi-content">
            <span className="kpi-label">Zones analysées</span>
            <span className="kpi-value">{predictions.length}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-map">
          <h3><MapPin size={18} /> Carte thermique — {zoneLabel} — Prédiction {String(predictionForHour).padStart(2, '0')}h</h3>
          <MapComponent 
            route={null}
            userLocation={userLocation}
            densityData={densityData}
          />
        </div>

        <div className="dashboard-predictions">
          <h3><BarChart3 size={18} /> Prédictions pour {String(predictionForHour).padStart(2, '0')}h — {zoneLabel}</h3>
          <div className="predictions-list">
            {loading ? (
              <div className="predictions-loading">Chargement...</div>
            ) : predictions.length === 0 ? (
              <div className="predictions-empty">Aucune donnée</div>
            ) : (
              predictions.map((p, i) => {
                const level = getDensityLevel(p.density);
                const sectorLabel = p.zone_label || `${zoneLabel} — Secteur ${i + 1}`;
                return (
                  <div key={i} className="prediction-item">
                    <div 
                      className="prediction-bar"
                      style={{ 
                        width: `${p.density * 100}%`,
                        backgroundColor: level.color
                      }}
                    />
                    <div className="prediction-info">
                      <span className="prediction-zone-label">{sectorLabel}</span>
                      <span className="prediction-value">{Math.round(p.density * 100)}%</span>
                      <span className="prediction-level" style={{ color: level.color }}>{level.label}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-legend">
        <h4>Légende densité</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--color-success)' }} />
            <span>Faible (0-30%)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--color-warning)' }} />
            <span>Moyenne (31-60%)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--color-danger)' }} />
            <span>Élevée (61-100%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
