import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Home,
  LogIn,
  LogOut,
  Map,
  Menu,
  Moon,
  Route as RouteIcon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import axios from 'axios';

import AlertsBanner from './components/AlertsBanner';
import PlaceDetailErrorBoundary from './components/PlaceDetailErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import RoutePageErrorBoundary from './components/RoutePageErrorBoundary';
import SafePathChatbot from './components/SafePathChatbot';
import { useAuth } from './context/useAuth';
import './App.css';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import ExplorationPage from './pages/ExplorationPage';
import LandingPage from './pages/LandingPage';
import PlaceDetailPage from './pages/PlaceDetailPage';
import RoutePage from './pages/RoutePage';

function App() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [apiStatus, setApiStatus] = useState('Verification...');
  const [calmZones, setCalmZones] = useState([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('safepath-theme') === 'dark');
  const [alerts, setAlerts] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isHome = location.pathname === '/';
  const isAuthPage = location.pathname === '/auth';
  const isApiOnline = apiStatus.startsWith('API connect');

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);

    try {
      localStorage.setItem('safepath-theme', theme);
    } catch {
      // Ignore storage write failures.
    }
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;

    const loadHeaderData = async () => {
      try {
        await axios.get('/api/test/', { timeout: 5000 });
        if (!cancelled) {
          setApiStatus('API connectee');
        }
      } catch (error) {
        if (!cancelled) {
          setApiStatus(
            error.code === 'ECONNREFUSED' || error.message?.includes('Network')
              ? 'API hors ligne (demarrez le backend sur le port 8000)'
              : 'API non connectee'
          );
        }
      }

      try {
        const response = await axios.get('/api/calm-zones/');
        if (!cancelled) {
          setCalmZones(response.data.calm_zones || []);
        }
      } catch {
        if (!cancelled) {
          setCalmZones([]);
        }
      }
    };

    loadHeaderData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const dismissAlert = (id) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  const navLinks = [
    { to: '/', end: true, icon: Home, label: 'Accueil' },
    { to: '/exploration', end: false, icon: Map, label: 'Exploration' },
    { to: '/trajet', end: false, icon: RouteIcon, label: 'Itineraire' },
    { to: '/dashboard', end: false, icon: Activity, label: isAuthenticated ? 'Mon espace' : 'Dashboard' },
  ];

  return (
    <div className="app-container">
      <header
        className={`app-header ${scrolled ? 'header-scrolled' : ''} ${
          isHome && !scrolled ? 'header-over-hero' : ''
        }`}
      >
        <div className="header-inner">
          <Link to="/" className="header-brand">
            <img src="/logo-leaf.svg" alt="" className="header-brand-logo" />
            <div className="header-brand-text">
              <span className="header-brand-name">SafePath</span>
              <span className="header-brand-tagline">Sans stress</span>
            </div>
          </Link>

          <nav className={`main-nav ${mobileNavOpen ? 'nav-open' : ''}`} aria-label="Navigation principale">
            {navLinks.map((item) => {
              const NavItemIcon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <NavItemIcon size={18} aria-hidden />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
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
              <span className="header-meta-item" title="Zones calmes">
                {calmZones.length} zones
              </span>
              <span
                className={`header-meta-dot ${isApiOnline ? 'online' : 'offline'}`}
                title={apiStatus}
              />
            </div>

            {isAuthenticated ? (
              <div className="auth-chip">
                <span className="auth-chip-name">
                  <ShieldCheck size={16} /> {user?.username}
                </span>
                <button type="button" className="auth-chip-action" onClick={logout}>
                  <LogOut size={16} /> Deconnexion
                </button>
              </div>
            ) : (
              <Link to="/auth" className="auth-link-btn">
                <LogIn size={16} /> Connexion
              </Link>
            )}

            <button
              type="button"
              className="theme-toggle"
              onClick={() => setDarkMode((current) => !current)}
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
              onClick={() => setMobileNavOpen((current) => !current)}
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
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/exploration" element={<ExplorationPage />} />
          <Route
            path="/exploration/lieu"
            element={
              <PlaceDetailErrorBoundary>
                <PlaceDetailPage />
              </PlaceDetailErrorBoundary>
            }
          />
          <Route
            path="/trajet"
            element={
              <RoutePageErrorBoundary>
                <RoutePage />
              </RoutePageErrorBoundary>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>

      {!isAuthPage && <SafePathChatbot />}

      <nav className="bottom-nav" aria-label="Navigation mobile">
        <NavLink end to="/" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <Home size={22} />
          <span>Accueil</span>
        </NavLink>
        <NavLink to="/exploration" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <Map size={22} />
          <span>Exploration</span>
        </NavLink>
        <NavLink to="/trajet" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <RouteIcon size={22} />
          <span>Itineraire</span>
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <Activity size={22} />
          <span>{isAuthenticated ? 'Mon espace' : 'Dashboard'}</span>
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
              <p className="footer-tagline">
                Se deplacer en ville sans stress. Navigation zen et predictions d&apos;affluence.
              </p>
            </div>

            <div className="footer-col">
              <h4 className="footer-heading">Produit</h4>
              <ul className="footer-links">
                <li>
                  <Link to="/exploration">Exploration</Link>
                </li>
                <li>
                  <Link to="/trajet">Itineraire serein</Link>
                </li>
                <li>
                  <Link to="/dashboard">Dashboard</Link>
                </li>
                <li>
                  <a href="/api/test/" target="_blank" rel="noopener noreferrer">
                    API
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4 className="footer-heading">Ressources</h4>
              <ul className="footer-links">
                <li>
                  <a href="#" onClick={(event) => event.preventDefault()}>
                    A propos
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      alert('Contact: safepath.pfe@example.com');
                    }}
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#" onClick={(event) => event.preventDefault()}>
                    Documentation
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4 className="footer-heading">Legal</h4>
              <ul className="footer-links">
                <li>
                  <a href="#" onClick={(event) => event.preventDefault()}>
                    Mentions legales
                  </a>
                </li>
                <li>
                  <a href="#" onClick={(event) => event.preventDefault()}>
                    Confidentialite
                  </a>
                </li>
                <li>
                  <a href="#" onClick={(event) => event.preventDefault()}>
                    CGU
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copy">&copy; {new Date().getFullYear()} SafePath - PFE 2024. Tous droits reserves.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
