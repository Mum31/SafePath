import React, { useState } from 'react';
import axios from 'axios';
import { AlertCircle, MapPin, FileText, Wind, Phone, RefreshCw } from 'lucide-react';

const EmergencyButton = ({ userLocation }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);

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

  return (
    <>
      <button 
        onClick={handleEmergency}
        className="emergency-btn"
        disabled={loading}
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
        <div className="emergency-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2><AlertCircle size={20} /> Assistance immédiate</h2>
              <button onClick={closeModal} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="emergency-alert">
                <div className="alert-icon"><AlertCircle size={24} /></div>
                <div className="alert-message">
                  <h3>Restez calme</h3>
                  <p>Prenez une grande respiration et suivez ces instructions</p>
                </div>
              </div>

              {result.zone ? (
                <div className="zone-found">
                  <h3>📍 Zone calme trouvée</h3>
                  <div className="zone-details">
                    <div className="zone-name">
                      <strong>{result.zone.name}</strong>
                      <span className="zone-type">{result.zone.type_display || result.zone.type}</span>
                    </div>
                    <div className="zone-info">
                      <div className="info-item">
                        <span className="label">Distance :</span>
                        <span className="value">{result.zone.distance} m</span>
                      </div>
                      <div className="info-item">
                        <span className="label">Temps de marche :</span>
                        <span className="value">{result.zone.estimated_walk_time} min</span>
                      </div>
                      <div className="info-item">
                        <span className="label">Direction :</span>
                        <span className="value">{result.zone.direction}</span>
                      </div>
                      <div className="info-item">
                        <span className="label">Niveau de confort :</span>
                        <span className="value">{Math.round(result.zone.comfort_score * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="zone-not-found">
                  <h3><AlertCircle size={16} /> Aucune zone calme proche</h3>
                  <p>Voici des alternatives :</p>
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

              <div className="breathing-exercise">
                <h3><Wind size={16} /> Exercice de respiration</h3>
                <div className="breathing-guide">
                  <div className="breath-step">
                    <div className="step-icon"><Wind size={20} /></div>
                    <div className="step-text">Inspirez profondément pendant 4 secondes</div>
                  </div>
                  <div className="breath-step">
                    <div className="step-icon">⏸️</div>
                    <div className="step-text">Retenez votre souffle pendant 4 secondes</div>
                  </div>
                  <div className="breath-step">
                    <div className="step-icon"><Wind size={20} /></div>
                    <div className="step-text">Expirez lentement pendant 6 secondes</div>
                  </div>
                </div>
                <p className="breathing-tip">Répétez 5 fois pour réduire l'anxiété</p>
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
                J'ai compris
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