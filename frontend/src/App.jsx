import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Route as RouteIcon, Activity, Moon, Sun } from 'lucide-react';
import RoutePage from './pages/RoutePage';
import Dashboard from './pages/Dashboard';
import ApiStatus from './components/ApiStatus';
import axios from 'axios';
import './App.css';

function App() {
  const [apiStatus, setApiStatus] = useState('Vérification...');
  const [calmZones, setCalmZones] = useState([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('safepath-theme') === 'dark');

  useEffect(() => {
    checkApiConnection();
    fetchCalmZones();
  }, []);

  const checkApiConnection = async () => {
    try {
      await axios.get('/api/test/');
      setApiStatus('API connectée');
    } catch {
      setApiStatus('API non connectée');
    }
  };

  const fetchCalmZones = async () => {
    try {
      const response = await axios.get('/api/calm-zones/');
      setCalmZones(response.data.calm_zones || []);
    } catch {}
  };

  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="app-header">
          <div className="header-inner">
            <NavLink to="/" className="app-logo">
              <img src="/logo-leaf.svg" alt="" className="logo-img" />
              <div className="logo-text">
                <span className="logo-title">SafePath</span>
                <span className="logo-subtitle">Navigation zen pour espaces urbains</span>
              </div>
            </NavLink>

            <nav className="main-nav" aria-label="Navigation principale">
              <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <RouteIcon size={18} aria-hidden />
                <span>Calcul de trajet</span>
              </NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Activity size={18} aria-hidden />
                <span>Dashboard</span>
              </NavLink>
            </nav>

            <div className="header-actions">
              <div className="header-badges">
                <div className="header-badge" title="Zones calmes recensées">
                  <span className="badge-value">{calmZones.length}</span>
                  <span className="badge-label">Zones calmes</span>
                </div>
                <div 
                  className={`header-badge badge-status ${apiStatus.includes('connectée') && !apiStatus.includes('non') ? 'online' : 'offline'}`}
                  title="État de l'API"
                >
                  <span className="badge-dot" />
                  <span className="badge-value">
                    {apiStatus.includes('connectée') && !apiStatus.includes('non') ? 'En ligne' : 'Hors ligne'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Mode clair' : 'Mode sombre'}
                aria-label={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<RoutePage />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <div className="footer-inner">
            <div className="footer-top">
              <div className="footer-brand">
                <img src="/logo-leaf.svg" alt="" className="footer-logo" />
                <div>
                  <strong className="footer-name">SafePath</strong>
                  <p className="footer-tagline">Navigation adaptée aux personnes souffrant de phobie sociale</p>
                </div>
              </div>
              <div className="footer-nav">
                <span className="footer-nav-title">Liens</span>
                <a href="/api/test/" target="_blank" rel="noopener noreferrer">API</a>
                <a href="#" onClick={(e) => { e.preventDefault(); alert('Contact: safepath.pfe@example.com'); }}>Contact</a>
              </div>
              <div className="footer-tech">
                <span className="footer-nav-title">Stack</span>
                <div className="tech-tags">
                  <span className="tech-tag">React</span>
                  <span className="tech-tag">Django REST</span>
                  <span className="tech-tag">Mapbox GL</span>
                  <span className="tech-tag">ML</span>
                </div>
              </div>
            </div>
            <div className="footer-bottom">
              <p className="footer-legal">SafePath — PFE 2024</p>
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
