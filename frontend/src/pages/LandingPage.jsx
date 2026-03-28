import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  Map, Route, BarChart3, Shield, Heart, Wind, ArrowRight, Leaf, Compass,
  TrendingDown, Users, MapPin, Quote, ChevronRight, Sparkles, Search
} from 'lucide-react';
import '../App.css';
import jwtLogo from '../assets/brands/jwt.svg';
import openStreetMapLogo from '../assets/brands/openstreetmap.svg';
import leafletLogo from '../assets/brands/leaflet.png';
import openWeatherLogo from '../assets/brands/openweather.svg';
import tomTomLogo from '../assets/brands/tomtom.png';
import googleMapsLogo from '../assets/brands/google-maps.webp';
import idfmNavitiaLogo from '../assets/brands/idfm-navitia.svg';

const fadeInUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = (delay = 0.12) => ({
  visible: { transition: { staggerChildren: delay, delayChildren: 0.1 } },
  hidden: {},
});

function AnimatedNumber({ value, suffix = '', duration = 2 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  React.useEffect(() => {
    if (!isInView) return;
    const ctrl = animate(count, value, { duration, ease: 'easeOut' });
    return () => ctrl.stop();
  }, [isInView, value, duration, count]);
  return (
    <motion.span ref={ref}>
      <motion.span>{rounded}</motion.span>{suffix}
    </motion.span>
  );
}

const LandingPage = () => {
  const heroRef = useRef(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) window.location.href = `/exploration?q=${encodeURIComponent(searchQuery.trim())}`;
    else window.location.href = '/exploration';
  };

  /* Cartes hero type Affluences (2x2) */
  const heroCards = [
    {
      type: 'progress',
      label: 'Indice de sérénité',
      value: '7.5',
      unit: '/10',
      progress: 75,
      dots: [true, true, true, true, false],
    },
    {
      type: 'donut',
      label: 'Temps de marche',
      value: '18',
      unit: ' min',
      donutPercent: 60,
    },
    {
      type: 'crowd',
      label: 'Niveau de foule',
      level: 'Calme',
      color: 'calm',
      icons: true,
    },
    {
      type: 'capacity',
      label: 'Zones calmes',
      value: '12',
      unit: ' à proximité',
    },
  ];

  const features = [
    { icon: Map, title: 'Exploration zen', desc: 'Carte heatmap : bleu calme, orange dense. Explorez sans stress.', phrase: 'Voir avant de partir.' },
    { icon: Route, title: 'Recommandation IA de trajets calmes et sécurisés', desc: 'Trajet serein recommandé selon la densité, les zones calmes et vos préférences (parcs, rues apaisées).', phrase: 'Le chemin qui vous ressemble.' },
    { icon: BarChart3, title: 'Prédictions 6h', desc: 'Affluence prévue heure par heure. Planifiez au bon moment.', phrase: 'Anticipez, respirez.' },
    { icon: Shield, title: 'Mode urgence', desc: 'Zone calme la plus proche + itinéraire + respiration guidée.', phrase: 'Un clic pour vous recentrer.' },
  ];

  const steps = [
    { num: '1', title: 'Explorez', text: 'Consultez la densité en direct sur la carte. Filtrez : parcs, zones couvertes.' },
    { num: '2', title: 'Calculez', text: 'Saisissez départ et arrivée. Obtenez la recommandation IA : trajet calme et sécurisé adapté à vous.' },
    { num: '3', title: 'Marchez', text: 'Suivez l’itinéraire. Recevez des alertes si une zone se remplit. Export GPX.' },
  ];

  const why = [
    { icon: Heart, line: 'Réduire l’anxiété en milieu urbain.' },
    { icon: Users, line: 'Éviter les foules pour mieux respirer.' },
    { icon: MapPin, line: 'Découvrir les zones calmes autour de vous.' },
    { icon: TrendingDown, line: 'Prédire l’affluence pour planifier.' },
  ];

  const testimonial = {
    text: "En tant que personne anxieuse, savoir où ça bouge avant d’y aller change tout. SafePath m’aide à choisir le bon moment et le bon chemin.",
    author: "Utilisateur SafePath",
    role: "PFE 2024",
  };

  const faqs = [
    { q: "SafePath est-il gratuit ?", a: "Oui. L’application est gratuite. Nous utilisons des données ouvertes et des APIs temps réel." },
    { q: "Qu’est-ce que la recommandation IA de trajets calmes et sécurisés ?", a: "SafePath analyse la densité de foule, les zones calmes (parcs, rues apaisées) et vos préférences pour vous recommander un itinéraire piéton limitant le stress. Le trajet affiché est celui recommandé par notre algorithme." },
    { q: "Quelles villes sont couvertes ?", a: "Paris, Lyon, Marseille, Bordeaux, Toulouse, Nantes, Lille, Strasbourg. D’autres villes peuvent être ajoutées." },
    { q: "Comment est calculé l’indice de sérénité ?", a: "Nous croisons la densité de foule, le bruit estimé, la largeur des trottoirs et la proximité des parcs pour une note sur 10." },
  ];

  const integrations = [
    {
      key: 'jwt',
      label: 'JWT Auth',
      category: 'Authentification',
      detail: 'Connexion sécurisée et gestion des tokens.',
      logo: jwtLogo,
      alt: 'Logo JWT',
      logoClass: 'is-wide',
    },
    {
      key: 'osm',
      label: 'OpenStreetMap',
      category: 'Cartographie',
      detail: 'Fond de carte, geocodage et données ouvertes.',
      logo: openStreetMapLogo,
      alt: 'Logo OpenStreetMap',
      logoClass: 'is-wide',
    },
    {
      key: 'leaflet',
      label: 'Leaflet',
      category: 'Map UI',
      detail: 'Rendu interactif des cartes et heatmaps.',
      logo: leafletLogo,
      alt: 'Logo Leaflet',
      logoClass: 'is-standard',
    },
    {
      key: 'openweather',
      label: 'OpenWeather',
      category: 'Météo',
      detail: 'Contexte météo pour affiner la prédiction.',
      logo: openWeatherLogo,
      alt: 'Logo OpenWeather',
      logoClass: 'is-wide',
    },
    {
      key: 'tomtom',
      label: 'TomTom',
      category: 'Traffic',
      detail: 'Recherche d’adresses et signaux trafic.',
      logo: tomTomLogo,
      alt: 'Logo TomTom',
      logoClass: 'is-icon',
    },
    {
      key: 'googlemaps',
      label: 'Google Maps',
      category: 'Street View',
      detail: 'Panoramas et aperçus immersifs.',
      logo: googleMapsLogo,
      alt: 'Logo Google Maps',
      logoClass: 'is-icon',
    },
    {
      key: 'navitia',
      label: 'IDFM Navitia',
      category: 'Mobilité',
      detail: 'Trajets, lignes et perturbations temps réel.',
      logo: idfmNavitiaLogo,
      alt: 'Logo Île-de-France Mobilités',
      logoClass: 'is-wide',
    },
  ];

  return (
    <div className="landing-page">
      {/* ——— HERO style Affluences : fond image + overlay, 2 colonnes, barre recherche ——— */}
      <section className="landing-hero landing-hero-affluence" ref={heroRef}>
        <div className="landing-hero-bg landing-hero-bg-image" aria-hidden="true" />
        <div className="landing-hero-overlay" aria-hidden="true" />

        <div className="landing-hero-inner landing-hero-grid">
          <div className="hero-col hero-col-text">
            <motion.h1
              className="landing-hero-title hero-title-white"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              Découvrez l'affluence en ville en temps réel et trouvez votre trajet le plus zen.
            </motion.h1>
            <motion.p
              className="landing-hero-lead hero-lead-white"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              SafePath, l'application indispensable pour se déplacer sans stress.
            </motion.p>
          </div>

          <motion.div
            className="hero-col hero-col-cards"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <div className="hero-dashboard-grid">
              {heroCards.map((card, i) => (
                <div key={i} className="hero-dashboard-card">
                  {card.type === 'progress' && (
                    <>
                      <div className="hero-card-dots">
                        {(card.dots || []).map((filled, j) => (
                          <span key={j} className={filled ? 'filled' : ''} />
                        ))}
                      </div>
                      <span className="hero-card-badge">{card.value}{card.unit}</span>
                      <span className="hero-card-label">{card.label}</span>
                    </>
                  )}
                  {card.type === 'donut' && (
                    <>
                      <div className="hero-card-donut">
                        <svg viewBox="0 0 36 36">
                          <path className="donut-bg" d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31" />
                          <motion.path
                            className="donut-fill"
                            d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                            initial={{ strokeDashoffset: 98 }}
                            animate={{ strokeDashoffset: 98 - (card.donutPercent || 0) * 0.97 }}
                            transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                          />
                        </svg>
                        <span className="donut-value">{card.value}<span className="donut-unit">{card.unit}</span></span>
                      </div>
                      <span className="hero-card-label">{card.label}</span>
                    </>
                  )}
                  {card.type === 'crowd' && (
                    <>
                      <div className={`hero-card-crowd ${card.color || 'calm'}`}>
                        <span className="crowd-dot" />
                        <Users size={20} className="crowd-icon" />
                        <Users size={16} className="crowd-icon" />
                        <Users size={16} className="crowd-icon" />
                      </div>
                      <span className="hero-card-label">{card.label}</span>
                      <span className="hero-card-level">{card.level}</span>
                    </>
                  )}
                  {card.type === 'capacity' && (
                    <>
                      <div className="hero-card-capacity">
                        <span className="capacity-value">{card.value}</span>
                        <span className="capacity-unit">{card.unit}</span>
                      </div>
                      <MapPin size={18} className="capacity-icon" />
                      <span className="hero-card-label">{card.label}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.form
          className="hero-search-bar"
          onSubmit={handleSearch}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          <Search size={22} className="hero-search-icon" />
          <input
            type="text"
            placeholder="Paris, Louvre, Jardin des Tuileries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="hero-search-input"
            aria-label="Rechercher un lieu"
          />
          <Link to="/exploration" className="btn btn-primary hero-search-btn">
            Rechercher
          </Link>
        </motion.form>
      </section>

      {/* ——— BANDEAU ACCROCHE ——— */}
      <motion.section
        className="landing-tagline-strip"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
      >
        <div className="landing-container">
          <p className="tagline-strip-text">
            Moins de foule, plus de sérénité. <span className="tagline-accent">Votre trajet le plus zen en un clic.</span>
          </p>
        </div>
      </motion.section>

      <motion.section
        className="landing-section landing-brand-strip"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.55 }}
      >
        <div className="landing-container">
          <div className="landing-brand-header">
            <span className="landing-brand-eyebrow">
              <Sparkles size={16} />
              Services intégrés
            </span>
            <h2 className="landing-section-title landing-brand-title">
              SafePath s’appuie sur les APIs et moteurs qui font vivre l’expérience.
            </h2>
            <p className="landing-section-lead landing-brand-lead">
              Cartographie, météo, trafic, authentification, panoramas et transport: tout le stack utile est réuni ici.
            </p>
          </div>

          <div className="landing-brand-grid">
            {integrations.map((item) => (
              <div key={item.key} className="landing-brand-card">
                <div className="landing-brand-logo-frame">
                  <img
                    src={item.logo}
                    alt={item.alt}
                    className={`landing-brand-logo-image ${item.logoClass || ''}`}
                    loading="lazy"
                  />
                </div>
                <div className="landing-brand-copy">
                  <span className="landing-brand-category">{item.category}</span>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ——— DASHBOARD IMMERSIF ——— */}
      <section className="landing-section landing-dashboard-wrap">
        <div className="landing-container">
          <motion.h2
            className="landing-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={fadeInUp}
            transition={{ duration: 0.5 }}
          >
            Comme vous ne l'avez jamais vue.
          </motion.h2>
          <motion.p
            className="landing-section-lead landing-dashboard-lead"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Carte en temps réel, prédictions d’affluence et itinéraires sereins. Un tableau de bord pour respirer en ville.
          </motion.p>
          <motion.div
            className="landing-dashboard-mock"
            initial={{ opacity: 0, y: 48, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="dashboard-mock-header">
              <span className="mock-dot" />
              <span className="mock-dot" />
              <span className="mock-dot" />
              <span className="mock-search">Où souhaitez-vous aller sans stress ?</span>
              <span className="mock-pill">Temps réel</span>
            </div>
            <div className="dashboard-mock-body">
              <div className="mock-map">
                <div className="mock-map-heatmap" />
                <div className="mock-map-legend">
                  <span><i className="mock-legend-dot calm" /> Calme</span>
                  <span><i className="mock-legend-dot moderate" /> Modéré</span>
                  <span><i className="mock-legend-dot dense" /> Dense</span>
                </div>
              </div>
              <div className="mock-sidebar">
                <div className="mock-widget">
                  <span className="mock-widget-label">Indice de sérénité</span>
                  <span className="mock-widget-value">7.2<span className="mock-widget-unit">/10</span></span>
                </div>
                <div className="mock-widget">
                  <span className="mock-widget-label">Affluence prévue</span>
                  <span className="mock-widget-chart">
                    <motion.span className="mock-bar" initial={{ height: '10%' }} whileInView={{ height: '35%' }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.5 }} />
                    <motion.span className="mock-bar" initial={{ height: '10%' }} whileInView={{ height: '60%' }} viewport={{ once: true }} transition={{ delay: 0.4, duration: 0.5 }} />
                    <motion.span className="mock-bar" initial={{ height: '10%' }} whileInView={{ height: '45%' }} viewport={{ once: true }} transition={{ delay: 0.5, duration: 0.5 }} />
                    <motion.span className="mock-bar" initial={{ height: '10%' }} whileInView={{ height: '80%' }} viewport={{ once: true }} transition={{ delay: 0.6, duration: 0.5 }} />
                    <motion.span className="mock-bar" initial={{ height: '10%' }} whileInView={{ height: '55%' }} viewport={{ once: true }} transition={{ delay: 0.7, duration: 0.5 }} />
                    <motion.span className="mock-bar" initial={{ height: '10%' }} whileInView={{ height: '40%' }} viewport={{ once: true }} transition={{ delay: 0.8, duration: 0.5 }} />
                  </span>
                </div>
                <div className="mock-cta-inline">
                  <Link to="/exploration" className="btn btn-primary btn-sm">Ouvrir l’app <ChevronRight size={16} /></Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ——— POURQUOI SAFEPATH ——— */}
      <section className="landing-section landing-why">
        <div className="landing-container">
          <motion.h2
            className="landing-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
            variants={fadeInUp}
          >
            Pourquoi SafePath ?
          </motion.h2>
          <motion.div
            className="landing-why-grid"
            variants={stagger(0.1)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-30px' }}
          >
            {why.map((item, i) => (
              <motion.div key={i} className="landing-why-item" variants={fadeInUp}>
                <item.icon size={22} className="landing-why-icon" />
                <p>{item.line}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ——— CHIFFRES ——— */}
      <section className="landing-section landing-numbers">
        <div className="landing-container">
          <motion.h2
            className="landing-section-title landing-numbers-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            SafePath en quelques chiffres
          </motion.h2>
          <motion.div
            className="landing-stats-inner landing-numbers-grid"
            variants={stagger(0.15)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            <motion.div className="landing-stat num-card" variants={fadeInUp}>
              <span className="landing-stat-value"><AnimatedNumber value={100} suffix="%" /></span>
              <span className="landing-stat-label">Gratuit</span>
            </motion.div>
            <motion.div className="landing-stat num-card" variants={fadeInUp}>
              <span className="landing-stat-value"><AnimatedNumber value={6} suffix="h" /></span>
              <span className="landing-stat-label">Prédiction d’affluence</span>
            </motion.div>
            <motion.div className="landing-stat num-card" variants={fadeInUp}>
              <span className="landing-stat-value"><AnimatedNumber value={8} suffix="+" /></span>
              <span className="landing-stat-label">Villes couvertes</span>
            </motion.div>
            <motion.div className="landing-stat num-card" variants={fadeInUp}>
              <span className="landing-stat-value">1</span>
              <span className="landing-stat-label">Clic pour le mode urgence</span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ——— CE QUE NOUS OFFRONS ——— */}
      <section className="landing-section landing-features">
        <div className="landing-container">
          <motion.h2
            className="landing-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            Ce que SafePath vous offre
          </motion.h2>
          <motion.p
            className="landing-section-lead"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            transition={{ delay: 0.05 }}
          >
            Une plateforme pensée pour les déplacements sans stress.
          </motion.p>
          <motion.div
            className="landing-features-grid"
            variants={stagger(0.08)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
          >
            {features.map((item, i) => (
              <motion.div key={i} className="landing-feature-card" variants={fadeInUp}>
                <div className="landing-feature-icon">
                  <item.icon size={24} />
                </div>
                <h3 className="landing-feature-title">{item.title}</h3>
                <p className="landing-feature-phrase">{item.phrase}</p>
                <p className="landing-feature-desc">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ——— COMMENT ÇA MARCHE ——— */}
      <section className="landing-section landing-steps">
        <div className="landing-container">
          <motion.h2
            className="landing-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            Comment ça marche
          </motion.h2>
          <motion.div
            className="landing-steps-list"
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-30px' }}
          >
            {steps.map((step, i) => (
              <motion.div key={i} className="landing-step" variants={fadeInUp}>
                <div className="landing-step-num">{step.num}</div>
                <div className="landing-step-content">
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                {i < steps.length - 1 && <div className="landing-step-connector" />}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ——— TÉMOIGNAGE ——— */}
      <section className="landing-section landing-testimonial">
        <div className="landing-container">
          <motion.div
            className="landing-testimonial-card"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6 }}
          >
            <Quote size={40} className="testimonial-quote-icon" />
            <blockquote className="landing-testimonial-text">"{testimonial.text}"</blockquote>
            <footer className="landing-testimonial-author">
              <strong>{testimonial.author}</strong>
              <span>{testimonial.role}</span>
            </footer>
          </motion.div>
        </div>
      </section>

      {/* ——— FAQ ——— */}
      <section className="landing-section landing-faq">
        <div className="landing-container">
          <motion.h2
            className="landing-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            Questions fréquentes
          </motion.h2>
          <motion.div
            className="landing-faq-list"
            variants={stagger(0.08)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-20px' }}
          >
            {faqs.map((item, i) => (
              <motion.dl key={i} className="landing-faq-item" variants={fadeInUp}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </motion.dl>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ——— CTA FINAL ——— */}
      <section className="landing-section landing-cta">
        <div className="landing-container">
          <motion.div
            className="landing-cta-box"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="landing-cta-title">Prêt à respirer en ville ?</h2>
            <p className="landing-cta-text">Explorez la carte ou calculez votre premier trajet serein. C’est gratuit.</p>
            <div className="landing-cta-buttons">
              <Link to="/exploration" className="btn btn-primary btn-lg">
                <Compass size={20} /> Explorer la carte
              </Link>
              <Link to="/trajet" className="btn btn-outline btn-lg">
                <Route size={20} /> Calculer un trajet
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
