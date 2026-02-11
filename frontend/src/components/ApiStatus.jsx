import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ApiStatus = ({ status: propStatus }) => {
  const [status, setStatus] = useState(propStatus || 'Vérification...');

  useEffect(() => {
    if (propStatus !== undefined) {
      setStatus(propStatus);
      return;
    }
    const checkApi = async () => {
      try {
        await axios.get('/api/test/');
        setStatus('API connectée');
      } catch (error) {
        setStatus('API non connectée');
      }
    };
    checkApi();
  }, [propStatus]);

  const isOnline = status.includes('connectée') && !status.includes('non');

  return (
    <div className="api-status">
      <h3>Statut API</h3>
      <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
        <span className="status-dot"></span>
        <span className="status-text">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
      </div>
      <p className="status-message">{status}</p>
    </div>
  );
};

export default ApiStatus;
