import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Map, Route, Compass, Search, Radio, ChevronRight, ScanSearch, BarChart2, CalendarCheck } from 'lucide-react';
import '../App.css';
import jwtLogo from '../assets/brands/jwt.svg';
import openStreetMapLogo from '../assets/brands/openstreetmap.svg';
import leafletLogo from '../assets/brands/leaflet.png';
import openWeatherLogo from '../assets/brands/openweather.svg';
import tomTomLogo from '../assets/brands/tomtom.png';
import googleMapsLogo from '../assets/brands/google-maps.webp';
import idfmNavitiaLogo from '../assets/brands/idfm-navitia.svg';
import { LANDING_SPOTLIGHTS } from '../data/landingSpotlights';
import CarouselSpotlights from '../components/CarouselSpotlights';
import { getCategoryFallbackImage } from '../utils/spotlightImage';

const LOGO_ROW = [
  { key: 'jwt', src: jwtLogo, alt: 'JWT' },
  { key: 'osm', src: openStreetMapLogo, alt: 'OpenStreetMap' },
  { key: 'leaflet', src: leafletLogo, alt: 'Leaflet' },
  { key: 'ow', src: openWeatherLogo, alt: 'OpenWeather' },
  { key: 'tomtom', src: tomTomLogo, alt: 'TomTom' },
  { key: 'gmaps', src: googleMapsLogo, alt: 'Google Maps' },
  { key: 'navitia', src: idfmNavitiaLogo, alt: 'Navitia' },
];

const CATEGORIES = [
  {
    key: 'museum',
    label: 'Musées & culture',
    desc: 'Louvre, Orsay, Pompidou…',
    image: getCategoryFallbackImage('museum'),
    link: '/exploration?cat=museum',
  },
  {
    key: 'monument',
    label: 'Monuments',
    desc: 'Eiffel, Notre-Dame, Versailles…',
    image: getCategoryFallbackImage('monument'),
    link: '/exploration?cat=monument',
  },
  {
    key: 'urban',
    label: 'Centres-villes',
    desc: 'Bastille, Marais, La Défense…',
    image: getCategoryFallbackImage('urban'),
    link: '/exploration?cat=urban',
  },
  {
    key: 'explore',
    label: 'Explorer la carte',
    desc: 'Tous les lieux en Île-de-France',
    image: getCategoryFallbackImage('explore'),
    link: '/exploration',
  },
];

const HOW_STEPS = [
  {
    icon: ScanSearch,
    title: 'Recherchez',
    desc: 'Entrez un lieu, un quartier ou une adresse en Île-de-France.',
  },
  {
    icon: BarChart2,
    title: "Vérifiez l'affluence",
    desc: 'Consultez la densité en temps réel avant de vous déplacer.',
  },
  {
    icon: CalendarCheck,
    title: 'Planifiez',
    desc: "Choisissez le bon créneau et profitez d'une visite sans attente.",
  },
];

function CategoryCard({ cat }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <Link to={cat.link} className="cat-card">
      {!imgFailed ? (
        <img
          src={cat.image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="cat-card-img"
        />
      ) : (
        <div className="cat-card-placeholder" />
      )}
      <div className="cat-card-overlay" />
      <div className="cat-card-content">
        <span className="cat-card-label">{cat.label}</span>
        <span className="cat-card-desc">{cat.desc}</span>
      </div>
    </Link>
  );
}

function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [spotlights, setSpotlights] = useState(() =>
    LANDING_SPOTLIGHTS.map((L) => ({ ...L, density: null, loading: true, error: false }))
  );
  const liveReadyCount = spotlights.filter((s) => !s.loading && !s.error && typeof s.density === 'number').length;
  const calmCount = spotlights.filter((s) => !s.loading && !s.error && typeof s.density === 'number' && s.density < 0.35).length;

  useEffect(() => {
    let cancelled = false;
    const loadDensities = async () => {
      const results = await Promise.all(
        LANDING_SPOTLIGHTS.map(async (spot) => {
          try {
            const { data } = await axios.get('/api/density-prediction/', {
              params: { lat: spot.lat, lng: spot.lng },
              timeout: 12000,
            });
            return { id: spot.id, density: data.density ?? 0.5, ok: true };
          } catch {
            return { id: spot.id, density: null, ok: false };
          }
        })
      );
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      setSpotlights((prev) =>
        prev.map((row) => {
          const r = byId[row.id];
          if (!r) return { ...row, loading: false };
          return { ...row, density: r.ok ? r.density : null, loading: false, error: !r.ok };
        })
      );
    };
    loadDensities();
    const id = window.setInterval(loadDensities, 90_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) window.location.href = `/exploration?q=${encodeURIComponent(searchQuery.trim())}`;
    else window.location.href = '/exploration';
  };

  return (
    <div className="landing-page landing-page-affluence">

      {/* ── Hero ── */}
      <section className="landing-hero landing-hero-affluence">
        <div className="landing-hero-bg landing-hero-bg-image" aria-hidden="true">
          <video
            className="landing-hero-video"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          >
            <source src="/videos/landing-hero.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="landing-hero-overlay" aria-hidden="true" />
        <div className="landing-hero-inner landing-hero-affluence-stack">
          <div className="hero-affluence-copy hero-affluence-enter">
            <p className="hero-affluence-kicker">
              <Radio size={14} strokeWidth={2.5} aria-hidden />
              Affluence en temps réel · Île-de-France
            </p>
            <h1 className="landing-hero-title hero-title-white hero-title-affluence">
              Vivez la ville sans la foule.
            </h1>
            <p className="hero-lead-white hero-lead-affluence">
              Le bon moment pour passer — avant de vous déplacer.
            </p>
          </div>

          <form className="hero-search-bar hero-search-bar-wide hero-search-enter" onSubmit={handleSearch}>
            <Search size={22} className="hero-search-icon" />
            <input
              type="text"
              placeholder="Tour Eiffel, Bastille, Versailles…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="hero-search-input"
              aria-label="Rechercher un lieu"
            />
            <button type="submit" className="btn btn-primary hero-search-btn">
              Rechercher
            </button>
          </form>

          <div className="hero-affluence-metrics hero-search-enter" aria-label="Repères rapides">
            <div className="hero-affluence-metric">
              <strong>{LANDING_SPOTLIGHTS.length}</strong>
              <span>Lieux suivis</span>
            </div>
            <div className="hero-affluence-metric">
              <strong>{liveReadyCount ? calmCount : '--'}</strong>
              <span>Zones calmes maintenant</span>
            </div>
            <div className="hero-affluence-metric">
              <strong>90s</strong>
              <span>Actualisation</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Carousel sélection live ── */}
      <section className="landing-affluence-section landing-spotlights" aria-labelledby="section-selection">
        <div className="landing-container landing-container-wide">
          <div className="spotlights-header">
            <span className="spotlights-eyebrow">Sélection live</span>
            <h2 id="section-selection" className="spotlights-title">Notre sélection</h2>
            <p className="spotlights-sub">
              Lieux emblématiques d'Île-de-France avec leur affluence en temps réel.
            </p>
          </div>
          <CarouselSpotlights spotlights={spotlights} />
        </div>
      </section>

      {/* ── Catégories ── */}
      <section className="landing-affluence-section landing-cat-section" aria-labelledby="section-categories">
        <div className="landing-container landing-container-wide">
          <div className="spotlights-header spotlights-header--left">
            <span className="spotlights-eyebrow">Explorer par type</span>
            <h2 id="section-categories" className="spotlights-title">Nos catégories d'établissements</h2>
          </div>
          <div className="cat-grid">
            {CATEGORIES.map((cat) => <CategoryCard key={cat.key} cat={cat} />)}
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="landing-affluence-section landing-how-section" aria-labelledby="section-how">
        <div className="landing-container">
          <div className="spotlights-header">
            <span className="spotlights-eyebrow">Simple & rapide</span>
            <h2 id="section-how" className="spotlights-title">Comment ça marche ?</h2>
          </div>
          <div className="how-steps">
            {HOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="how-step">
                  <div className="how-step-num">{i + 1}</div>
                  <div className="how-step-icon"><Icon size={28} strokeWidth={1.8} /></div>
                  <h3 className="how-step-title">{step.title}</h3>
                  <p className="how-step-desc">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Tagline ── */}
      <section className="landing-tagline-strip landing-tagline-minimal">
        <div className="landing-container">
          <p className="tagline-strip-text">
            Moins d'attente, plus de <span className="tagline-accent">calme</span>.
          </p>
        </div>
      </section>

      {/* ── Logos partenaires ── */}
      <section className="landing-logos-strip" aria-label="Partenaires techniques">
        <div className="landing-container">
          <div className="landing-logos-row">
            {LOGO_ROW.map((item) => (
              <img key={item.key} src={item.src} alt="" title={item.alt} className="landing-logo-chip" loading="lazy" />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="landing-section landing-cta">
        <div className="landing-container">
          <div className="landing-cta-box landing-cta-compact">
            <h2 className="landing-cta-title">Ouvrir la carte</h2>
            <p className="landing-cta-text">Île-de-France — gratuit.</p>
            <div className="landing-cta-buttons">
              <Link to="/exploration" className="btn btn-primary btn-lg">
                <Compass size={20} /> Explorer
              </Link>
              <Link to="/trajet" className="btn btn-outline btn-lg">
                <Route size={20} /> Trajet
                <ChevronRight size={18} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LandingPage;
