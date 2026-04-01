import React, { useState } from 'react';
import { MapPin, ArrowDownUp, Crosshair, Zap, Lightbulb, Clock } from 'lucide-react';

const defaultOrigin = { street: '', city: 'Paris', postal_code: '75001' };
const defaultDestination = { street: '', city: 'Paris', postal_code: '75002' };

const RouteControls = ({ onCalculateRoute, userLocation, loading }) => {
  const [origin, setOrigin] = useState({ ...defaultOrigin });
  const [destination, setDestination] = useState({ ...defaultDestination });
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [targetHour, setTargetHour] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    onCalculateRoute(origin, destination, targetHour);
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation && userLocation) {
      // Utiliser la position GPS (format coordonnées pour l'API)
      setOrigin({ lat: userLocation.lat, lng: userLocation.lng });
      setUseCurrentLocation(true);
    } else {
      alert('Géolocalisation non disponible');
    }
  };

  const handleSwapLocations = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleQuickSelect = (type) => {
    const locations = {
      paris: {
        origin: { street: 'Place de la Bastille', city: 'Paris', postal_code: '75011' },
        destination: { street: 'Place de la République', city: 'Paris', postal_code: '75011' }
      },
      versailles: {
        origin: { street: 'Château de Versailles', city: 'Versailles', postal_code: '78000' },
        destination: { street: 'Place du Marché Notre-Dame', city: 'Versailles', postal_code: '78000' }
      },
      defense: {
        origin: { street: 'Grande Arche', city: 'Puteaux', postal_code: '92800' },
        destination: { street: 'Esplanade de la Défense', city: 'Puteaux', postal_code: '92800' }
      }
    };
    const loc = locations[type];
    setOrigin(loc.origin);
    setDestination(loc.destination);
  };

  const formatAddress = (addr) => {
    if (addr.lat !== undefined && addr.lng !== undefined) {
      return `Position actuelle (${addr.lat.toFixed(4)}, ${addr.lng.toFixed(4)})`;
    }
    const parts = [addr.street, addr.postal_code, addr.city].filter(Boolean);
    return parts.join(', ') || '—';
  };

  return (
    <div className="route-controls">
      <h2><MapPin size={18} /> Calculer un trajet</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="location-inputs">
          <div className="input-group">
            <label htmlFor="origin">Départ</label>
            {useCurrentLocation && origin.lat !== undefined ? (
              <div className="address-display">
                {formatAddress(origin)}
                <button type="button" className="link-btn" onClick={() => { setOrigin({ ...defaultOrigin }); setUseCurrentLocation(false); }}>
                  Changer pour adresse
                </button>
              </div>
            ) : (
              <div className="address-fields">
                <input
                  type="text"
                  value={origin.street || ''}
                  onChange={(e) => setOrigin({ ...origin, street: e.target.value })}
                  placeholder="Nom de rue"
                />
                <input
                  type="text"
                  value={origin.city || ''}
                  onChange={(e) => setOrigin({ ...origin, city: e.target.value })}
                  placeholder="Ville"
                  required
                />
                <input
                  type="text"
                  value={origin.postal_code || ''}
                  onChange={(e) => setOrigin({ ...origin, postal_code: e.target.value })}
                  placeholder="Code postal"
                />
              </div>
            )}
          </div>

          <div className="swap-button">
            <button type="button" onClick={handleSwapLocations} title="Inverser départ/arrivée">
              <ArrowDownUp size={18} />
            </button>
          </div>

          <div className="input-group">
            <label htmlFor="destination">Destination</label>
            {destination.lat !== undefined && destination.lng !== undefined ? (
              <div className="address-display">
                {formatAddress(destination)}
                <button type="button" className="link-btn" onClick={() => setDestination({ ...defaultDestination })}>
                  Changer pour adresse
                </button>
              </div>
            ) : (
              <div className="address-fields">
                <input
                  type="text"
                  value={destination.street || ''}
                  onChange={(e) => setDestination({ ...destination, street: e.target.value })}
                  placeholder="Nom de rue"
                />
                <input
                  type="text"
                  value={destination.city || ''}
                  onChange={(e) => setDestination({ ...destination, city: e.target.value })}
                  placeholder="Ville"
                  required
                />
                <input
                  type="text"
                  value={destination.postal_code || ''}
                  onChange={(e) => setDestination({ ...destination, postal_code: e.target.value })}
                  placeholder="Code postal"
                />
              </div>
            )}
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="targetHour">
            <Clock size={14} style={{ display: 'inline', marginRight: 4 }} />
            Heure prévue (prédiction densité)
          </label>
          <select
            id="targetHour"
            value={targetHour ?? ''}
            onChange={(e) => setTargetHour(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Maintenant</option>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>

        <div className="quick-actions">
          <button 
            type="button" 
            onClick={handleUseCurrentLocation}
            className="action-btn"
            disabled={!userLocation}
          >
            <Crosshair size={16} /> Utiliser ma position
          </button>
          
          <div className="quick-cities">
            <span>Trajets rapides:</span>
            <button type="button" onClick={() => handleQuickSelect('paris')}>Paris</button>
            <button type="button" onClick={() => handleQuickSelect('versailles')}>Versailles</button>
            <button type="button" onClick={() => handleQuickSelect('defense')}>La Défense</button>
          </div>
        </div>

        <button 
          type="submit" 
          className="calculate-btn"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Calcul en cours...
            </>
          ) : (
            <>
              <Zap size={16} /> Calculer le trajet zen
            </>
          )}
        </button>
      </form>

      <div className="tips">
        <h4><Lightbulb size={14} /> Conseils</h4>
        <ul>
          <li>Saisissez l'adresse (rue, ville, code postal) pour le départ et la destination</li>
          <li>Utilisez « Ma position » pour partir de votre localisation actuelle</li>
          <li>Le score de stress varie de 0 (calme) à 10 (stressant)</li>
        </ul>
      </div>
    </div>
  );
};

export default RouteControls;
