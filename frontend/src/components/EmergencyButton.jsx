import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, MapPin, FileText, Wind, Phone, RefreshCw } from 'lucide-react';

const BREATH_PHASES = [
  { key: 'in', label: 'Inspirez', seconds: 4 },
  { key: 'hold', label: 'Retenez', seconds: 4 },
  { key: 'out', label: 'Expirez', seconds: 6 },
];

const EmergencyButton = ({ userLocation, onStartRouteToZone }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [breath, setBreath] = useState({ idx: 0, remaining: BREATH_PHASES[0].seconds });
  const closeBtnRef = useRef(null);

  const handleEmergency = async () => {
    if (!userLocation) {
      alert('Position non disponible. Activez la géolocalisation.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await axios.get('/api/emergency/', {
        params: {
          lat: userLocation.lat,
          lng: userLocation.lng
        }
      });

      setResult(response.data);
      setShowModal(true);
    } catch (error) {
      console.error('Erreur urgence:', error);
      setResult({
        emergency: true,
        message: 'Erreur de connexion',
        alternative_advice: [
          'Essayez de vous calmer',
          'Cherchez un endroit assis',
          'Fermez les yeux et respirez profondément'
        ]
      });
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setResult(null);
  };

  const handleStartRoute = () => {
    if (!onStartRouteToZone) return;
    if (!result?.zone?.location) return;
    onStartRouteToZone(result.zone);
    closeModal();
  };

  useEffect(() => {
    if (!showModal) return;

    // Focus + escape to close
    closeBtnRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);

    // Prevent background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Reset + run breathing timer
    setBreath({ idx: 0, remaining: BREATH_PHASES[0].seconds });
    const interval = window.setInterval(() => {
      setBreath((s) => {
        if (s.remaining > 1) return { ...s, remaining: s.remaining - 1 };
        const nextIdx = (s.idx + 1) % BREATH_PHASES.length;
        return { idx: nextIdx, remaining: BREATH_PHASES[nextIdx].seconds };
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  const currentPhase = BREATH_PHASES[breath.idx];

  return (
    <>
      <button 
        onClick={handleEmergency}
        className="emergency-btn"
        disabled={loading}
        aria-label="Ouvrir le mode urgence"
      >
        {loading ? (
          <span className="spinner"></span>
        ) : (
          <>
            <span className="icon"><AlertCircle size={20} /></span>
            Mode Urgence
          </>
        )}
      </button>

      {showModal && result && (
        <div
          className="emergency-modal"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="modal-content emergency-dialog" role="dialog" aria-modal="true" aria-labelledby="emergency-title">
            <div className="modal-header">
              <h2 id="emergency-title"><AlertCircle size={20} /> Assistance immédiate</h2>
              <button ref={closeBtnRef} onClick={closeModal} className="close-btn" aria-label="Fermer">×</button>
            </div>
            
            <div className="modal-body">
              <div className="emergency-hero">
                <div className="hero-icon"><AlertCircle size={22} /></div>
                <div className="hero-text">
                  <h3>Respirez. On s’occupe du reste.</h3>
                  <p>Vous pouvez lancer un itinéraire vers une zone calme en 1 clic.</p>
                </div>
              </div>

              <div className="emergency-stepper" aria-label="Étapes">
                <div className="step-pill active">
                  <span className="step-dot" />
                  <span>Respiration</span>
                </div>
                <div className={`step-pill ${result.zone ? 'active' : ''}`}>
                  <span className="step-dot" />
                  <span>Zone calme</span>
                </div>
                <div className={`step-pill ${result.zone?.location && typeof onStartRouteToZone === 'function' ? 'active' : ''}`}>
                  <span className="step-dot" />
                  <span>Itinéraire</span>
                </div>
              </div>

              <div className={`breathing-widget phase-${currentPhase.key}`} style={{ '--breath-duration': `${currentPhase.seconds}s` }}>
                <div className="breathing-circle" aria-hidden="true" />
                <div className="breathing-status">
                  <div className="breathing-label"><Wind size={16} /> {currentPhase.label}</div>
                  <div className="breathing-sub">Encore {breath.remaining}s</div>
                </div>
              </div>

              {result.zone ? (
                <div className="emergency-zone">
                  <div className="emergency-zone-head">
                    <div className="emergency-zone-title">
                      <div className="zone-name">{result.zone.name}</div>
                      <div className="zone-chips">
                        <span className="zone-chip">{result.zone.type_display || result.zone.type}</span>
                        <span className="zone-chip good">Confort {Math.round(result.zone.comfort_score * 100)}%</span>
                      </div>
                    </div>

                    {result.zone?.location && typeof onStartRouteToZone === 'function' && (
                      <button onClick={handleStartRoute} className="btn-route btn-route-inline">
                        <MapPin size={16} /> Itinéraire
                      </button>
                    )}
                  </div>

                  <div className="emergency-zone-stats">
                    <div className="stat">
                      <span className="k">Distance</span>
                      <span className="v">{result.zone.distance} m</span>
                    </div>
                    <div className="stat">
                      <span className="k">Temps</span>
                      <span className="v">{result.zone.estimated_walk_time} min</span>
                    </div>
                    <div className="stat">
                      <span className="k">Direction</span>
                      <span className="v">{result.zone.direction}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="emergency-zone empty">
                  <div className="empty-title"><AlertCircle size={16} /> Aucune zone calme proche</div>
                  <div className="empty-sub">Voici des alternatives simples, tout de suite.</div>
                </div>
              )}

              <div className="emergency-instructions">
                <h3><FileText size={16} /> Instructions</h3>
                <ul>
                  {(result.instructions || result.alternative_advice || []).map((instruction, index) => (
                    <li key={index}>{instruction}</li>
                  ))}
                </ul>
              </div>

              <div className="emergency-contacts">
                <h3><Phone size={16} /> Contacts utiles</h3>
                <div className="contacts-list">
                  <div className="contact-item">
                    <strong>SOS Phobie :</strong> 01 45 67 89 10
                  </div>
                  <div className="contact-item">
                    <strong>Urgences médicales :</strong> 112
                  </div>
                  <div className="contact-item">
                    <strong>Écoute anxieux :</strong> 08 92 70 12 38
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={closeModal} className="btn-close">
                Fermer
              </button>
              <button onClick={handleEmergency} className="btn-refresh">
                <RefreshCw size={16} /> Rechercher à nouveau
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EmergencyButton;