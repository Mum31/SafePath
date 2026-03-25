import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const ApiStatus = ({ status: propStatus }) => {
  const [status, setStatus] = useState(propStatus ?? 'Vérification...');
  const [checking, setChecking] = useState(false);

  const checkApi = useCallback(async () => {
    if (propStatus !== undefined) return;
    setChecking(true);
    try {
      await axios.get('/api/test/', { timeout: 5000 });
      setStatus('API connectée');
    } catch (err) {
      const msg = err.code === 'ECONNREFUSED' || err.message?.includes('Network')
        ? 'API non connectée. Démarrez le backend : cd backend && python manage.py runserver'
        : 'API non connectée';
      setStatus(msg);
    } finally {
      setChecking(false);
    }
  }, [propStatus]);

  useEffect(() => {
    if (propStatus !== undefined) {
      setStatus(propStatus);
      return;
    }
    checkApi();
  }, [propStatus, checkApi]);

  const isOnline = status.includes('connectée') && !status.includes('non');

  return (
    <div className="api-status">
      <h3>Statut API</h3>
      <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
        <span className="status-dot"></span>
        <span className="status-text">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
      </div>
      <p className="status-message">{status}</p>
      {!isOnline && propStatus === undefined && (
        <button type="button" className="api-status-retry" onClick={checkApi} disabled={checking}>
          {checking ? 'Vérification…' : 'Réessayer'}
        </button>
      )}
    </div>
  );
};

export default ApiStatus;
