import React, { useState } from 'react';
import { MapPin, ArrowDownUp, Crosshair, Clock, ChevronRight } from 'lucide-react';

const CITIES = [
  { id: 'paris', name: 'Paris', postalCode: '75001' },
  { id: 'lyon', name: 'Lyon', postalCode: '69001' },
  { id: 'marseille', name: 'Marseille', postalCode: '13001' },
];

export default function RouteForm({
  onCalculateRoute,
  userLocation,
  loading,
  selectedCity,
  onCityChange,
  error,
  onClearError,
}) {
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [useMyPosition, setUseMyPosition] = useState(false);
  const [showHour, setShowHour] = useState(false);
  const [targetHour, setTargetHour] = useState(null);

  const city = CITIES.find((c) => c.id === selectedCity) || CITIES[0];

  const buildOrigin = () => {
    if (useMyPosition && userLocation) {
      return { lat: userLocation.lat, lng: userLocation.lng };
    }
    const street = depart.trim() || city.name;
    return { street, city: city.name, postal_code: city.postalCode };
  };

  const buildDestination = () => {
    const street = arrivee.trim() || city.name;
    return { street, city: city.name, postal_code: city.postalCode };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onClearError?.();
    const origin = buildOrigin();
    const dest = buildDestination();
    if (!arrivee.trim()) return;
    if (!useMyPosition && !depart.trim()) return;
    onCalculateRoute(origin, dest, targetHour);
  };

  const handleSwap = () => {
    const prevDep = useMyPosition ? '' : depart;
    setDepart(arrivee);
    setArrivee(prevDep);
    setUseMyPosition(false);
  };

  const handleUseMyPosition = () => {
    setUseMyPosition(true);
    setDepart('Ma position');
    if (!userLocation) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => setDepart('Ma position'),
          () => setDepart('')
        );
      }
    }
  };

  const canSubmit = (useMyPosition || depart.trim()) && arrivee.trim() && !loading;

  return (
    <div className="route-form-card">
      <h2 className="route-form-title">On va où ?</h2>
      <form onSubmit={handleSubmit} className="route-form">
        <div className="route-form-fields">
          <div className="route-field">
            <label htmlFor="depart">Départ</label>
            {useMyPosition ? (
              <div className="route-field-display">
                <span>Ma position</span>
                <button type="button" className="route-field-link" onClick={() => { setUseMyPosition(false); setDepart(''); }}>
                  Changer
                </button>
              </div>
            ) : (
              <input
                id="depart"
                type="text"
                value={depart}
                onChange={(e) => setDepart(e.target.value)}
                placeholder="Lieu ou adresse"
                autoComplete="off"
              />
            )}
          </div>
          <button type="button" className="route-swap-btn" onClick={handleSwap} title="Inverser">
            <ArrowDownUp size={20} />
          </button>
          <div className="route-field">
            <label htmlFor="arrivee">Arrivée</label>
            <input
              id="arrivee"
              type="text"
              value={arrivee}
              onChange={(e) => setArrivee(e.target.value)}
              placeholder="Lieu ou adresse"
              autoComplete="off"
              required
            />
          </div>
        </div>
        <button type="button" className="route-now-link" onClick={() => setShowHour(!showHour)}>
          {showHour ? 'Masquer l\'heure' : 'Maintenant'}
          <ChevronRight size={16} className={showHour ? 'rotated' : ''} />
        </button>
        {showHour && (
          <div className="route-hour-row">
            <Clock size={16} />
            <select
              value={targetHour ?? ''}
              onChange={(e) => setTargetHour(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="route-hour-select"
            >
              <option value="">Maintenant</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        )}
        {error && <div className="route-form-error" role="alert">{error}</div>}
        <div className="route-form-actions">
          <button type="button" className="route-my-position" onClick={handleUseMyPosition} disabled={!userLocation}>
            <Crosshair size={16} /> Utiliser ma position
          </button>
          <button type="submit" className="route-go-btn" disabled={!canSubmit}>
            {loading ? <span className="route-go-spinner" /> : 'GO'}
          </button>
        </div>
      </form>
    </div>
  );
}

export { CITIES };
