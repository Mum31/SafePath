import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { Map, Home, Route as RouteIcon, Activity, Moon, Sun, Menu, X } from 'lucide-react';
import ExplorationPage from './pages/ExplorationPage';
import PlaceDetailPage from './pages/PlaceDetailPage';
import LandingPage from './pages/LandingPage';
import RoutePage from './pages/RoutePage';
import RoutePageErrorBoundary from './components/RoutePageErrorBoundary';
import PlaceDetailErrorBoundary from './components/PlaceDetailErrorBoundary';
import Dashboard from './pages/Dashboard';
import AlertsBanner from './components/AlertsBanner';
import axios from 'axios';
import './App.css';

function App() {
  const [apiStatus, setApiStatus] = useState('Vérification...');
  const [calmZones, setCalmZones] = useState([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('safepath-theme') === 'dark');
  const [alerts, setAlerts] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Appliquer le thème au document et le persister
  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('safepath-theme', theme);
    } catch (e) {}
  }, [darkMode]);

  useEffect(() => {
    checkApiConnection();
    fetchCalmZones();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const checkApiConnection = async () => {
    try {
      await axios.get('/api/test/', { timeout: 5000 });
      setApiStatus('API connectée');
    } catch (err) {
      setApiStatus(
        err.code === 'ECONNREFUSED' || err.message?.includes('Network')
          ? 'API hors ligne (démarrez le backend sur le port 8000)'
          : 'API non connectée'
      );
    }
  };

  const fetchCalmZones = async () => {
    try {
      const response = await axios.get('/api/calm-zones/');
      setCalmZones(response.data.calm_zones || []);
    } catch {}
  };

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const navLinks = [
    { to: '/', end: true, icon: Home, label: 'Accueil' },
    { to: '/exploration', end: false, icon: Map, label: 'Exploration' },
    { to: '/trajet', end: false, icon: RouteIcon, label: 'Itinéraire' },
    { to: '/dashboard', end: false, icon: Activity, label: 'Dashboard' },
  ];

  const isHome = useLocation().pathname === '/';

  return (
    <div className="app-container">
        <header className={`app-header ${scrolled ? 'header-scrolled' : ''} ${isHome && !scrolled ? 'header-over-hero' : ''}`}>
          <div className="header-inner">
            <Link to="/" className="header-brand">
              <img src="/logo-leaf.svg" alt="" className="header-brand-logo" />
              <div className="header-brand-text">
                <span className="header-brand-name">SafePath</span>
                <span className="header-brand-tagline">Sans stress</span>
              </div>
            </Link>

            <nav className={`main-nav ${mobileNavOpen ? 'nav-open' : ''}`} aria-label="Navigation principale">
              {navLinks.map(({ to, end, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <Icon size={18} aria-hidden />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            {mobileNavOpen && (
              <button
                type="button"
                className="nav-backdrop"
                aria-label="Fermer le menu"
                onClick={() => setMobileNavOpen(false)}
              />
            )}

            <div className="header-actions">
              <div className="header-meta">
                <span className="header-meta-item" title="Zones calmes">{calmZones.length} zones</span>
                <span className={`header-meta-dot ${apiStatus.includes('connectée') && !apiStatus.includes('non') ? 'online' : 'offline'}`} title={apiStatus} />
              </div>
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Mode clair' : 'Mode sombre'}
                aria-label={darkMode ? 'Mode clair' : 'Mode sombre'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                type="button"
                className="header-menu-btn"
                aria-label="Menu"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
              >
                {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </header>

        <AlertsBanner alerts={alerts} onDismiss={dismissAlert} />

        <main className="app-main">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/exploration" element={<ExplorationPage />} />
            <Route path="/exploration/lieu" element={<PlaceDetailErrorBoundary><PlaceDetailPage /></PlaceDetailErrorBoundary>} />
            <Route path="/trajet" element={<RoutePageErrorBoundary><RoutePage /></RoutePageErrorBoundary>} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>

        <nav className="bottom-nav" aria-label="Navigation mobile">
          <NavLink end to="/" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
            <Home size={22} /><span>Accueil</span>
          </NavLink>
          <NavLink to="/exploration" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
            <Map size={22} /><span>Exploration</span>
          </NavLink>
          <NavLink to="/trajet" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
            <RouteIcon size={22} /><span>Itinéraire</span>
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
            <Activity size={22} /><span>Dashboard</span>
          </NavLink>
        </nav>

        <footer className="app-footer">
          <div className="footer-bar" />
          <div className="footer-inner">
            <div className="footer-grid">
              <div className="footer-col footer-brand">
                <Link to="/" className="footer-logo-link">
                  <img src="/logo-leaf.svg" alt="" className="footer-logo" />
                  <span className="footer-brand-name">SafePath</span>
                </Link>
                <p className="footer-tagline">Se déplacer en ville sans stress. Navigation zen et prédictions d’affluence.</p>
              </div>
              <div className="footer-col">
                <h4 className="footer-heading">Produit</h4>
                <ul className="footer-links">
                  <li><Link to="/exploration">Exploration</Link></li>
                  <li><Link to="/trajet">Itinéraire serein</Link></li>
                  <li><Link to="/dashboard">Dashboard</Link></li>
                  <li><a href="/api/test/" target="_blank" rel="noopener noreferrer">API</a></li>
                </ul>
              </div>
              <div className="footer-col">
                <h4 className="footer-heading">Ressources</h4>
                <ul className="footer-links">
                  <li><a href="#" onClick={(e) => { e.preventDefault(); }}>À propos</a></li>
                  <li><a href="#" onClick={(e) => { e.preventDefault(); alert('Contact: safepath.pfe@example.com'); }}>Contact</a></li>
                  <li><a href="#" onClick={(e) => e.preventDefault()}>Documentation</a></li>
                </ul>
              </div>
              <div className="footer-col">
                <h4 className="footer-heading">Légal</h4>
                <ul className="footer-links">
                  <li><a href="#" onClick={(e) => e.preventDefault()}>Mentions légales</a></li>
                  <li><a href="#" onClick={(e) => e.preventDefault()}>Confidentialité</a></li>
                  <li><a href="#" onClick={(e) => e.preventDefault()}>CGU</a></li>
                </ul>
              </div>
            </div>
            <div className="footer-bottom">
              <p className="footer-copy">© {new Date().getFullYear()} SafePath — PFE 2024. Tous droits réservés.</p>
            </div>
          </div>
        </footer>
      </div>
    );
}

export default App;
