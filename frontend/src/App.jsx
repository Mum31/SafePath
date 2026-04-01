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
import InfoPage from './pages/InfoPage';
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

  const infoPages = {
    about: {
      eyebrow: 'SafePath',
      title: 'A propos',
      intro:
        "SafePath aide a explorer la ville, reperer les zones calmes et choisir un trajet plus serein en combinant cartographie, signaux d'affluence et recommandations produit.",
      highlights: [
        { kicker: 'Mission', title: 'Reduire la charge mentale', text: 'Nous mettons en avant des trajets plus lisibles et des zones plus apaisantes.' },
        { kicker: 'Approche', title: 'Donnees locales utiles', text: "Le site rassemble des signaux d'affluence, des zones calmes et des vues cartographiques dans une interface simple." },
      ],
      sections: [
        {
          title: 'Ce que vous trouvez sur le site',
          items: [
            "Une page d'exploration pour visualiser des lieux et niveaux d'affluence.",
            'Un calculateur de trajet oriente vers le confort et la serenite.',
            'Un espace dashboard pour suivre vos habitudes et raccourcis utiles.',
          ],
        },
        {
          title: 'Pour qui',
          body: 'SafePath vise les personnes qui souhaitent se deplacer avec moins de stress, mieux anticiper les flux et privilegier des parcours plus apaises.',
        },
      ],
      actions: [
        { label: "Lancer l'exploration", to: '/exploration' },
        { label: 'Calculer un trajet', to: '/trajet', variant: 'secondary' },
      ],
    },
    contact: {
      eyebrow: 'Support',
      title: 'Contact',
      intro:
        "Une question sur le projet, un retour d'usage ou un signalement a partager ? Cette page centralise les moyens de nous joindre.",
      highlights: [
        { kicker: 'Email', title: 'safepath.pfe@example.com', text: 'Canal principal pour les questions produit et les retours fonctionnels.' },
        { kicker: 'Delai', title: 'Reponse sous 48h', text: 'Nous traitons en priorite les demandes bloquantes et les retours sur les liens ou la navigation.' },
      ],
      sections: [
        {
          title: 'Quand nous ecrire',
          items: [
            'Si un parcours, une page ou une interaction semble cassé.',
            "Si vous souhaitez proposer une amelioration de l'experience.",
            "Si vous avez besoin d'aide pour comprendre une fonctionnalite.",
          ],
        },
        {
          title: 'Informations utiles',
          body: "Pensez a inclure la page concernee, l'action effectuee et, si possible, une capture pour accelerer le diagnostic.",
        },
      ],
      actions: [
        {
          label: 'Envoyer un email',
          to: 'mailto:safepath.pfe@example.com',
          external: true,
        },
        { label: 'Retour accueil', to: '/', variant: 'secondary' },
      ],
    },
    documentation: {
      eyebrow: 'Guide',
      title: 'Documentation',
      intro:
        'Cette page resume les parcours principaux du site pour que les visiteurs sachent rapidement ou cliquer selon leur besoin.',
      highlights: [
        { kicker: 'Explorer', title: 'Carte et lieux', text: "Utilisez Exploration pour parcourir les points d'interet et ouvrir la fiche detail d'un lieu." },
        { kicker: 'Se deplacer', title: 'Trajet serein', text: 'Utilisez Trajet pour comparer des options de deplacement orientees confort.' },
      ],
      sections: [
        {
          title: 'Navigation rapide',
          items: [
            "Accueil pour comprendre l'offre SafePath et rejoindre les parcours principaux.",
            "Exploration pour rechercher un lieu et ouvrir sa fiche detaillee.",
            'Dashboard pour consulter un espace personnel une fois connecte.',
          ],
        },
        {
          title: 'API de test',
          body: "Le lien API du footer ouvre l'endpoint de verification afin de confirmer rapidement que le backend repond.",
        },
      ],
      actions: [
        { label: 'Ouvrir Exploration', to: '/exploration' },
        { label: 'Tester le trajet', to: '/trajet', variant: 'secondary' },
      ],
    },
    legalNotice: {
      eyebrow: 'Cadre legal',
      title: 'Mentions legales',
      intro:
        "Cette page presente les informations essentielles du projet SafePath dans le cadre d'une diffusion academique et de demonstration.",
      sections: [
        {
          title: 'Editeur du site',
          body: 'SafePath est presente comme un projet PFE dedie a la navigation sereine et a la visualisation de zones calmes.',
        },
        {
          title: 'Hebergement et exploitation',
          body: "Les modalites d'hebergement peuvent varier selon l'environnement de demonstration ou de developpement utilise.",
        },
        {
          title: 'Contact',
          body: 'Pour toute demande relative au contenu du site: safepath.pfe@example.com.',
        },
      ],
      actions: [
        { label: 'Nous contacter', to: '/contact' },
        { label: 'Confidentialite', to: '/confidentialite', variant: 'secondary' },
      ],
    },
    privacy: {
      eyebrow: 'Donnees',
      title: 'Confidentialite',
      intro:
        "Cette page resume les principes de confidentialite appliques a l'experience SafePath et a ses parcours de demonstration.",
      sections: [
        {
          title: 'Donnees de navigation',
          body: "Le site peut utiliser des informations de contexte strictement necessaires a l'affichage, comme la session ou certaines preferences locales.",
        },
        {
          title: 'Geolocalisation',
          body: "Lorsque la position est demandee, elle sert a proposer des trajets ou des zones calmes adaptes a l'utilisateur.",
        },
        {
          title: 'Bonnes pratiques',
          items: [
            'Ne partagez pas de donnees sensibles dans les champs libres.',
            'Utilisez les controles du navigateur pour gerer les permissions de localisation.',
            'Contactez le support si vous souhaitez signaler une inquietude liee a vos donnees.',
          ],
        },
      ],
      actions: [
        { label: 'Voir les CGU', to: '/cgu' },
        { label: 'Retour accueil', to: '/', variant: 'secondary' },
      ],
    },
    terms: {
      eyebrow: 'Conditions',
      title: "Conditions generales d'utilisation",
      intro:
        "Les fonctionnalites SafePath sont fournies a titre informatif pour aider a l'orientation et a la comparaison d'options de trajet.",
      sections: [
        {
          title: 'Usage attendu',
          items: [
            'Verifier les informations critiques avant tout deplacement important.',
            'Utiliser les recommandations comme aide a la decision et non comme garantie absolue.',
            "Respecter les regles locales, les consignes de securite et les donnees temps reel affichees par les operateurs.",
          ],
        },
        {
          title: 'Disponibilite',
          body: "Certaines donnees peuvent varier selon l'environnement, la connectivite ou la disponibilite des services associes.",
        },
      ],
      actions: [
        { label: 'Mentions legales', to: '/mentions-legales' },
        { label: 'Contact', to: '/contact', variant: 'secondary' },
      ],
    },
  };

  return (
    <div className="app-container">
      <header
        className={`app-header ${scrolled ? 'header-scrolled' : ''} ${
          isHome && !scrolled ? 'header-over-hero' : ''
        }`}
      >
        <div className="header-inner">
          <Link to="/" className="header-brand">
            <img src="/safepath-logo.png" alt="" className="header-brand-logo" width={42} height={42} />
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
          <Route path="/a-propos" element={<InfoPage {...infoPages.about} />} />
          <Route path="/contact" element={<InfoPage {...infoPages.contact} />} />
          <Route path="/documentation" element={<InfoPage {...infoPages.documentation} />} />
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
          <Route path="/mentions-legales" element={<InfoPage {...infoPages.legalNotice} />} />
          <Route path="/confidentialite" element={<InfoPage {...infoPages.privacy} />} />
          <Route path="/cgu" element={<InfoPage {...infoPages.terms} />} />
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
                <img src="/safepath-logo.png" alt="" className="footer-logo" width={36} height={36} />
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
                  <Link to="/a-propos">A propos</Link>
                </li>
                <li>
                  <Link to="/contact">Contact</Link>
                </li>
                <li>
                  <Link to="/documentation">Documentation</Link>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4 className="footer-heading">Legal</h4>
              <ul className="footer-links">
                <li>
                  <Link to="/mentions-legales">Mentions legales</Link>
                </li>
                <li>
                  <Link to="/confidentialite">Confidentialite</Link>
                </li>
                <li>
                  <Link to="/cgu">CGU</Link>
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
