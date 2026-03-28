import React, { useEffect, useState } from 'react';
import { Bus, Leaf, Scale, Zap } from 'lucide-react';

const DEFAULT_FILTERS = {
  maxDensity: 0.7,
  avoidMainRoads: true,
  preferParks: true,
  noiseSensitivity: 5,
  walkingSpeed: 1.4,
  considerPublicTransport: true,
  transportFactor: 0.15,
};

const normalisePreferences = (preferences = {}) => ({
  ...DEFAULT_FILTERS,
  ...preferences,
  maxDensity: Number.isFinite(Number(preferences.maxDensity))
    ? Number(preferences.maxDensity)
    : DEFAULT_FILTERS.maxDensity,
  noiseSensitivity: Number.isFinite(Number(preferences.noiseSensitivity))
    ? Number(preferences.noiseSensitivity)
    : DEFAULT_FILTERS.noiseSensitivity,
  walkingSpeed: Number.isFinite(Number(preferences.walkingSpeed))
    ? Number(preferences.walkingSpeed)
    : DEFAULT_FILTERS.walkingSpeed,
  transportFactor: Number.isFinite(Number(preferences.transportFactor))
    ? Number(preferences.transportFactor)
    : DEFAULT_FILTERS.transportFactor,
});

const StressFilters = ({ preferences, onPreferencesChange }) => {
  const [localPrefs, setLocalPrefs] = useState(() => normalisePreferences(preferences));

  useEffect(() => {
    setLocalPrefs(normalisePreferences(preferences));
  }, [preferences]);

  const handleChange = (key, value) => {
    const updated = normalisePreferences({ ...localPrefs, [key]: value });
    setLocalPrefs(updated);
    onPreferencesChange(updated);
  };

  const handleSliderChange = (key, value) => {
    handleChange(key, parseFloat(value));
  };

  const handleToggle = (key) => {
    handleChange(key, !localPrefs[key]);
  };

  const presets = {
    relaxed: {
      maxDensity: 0.4,
      avoidMainRoads: true,
      preferParks: true,
      noiseSensitivity: 3,
      walkingSpeed: 1.2,
      considerPublicTransport: true,
      transportFactor: 0.1,
    },
    balanced: {
      maxDensity: 0.7,
      avoidMainRoads: true,
      preferParks: false,
      noiseSensitivity: 5,
      walkingSpeed: 1.4,
      considerPublicTransport: true,
      transportFactor: 0.15,
    },
    efficient: {
      maxDensity: 0.9,
      avoidMainRoads: false,
      preferParks: false,
      noiseSensitivity: 7,
      walkingSpeed: 1.6,
      considerPublicTransport: false,
      transportFactor: 0.1,
    },
  };

  const applyPreset = (presetName) => {
    const preset = normalisePreferences(presets[presetName]);
    setLocalPrefs(preset);
    onPreferencesChange(preset);
  };

  return (
    <div className="stress-filters">
      <h2>Preferences de trajet</h2>

      <div className="presets">
        <h4>Prereglages :</h4>
        <div className="preset-buttons">
          <button
            type="button"
            onClick={() => applyPreset('relaxed')}
            className={`preset-btn ${
              JSON.stringify(localPrefs) === JSON.stringify(normalisePreferences(presets.relaxed)) ? 'active' : ''
            }`}
          >
            <Leaf size={14} /> Relaxe
          </button>
          <button
            type="button"
            onClick={() => applyPreset('balanced')}
            className={`preset-btn ${
              JSON.stringify(localPrefs) === JSON.stringify(normalisePreferences(presets.balanced)) ? 'active' : ''
            }`}
          >
            <Scale size={14} /> Equilibre
          </button>
          <button
            type="button"
            onClick={() => applyPreset('efficient')}
            className={`preset-btn ${
              JSON.stringify(localPrefs) === JSON.stringify(normalisePreferences(presets.efficient)) ? 'active' : ''
            }`}
          >
            <Zap size={14} /> Efficace
          </button>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-header">
          <label>Densite maximale acceptee</label>
          <span className="filter-value">{Math.round(localPrefs.maxDensity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={localPrefs.maxDensity}
          onChange={(event) => handleSliderChange('maxDensity', event.target.value)}
          className="slider"
        />
        <div className="slider-labels">
          <span>Tres faible</span>
          <span>Moyenne</span>
          <span>Elevee</span>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-header">
          <label>Sensibilite au bruit</label>
          <span className="filter-value">{localPrefs.noiseSensitivity}/10</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          step="1"
          value={localPrefs.noiseSensitivity}
          onChange={(event) => handleSliderChange('noiseSensitivity', event.target.value)}
          className="slider"
        />
        <div className="slider-labels">
          <span>Peu sensible</span>
          <span>Tres sensible</span>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-header">
          <label>Vitesse de marche</label>
          <span className="filter-value">{localPrefs.walkingSpeed.toFixed(1)} m/s</span>
        </div>
        <input
          type="range"
          min="0.8"
          max="2.0"
          step="0.1"
          value={localPrefs.walkingSpeed}
          onChange={(event) => handleSliderChange('walkingSpeed', event.target.value)}
          className="slider"
        />
        <div className="slider-labels">
          <span>Lent</span>
          <span>Rapide</span>
        </div>
      </div>

      <div className="toggle-filters">
        <div className="toggle-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={localPrefs.avoidMainRoads}
              onChange={() => handleToggle('avoidMainRoads')}
            />
            <span className="toggle-slider"></span>
            Eviter les grands axes
          </label>
          <span className="toggle-description">Privilegie les rues secondaires</span>
        </div>

        <div className="toggle-item">
          <label className="toggle-label">
            <input type="checkbox" checked={localPrefs.preferParks} onChange={() => handleToggle('preferParks')} />
            <span className="toggle-slider"></span>
            Privilegier les parcs
          </label>
          <span className="toggle-description">Inclut les espaces verts quand possible</span>
        </div>

        <div className="toggle-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={localPrefs.considerPublicTransport}
              onChange={() => handleToggle('considerPublicTransport')}
            />
            <span className="toggle-slider"></span>
            Prendre en compte les stations
          </label>
          <span className="toggle-description">
            Majore legerement la densite autour des hubs de transport
          </span>
        </div>
      </div>

      {localPrefs.considerPublicTransport && (
        <div className="filter-group">
          <div className="filter-header">
            <label className="filter-label-inline">
              <Bus size={14} /> Impact du transport
            </label>
            <span className="filter-value">{Math.round(localPrefs.transportFactor * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="0.5"
            step="0.05"
            value={localPrefs.transportFactor}
            onChange={(event) => handleSliderChange('transportFactor', event.target.value)}
            className="slider"
          />
          <div className="slider-labels">
            <span>Faible</span>
            <span>Fort</span>
          </div>
        </div>
      )}

      <div className="filter-summary">
        <h4>Resume de vos preferences</h4>
        <ul>
          <li>Densite max: {Math.round(localPrefs.maxDensity * 100)}% de foule</li>
          <li>Sensibilite bruit: {localPrefs.noiseSensitivity}/10</li>
          <li>Vitesse: {localPrefs.walkingSpeed.toFixed(1)} m/s</li>
          <li>{localPrefs.avoidMainRoads ? 'Oui' : 'Non'} - Evite les grands axes</li>
          <li>{localPrefs.preferParks ? 'Oui' : 'Non'} - Privilegie les parcs</li>
          <li>
            {localPrefs.considerPublicTransport ? 'Oui' : 'Non'} - Tient compte des stations
            {localPrefs.considerPublicTransport ? ` (${Math.round(localPrefs.transportFactor * 100)}%)` : ''}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default StressFilters;
