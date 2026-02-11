import React, { useState, useEffect } from 'react';
import { Settings, Leaf, Scale, Zap, Bus } from 'lucide-react';

const StressFilters = ({ preferences, onPreferencesChange }) => {
  const [localPrefs, setLocalPrefs] = useState(preferences);

  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences]);

  const handleChange = (key, value) => {
    const updated = { ...localPrefs, [key]: value };
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
      transportFactor: 0.15
    },
    balanced: {
      maxDensity: 0.7,
      avoidMainRoads: true,
      preferParks: false,
      noiseSensitivity: 5,
      walkingSpeed: 1.4,
      considerPublicTransport: true,
      transportFactor: 0.15
    },
    efficient: {
      maxDensity: 0.9,
      avoidMainRoads: false,
      preferParks: false,
      noiseSensitivity: 7,
      walkingSpeed: 1.6,
      considerPublicTransport: false,
      transportFactor: 0.1
    }
  };

  const applyPreset = (presetName) => {
    setLocalPrefs(presets[presetName]);
    onPreferencesChange(presets[presetName]);
  };

  return (
    <div className="stress-filters">
      <h2>⚙️ Préférences de trajet</h2>
      
      <div className="presets">
        <h4>Préréglages :</h4>
        <div className="preset-buttons">
          <button 
            onClick={() => applyPreset('relaxed')}
            className={`preset-btn ${JSON.stringify(localPrefs) === JSON.stringify(presets.relaxed) ? 'active' : ''}`}
          >
            <Leaf size={14} /> Relaxé
          </button>
          <button 
            onClick={() => applyPreset('balanced')}
            className={`preset-btn ${JSON.stringify(localPrefs) === JSON.stringify(presets.balanced) ? 'active' : ''}`}
          >
            <Scale size={14} /> Équilibré
          </button>
          <button 
            onClick={() => applyPreset('efficient')}
            className={`preset-btn ${JSON.stringify(localPrefs) === JSON.stringify(presets.efficient) ? 'active' : ''}`}
          >
            <Zap size={14} /> Efficace
          </button>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-header">
          <label>Densité maximale acceptée</label>
          <span className="filter-value">{Math.round(localPrefs.maxDensity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={localPrefs.maxDensity}
          onChange={(e) => handleSliderChange('maxDensity', e.target.value)}
          className="slider"
        />
        <div className="slider-labels">
          <span>Très faible</span>
          <span>Moyenne</span>
          <span>Élevée</span>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-header">
          <label>Sensibilité au bruit</label>
          <span className="filter-value">{localPrefs.noiseSensitivity}/10</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          step="1"
          value={localPrefs.noiseSensitivity}
          onChange={(e) => handleSliderChange('noiseSensitivity', e.target.value)}
          className="slider"
        />
        <div className="slider-labels">
          <span>Peu sensible</span>
          <span>Très sensible</span>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-header">
          <label>Vitesse de marche</label>
          <span className="filter-value">{localPrefs.walkingSpeed} m/s</span>
        </div>
        <input
          type="range"
          min="0.8"
          max="2.0"
          step="0.1"
          value={localPrefs.walkingSpeed}
          onChange={(e) => handleSliderChange('walkingSpeed', e.target.value)}
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
            Éviter les grands axes
          </label>
          <span className="toggle-description">Privilégie les rues secondaires</span>
        </div>

        <div className="toggle-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={localPrefs.preferParks}
              onChange={() => handleToggle('preferParks')}
            />
            <span className="toggle-slider"></span>
            Privilégier les parcs
          </label>
          <span className="toggle-description">Inclut les espaces verts quand possible</span>
        </div>
      </div>

      <div className="filter-summary">
        <h4>Résumé de vos préférences</h4>
        <ul>
          <li>Densité max: {Math.round(localPrefs.maxDensity * 100)}% de foule</li>
          <li>Sensibilité bruit: {localPrefs.noiseSensitivity}/10</li>
          <li>Vitesse: {localPrefs.walkingSpeed} m/s</li>
          <li>{localPrefs.avoidMainRoads ? 'Oui' : 'Non'} — Évite les grands axes</li>
          <li>{localPrefs.preferParks ? 'Oui' : 'Non'} — Privilégie les parcs</li>
          <li>{localPrefs.considerPublicTransport ? 'Oui' : 'Non'} — Facteur transport</li>
        </ul>
      </div>
    </div>
  );
};

export default StressFilters;