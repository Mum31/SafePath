import React, { useState } from 'react';
import { ArrowDownUp, CalendarClock, Crosshair, Sparkles } from 'lucide-react';

export default function RouteForm({ onCalculateRoute, userLocation, loading, error, onClearError }) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [useMyPosition, setUseMyPosition] = useState(false);
  const [travelWhen, setTravelWhen] = useState('now');
  const [travelDatetime, setTravelDatetime] = useState('');

  const canSubmit = (useMyPosition || origin.trim()) && destination.trim() && !loading;

  const handleSubmit = (event) => {
    event.preventDefault();
    onClearError?.();
    onCalculateRoute(
      useMyPosition && userLocation ? { lat: userLocation.lat, lng: userLocation.lng, name: 'Ma position' } : { query: origin.trim() },
      { query: destination.trim() },
      travelWhen === 'planned' && travelDatetime ? { travel_datetime: travelDatetime } : {}
    );
  };

  return (
    <div className="route-form-card">
      <div className="journey-form-kicker"><Sparkles size={14} /> Itineraire</div>
      <h2 className="route-form-title">Calculer un trajet</h2>
      <p className="journey-form-help">Le plus simple : utilisez votre position puis indiquez votre destination.</p>
      <form onSubmit={handleSubmit} className="route-form">
        <div className="route-form-fields">
          <div className="route-field">
            <label htmlFor="route-origin">Depart</label>
            {useMyPosition ? (
              <div className="route-field-display"><span>Ma position actuelle</span><button type="button" className="route-field-link" onClick={() => { setUseMyPosition(false); setOrigin(''); }}>Changer</button></div>
            ) : (
              <input id="route-origin" type="text" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Adresse, gare ou lieu" autoComplete="off" />
            )}
          </div>
          <button type="button" className="route-swap-btn" onClick={() => { const previousOrigin = useMyPosition ? '' : origin; setOrigin(destination); setDestination(previousOrigin); setUseMyPosition(false); }} title="Inverser">
            <ArrowDownUp size={18} />
          </button>
          <div className="route-field">
            <label htmlFor="route-destination">Arrivee</label>
            <input id="route-destination" type="text" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Ex. Gare de Lyon, La Defense, Tour Eiffel" autoComplete="off" required />
          </div>
        </div>

        <div className="journey-planning-row">
          <div className="journey-planning-toggle">
            <button type="button" className={`journey-planning-btn ${travelWhen === 'now' ? 'active' : ''}`} onClick={() => setTravelWhen('now')}>Maintenant</button>
            <button type="button" className={`journey-planning-btn ${travelWhen === 'planned' ? 'active' : ''}`} onClick={() => setTravelWhen('planned')}><CalendarClock size={14} /> Planifier</button>
          </div>
          {travelWhen === 'planned' && (
            <input className="journey-datetime-input" type="datetime-local" value={travelDatetime} onChange={(event) => setTravelDatetime(event.target.value)} />
          )}
        </div>

        {error && <div className="route-form-error" role="alert">{error}</div>}

        <div className="route-form-actions">
          <button type="button" className="route-my-position" onClick={() => { setUseMyPosition(true); setOrigin('Ma position'); }} disabled={!userLocation}>
            <Crosshair size={16} /> Utiliser ma position
          </button>
          <button type="submit" className="route-go-btn" disabled={!canSubmit}>{loading ? <span className="route-go-spinner" /> : 'Voir les trajets'}</button>
        </div>
      </form>
    </div>
  );
}
