import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BellRing,
  Clock3,
  Gauge,
  Layers,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import MapComponent from '../components/MapComponent';
import { useAuth } from '../context/useAuth';
import './Dashboard.css';

const ZONES_FALLBACK = [
  { id: 'paris', label: 'Paris' },
  { id: 'lyon', label: 'Lyon' },
  { id: 'marseille', label: 'Marseille' },
  { id: 'bordeaux', label: 'Bordeaux' },
];

const VIEWS = [
  { id: 'map', label: 'Carte' },
  { id: 'stats', label: 'Stats' },
  { id: 'routes', label: 'Trajets' },
  { id: 'alerts', label: 'Alertes' },
  { id: 'ai', label: 'Assistant' },
];

const PROFILES = ['zen', 'equilibre', 'rapide'];
const QUICK_PROMPTS = [
  'Quelle est la zone la plus calme ?',
  'Quel est le meilleur moment pour partir ?',
  'Quelle route est la plus sereine ?',
];

const VIEW_META = {
  map: {
    Icon: MapPinned,
    description: 'Lecture spatiale des secteurs surveilles',
  },
  stats: {
    Icon: TrendingUp,
    description: 'Projection horaire et densite moyenne',
  },
  routes: {
    Icon: RouteIcon,
    description: 'Recommandations de parcours et profils',
  },
  alerts: {
    Icon: BellRing,
    description: 'Signaux a surveiller dans la zone active',
  },
  ai: {
    Icon: Sparkles,
    description: 'Copilote local branche sur le dashboard',
  },
};

const PROFILE_LABELS = {
  zen: 'Zen',
  equilibre: 'Equilibre',
  rapide: 'Rapide',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pct = (value) => `${Math.round((value || 0) * 100)}%`;
const hourText = (value) => `${String(value).padStart(2, '0')}:00`;

const buildInitials = (user) => {
  const candidates = [user?.first_name, user?.last_name].filter(Boolean);
  if (candidates.length) {
    return candidates.map((part) => part.trim()[0]?.toUpperCase() || '').join('').slice(0, 2);
  }
  return (user?.username || 'SP').slice(0, 2).toUpperCase();
};

const greetingFor = (date) => {
  const hour = date.getHours();
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon apres-midi';
  return 'Bonsoir';
};

const densityMeta = (density) => {
  if (density < 0.3) return { label: 'Fluide', tone: 'low' };
  if (density < 0.6) return { label: 'Modere', tone: 'mid' };
  return { label: 'Dense', tone: 'high' };
};

const projectionFor = (avgDensity, maxDensity, selectedHour) =>
  [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((hour, index) => {
    const base = [0.22, 0.38, 0.7, 0.58, 0.46, 0.5, 0.68, 0.62, 0.48, 0.44, 0.56, 0.76, 0.88, 0.66, 0.5, 0.34][index];
    const focus = clamp(0.1 - Math.abs(hour - selectedHour) * 0.012, -0.05, 0.1);
    return { hour, density: clamp(base * 0.62 + avgDensity * 0.48 + maxDensity * 0.14 + focus, 0.08, 0.96) };
  });

function chartPath(points, width, height, padding) {
  const max = Math.max(...points.map((point) => point.density), 0.01);
  const coords = points.map((point, index) => ({
    ...point,
    x: padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1),
    y: height - padding - (point.density / max) * (height - padding * 2),
  }));

  return {
    coords,
    line: coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' '),
    area: `${coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')} L${coords[coords.length - 1].x},${height - padding} L${coords[0].x},${height - padding} Z`,
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [zones, setZones] = useState(ZONES_FALLBACK);
  const [selectedZone, setSelectedZone] = useState('paris');
  const [zoneLabel, setZoneLabel] = useState('Paris');
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());
  const [gridSize, setGridSize] = useState(5);
  const [predictionForHour, setPredictionForHour] = useState(new Date().getHours());
  const [sourceDescription, setSourceDescription] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [calmZones, setCalmZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [view, setView] = useState('map');
  const [profile, setProfile] = useState('zen');
  const [selectedRouteId, setSelectedRouteId] = useState('zen');
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: 'assistant',
      text: 'Je lis les donnees du dashboard SafePath. Demandez une zone calme, une heure de depart ou une route.',
    },
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());
  const assistantRef = useRef(null);
  const replyTimerRef = useRef(null);

  useEffect(() => {
    axios.get('/api/zones/').then((res) => {
      if (res.data?.zones?.length) setZones(res.data.zones);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => setUserLocation({ lat: 48.8566, lng: 2.3522 })
      );
    } else {
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setLiveTime(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => () => replyTimerRef.current && window.clearTimeout(replyTimerRef.current), []);

  useEffect(() => {
    if (assistantRef.current) assistantRef.current.scrollTop = assistantRef.current.scrollHeight;
  }, [assistantMessages, assistantLoading]);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [predictionRes, calmRes] = await Promise.all([
        axios.get('/api/density-prediction/', { params: { zone: selectedZone, hour: selectedHour, grid: gridSize } }),
        axios.get('/api/calm-zones/').catch(() => ({ data: { calm_zones: [] } })),
      ]);

      setPredictions(predictionRes.data?.predictions || []);
      setZoneLabel(predictionRes.data?.zone_label || zones.find((zone) => zone.id === selectedZone)?.label || selectedZone);
      setUpdatedAt(predictionRes.data?.updated_at || null);
      setSourceDescription(predictionRes.data?.source || '');
      setPredictionForHour(predictionRes.data?.prediction_for_hour ?? predictionRes.data?.hour ?? selectedHour);
      setCalmZones(calmRes.data?.calm_zones || []);
      setDismissedAlerts([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de chargement des predictions');
      setPredictions([]);
      setCalmZones([]);
    } finally {
      setLoading(false);
    }
  }, [gridSize, selectedHour, selectedZone, zones]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const sectors = predictions.map((prediction, index) => ({
    ...prediction,
    id: `${selectedZone}-${index}`,
    zoneLabel: prediction.zone_label || `${zoneLabel} secteur ${index + 1}`,
  }));

  const densityData = sectors
    .filter((sector) => sector.location?.lat != null && sector.location?.lng != null)
    .map((sector) => ({ location: sector.location, density: sector.density, confidence: sector.confidence || 0.7 }));

  const avgDensity = sectors.length ? sectors.reduce((sum, sector) => sum + (sector.density || 0), 0) / sectors.length : 0;
  const maxDensity = sectors.length ? Math.max(...sectors.map((sector) => sector.density || 0)) : 0;
  const bestSector = [...sectors].sort((left, right) => (left.density || 0) - (right.density || 0))[0];
  const hottestSector = [...sectors].sort((left, right) => (right.density || 0) - (left.density || 0))[0];
  const projection = projectionFor(avgDensity, maxDensity, selectedHour);
  const peakSlot = [...projection].sort((left, right) => right.density - left.density)[0];
  const calmSlot = [...projection].sort((left, right) => left.density - right.density)[0];
  const lowCount = sectors.filter((sector) => sector.density < 0.3).length;
  const midCount = sectors.filter((sector) => sector.density >= 0.3 && sector.density < 0.6).length;
  const highCount = sectors.filter((sector) => sector.density >= 0.6).length;

  const routes = [
    {
      id: 'zen',
      label: 'Route Zen',
      eta: `${16 + Math.round(avgDensity * 6)} min`,
      crowd: clamp(Math.round(avgDensity * 100) - 18, 8, 75),
      score: clamp(96 - Math.round(maxDensity * 18), 70, 99),
      note: `Contourne ${hottestSector?.zoneLabel || 'les zones chargees'} et passe pres de ${calmZones[0]?.name || 'zones calmes'}.`,
    },
    {
      id: 'equilibre',
      label: 'Route Equilibre',
      eta: `${13 + Math.round(avgDensity * 5)} min`,
      crowd: clamp(Math.round(avgDensity * 100) - 6, 16, 84),
      score: clamp(88 - Math.round(avgDensity * 12), 62, 95),
      note: `Compromis entre temps et confort pour ${hourText(selectedHour)}.`,
    },
    {
      id: 'rapide',
      label: 'Route Rapide',
      eta: `${11 + Math.round(avgDensity * 4)} min`,
      crowd: clamp(Math.round(maxDensity * 100) - 2, 22, 94),
      score: clamp(78 - Math.round(maxDensity * 10), 54, 88),
      note: 'Trajet direct, mais exposition plus forte aux pics de foule.',
    },
  ];

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0];
  const alerts = [
    {
      id: 'peak',
      tone: 'high',
      title: 'Pic de densite',
      text: `Le point le plus charge atteint ${pct(maxDensity)}${hottestSector ? ` sur ${hottestSector.zoneLabel}` : ''}.`,
    },
    {
      id: 'calm',
      tone: 'low',
      title: 'Fenetre calme',
      text: `Le meilleur creux projete arrive vers ${hourText(calmSlot?.hour || selectedHour)}.`,
    },
    {
      id: 'zone',
      tone: 'mid',
      title: 'Zone refuge',
      text: calmZones[0] ? `${calmZones[0].name} reste disponible comme point de respiration.` : 'Aucune zone refuge supplementaire detectee.',
    },
  ].filter((alert) => !dismissedAlerts.includes(alert.id));

  const chart = chartPath(projection, 720, 220, 28);

  const replyFor = (message) => {
    const text = message.toLowerCase();
    if (text.includes('calme') || text.includes('zone')) {
      return bestSector
        ? `${bestSector.zoneLabel} est le secteur le plus calme, autour de ${pct(bestSector.density)}.`
        : `La charge moyenne actuelle sur ${zoneLabel} est de ${pct(avgDensity)}.`;
    }
    if (text.includes('heure') || text.includes('partir') || text.includes('pointe')) {
      return `Le prochain pic est attendu vers ${hourText(peakSlot?.hour || selectedHour)}. Si vous pouvez decaler, ciblez ${hourText(calmSlot?.hour || selectedHour)}.`;
    }
    return `${selectedRoute.label} est mon meilleur choix du moment: ${selectedRoute.eta}, charge estimee ${selectedRoute.crowd}% et score ${selectedRoute.score}/100.`;
  };

  const sendAssistant = (message) => {
    const clean = message.trim();
    if (!clean || assistantLoading) return;
    setAssistantMessages((current) => [...current, { role: 'user', text: clean }]);
    setAssistantInput('');
    setAssistantLoading(true);
    replyTimerRef.current = window.setTimeout(() => {
      setAssistantMessages((current) => [...current, { role: 'assistant', text: replyFor(clean) }]);
      setAssistantLoading(false);
    }, 500);
  };

  const mood = densityMeta(avgDensity);
  const displayName = user?.first_name?.trim() || user?.username || 'Explorateur';
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  const userHeadline = fullName || user?.username || 'Membre SafePath';
  const userInitials = buildInitials(user);
  const greeting = greetingFor(liveTime);
  const selectedViewMeta = VIEW_META[view];
  const personalizedInsights = [
    {
      label: 'Zone prioritaire',
      value: bestSector?.zoneLabel || zoneLabel,
      detail: bestSector ? `${pct(bestSector.density)} de charge` : 'En attente de donnees',
    },
    {
      label: 'Depart conseille',
      value: hourText(calmSlot?.hour || selectedHour),
      detail: `${pct(calmSlot?.density || avgDensity)} projetes`,
    },
    {
      label: 'Profil actif',
      value: PROFILE_LABELS[profile] || profile,
      detail: selectedRoute?.label || 'Aucun trajet',
    },
  ];

  return (
    <div className="dashboard-page dashboard-room dashboard-member-room">
      <div className="dashboard-member-shell">
        <aside className="dashboard-member-sidebar">
          <div className="member-brand">
            <div className="member-brand-mark">SP</div>
            <div>
              <span>SafePath</span>
              <strong>Mon espace</strong>
            </div>
          </div>

          <section className="member-profile-card">
            <div className="member-avatar">{userInitials}</div>
            <div className="member-profile-copy">
              <span className="member-kicker">Espace connecte</span>
              <h2>{userHeadline}</h2>
              <p>
                {greeting}, {displayName}. Votre tableau de bord regroupe vos signaux, vos meilleures
                fenetres de depart et vos actions rapides.
              </p>
            </div>
          </section>

          <section className="member-sidebar-section">
            <span className="member-section-label">Navigation du dashboard</span>
            <div className="member-view-nav">
              {VIEWS.map((item) => {
                const Icon = VIEW_META[item.id]?.Icon || Activity;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`member-view-btn ${view === item.id ? 'active' : ''}`}
                    onClick={() => setView(item.id)}
                  >
                    <Icon size={16} />
                    <div>
                      <strong>{item.label}</strong>
                      <span>{VIEW_META[item.id]?.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="member-sidebar-section">
            <span className="member-section-label">Acces rapides</span>
            <div className="member-shortcuts">
              <Link to="/trajet" className="member-shortcut">
                <RouteIcon size={16} />
                <div>
                  <strong>Nouveau trajet</strong>
                  <span>Basculer vers le calculateur d itineraire</span>
                </div>
                <ArrowRight size={14} />
              </Link>
              <Link to="/exploration" className="member-shortcut">
                <MapPinned size={16} />
                <div>
                  <strong>Explorer la carte</strong>
                  <span>Ouvrir la vue ville et lieux</span>
                </div>
                <ArrowRight size={14} />
              </Link>
            </div>
          </section>

          <section className="member-sidebar-section member-sidebar-surface">
            <span className="member-section-label">Mon resume</span>
            <div className="member-mini-stack">
              <div className="member-mini-card">
                <span>Zone suivie</span>
                <strong>{zoneLabel}</strong>
              </div>
              <div className="member-mini-card">
                <span>Route conseillee</span>
                <strong>{selectedRoute?.label || 'Zen'}</strong>
              </div>
              <div className="member-mini-card">
                <span>Mise a jour</span>
                <strong>
                  {updatedAt
                    ? new Date(updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    : liveTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </div>
            </div>
          </section>
        </aside>

        <main className="dashboard-member-main">
          <section className="member-overview-grid">
            <article className="member-hero-panel">
              <div className="dashboard-badge">
                <Gauge size={14} /> Dashboard personnel SafePath
              </div>
              <h1>{greeting}, {displayName}. Votre ville est sous controle.</h1>
              <p>
                Cette interface connectee est differente du site public: elle met en avant votre zone active,
                vos habitudes de trajet et les indicateurs les plus utiles pour partir au bon moment.
              </p>

              <div className="member-summary-grid">
                <article className={`hero-stat tone-${mood.tone}`}>
                  <span>Charge moyenne</span>
                  <strong>{pct(avgDensity)}</strong>
                  <small>{mood.label}</small>
                </article>
                <article className="hero-stat tone-high">
                  <span>Point chaud</span>
                  <strong>{pct(maxDensity)}</strong>
                  <small>{hottestSector?.zoneLabel || 'En attente'}</small>
                </article>
                <article className="hero-stat tone-low">
                  <span>Fenetre recommandee</span>
                  <strong>{hourText(calmSlot?.hour || selectedHour)}</strong>
                  <small>{pct(calmSlot?.density || avgDensity)}</small>
                </article>
              </div>

              <div className="member-personal-grid">
                {personalizedInsights.map((insight) => (
                  <article key={insight.label} className="member-personal-card">
                    <span>{insight.label}</span>
                    <strong>{insight.value}</strong>
                    <small>{insight.detail}</small>
                  </article>
                ))}
              </div>
            </article>

            <aside className="member-radar-panel">
              <div className="dashboard-live">
                <span className="live-dot" />
                {error ? 'Signal degrade' : `Projection ${hourText(predictionForHour)}`}
              </div>
              <div className="radar-ring">
                <div>
                  <span>Ville active</span>
                  <strong>{zoneLabel}</strong>
                  <small>{liveTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>
                </div>
              </div>
              <div className="dashboard-meta">
                <div><span>Source</span><strong>{sourceDescription || 'Historique + temps reel'}</strong></div>
                <div><span>Grille</span><strong>{gridSize} x {gridSize}</strong></div>
                <div><span>Vue active</span><strong>{selectedViewMeta?.description || 'Pilotage live'}</strong></div>
              </div>
            </aside>
          </section>

          <section className="dashboard-toolbar member-toolbar-card">
        <label className="control">
          <span><MapPinned size={15} /> Ville</span>
          <select value={selectedZone} onChange={(event) => setSelectedZone(event.target.value)}>
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
          </select>
        </label>
        <label className="control wide">
          <span><Clock3 size={15} /> Heure cible</span>
          <div className="range-wrap">
            <input type="range" min="0" max="23" value={selectedHour} onChange={(event) => setSelectedHour(Number(event.target.value))} />
            <strong>{hourText(selectedHour)}</strong>
          </div>
        </label>
        <label className="control">
          <span><Layers size={15} /> Resolution</span>
          <select value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))}>
            <option value="3">3 x 3</option>
            <option value="5">5 x 5</option>
            <option value="7">7 x 7</option>
            <option value="10">10 x 10</option>
          </select>
        </label>
        <button className="refresh" onClick={fetchPredictions} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Actualisation...' : 'Actualiser'}
        </button>
          </section>

          <div className="toolbar-info member-status-strip">
        <span><LocateFixed size={14} /> {bestSector ? `Zone la plus calme: ${bestSector.zoneLabel} a ${pct(bestSector.density)}` : 'En attente de secteurs analyses'}</span>
        <span><ShieldCheck size={14} /> {sourceDescription || 'Analyse predictive melangeant historique et temps reel'}</span>
          </div>

          {error && <div className="dashboard-error"><TriangleAlert size={16} /> {error}</div>}

          <section className="dashboard-panel-shell member-panel-shell">
        {view === 'map' && (
          <div className="split two-col">
            <article className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Cartographie live</span>
                  <h2>{zoneLabel} sous surveillance</h2>
                </div>
                <span className="pill">{sectors.length} secteurs</span>
              </div>
              <div className="map-stage">
                <MapComponent route={null} userLocation={userLocation} densityData={densityData} />
                <div className="overlay top-left">Prediction {hourText(predictionForHour)}</div>
                <div className="overlay top-right live"><span className="live-dot" /> LIVE</div>
                <div className="overlay bottom-left">Fluide - Modere - Dense</div>
              </div>
            </article>

            <aside className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Secteurs</span>
                  <h2>Lecture rapide</h2>
                </div>
                <span className="pill low">{lowCount} apaises</span>
              </div>
              <div className="stack">
                {sectors.length === 0 && <div className="empty">Aucune prediction detaillee.</div>}
                {sectors.map((sector) => {
                  const meta = densityMeta(sector.density || 0);
                  return (
                    <article key={sector.id} className={`sector-card ${meta.tone}`}>
                      <div className="sector-top">
                        <div>
                          <strong>{sector.zoneLabel}</strong>
                          <span>{meta.label}</span>
                        </div>
                        <strong>{pct(sector.density)}</strong>
                      </div>
                      <div className="bar"><span style={{ width: `${Math.round((sector.density || 0) * 100)}%` }} /></div>
                    </article>
                  );
                })}
              </div>
            </aside>
          </div>
        )}

        {view === 'stats' && (
          <div className="stack">
            <div className="stats-grid">
              <article className="stat-card"><span>Moyenne</span><strong>{pct(avgDensity)}</strong><small>{sectors.length} secteurs</small></article>
              <article className="stat-card"><span>Zones denses</span><strong>{highCount}</strong><small>au-dessus de 60%</small></article>
              <article className="stat-card"><span>Zones fluides</span><strong>{lowCount}</strong><small>sous 30%</small></article>
              <article className="stat-card"><span>Meilleure heure</span><strong>{hourText(calmSlot?.hour || selectedHour)}</strong><small>{pct(calmSlot?.density || avgDensity)}</small></article>
            </div>
            <article className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Projection journaliere</span>
                  <h2>Densite estimee par heure</h2>
                </div>
                <span className="pill">{hourText(peakSlot?.hour || selectedHour)}</span>
              </div>
              <svg viewBox="0 0 720 220" className="chart">
                <defs>
                  <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(45,157,120,0.35)" />
                    <stop offset="100%" stopColor="rgba(45,157,120,0.03)" />
                  </linearGradient>
                </defs>
                {[0, 0.25, 0.5, 0.75, 1].map((step) => <line key={step} x1="28" y1={220 - 28 - step * 164} x2="692" y2={220 - 28 - step * 164} className="grid-line" />)}
                <path d={chart.area} fill="url(#dashArea)" />
                <path d={chart.line} className="chart-line" />
                {chart.coords.map((point) => (
                  <g key={point.hour}>
                    <circle cx={point.x} cy={point.y} r={point.hour === selectedHour ? 5 : 4} className={point.hour === selectedHour ? 'chart-dot current' : 'chart-dot'} />
                    <text x={point.x} y="212" textAnchor="middle">{String(point.hour).padStart(2, '0')}h</text>
                  </g>
                ))}
              </svg>
            </article>
            <div className="stats-grid">
              <article className="stat-card tone-low"><span>Fluide</span><strong>{lowCount}</strong><small>zones sous 30%</small></article>
              <article className="stat-card tone-mid"><span>Modere</span><strong>{midCount}</strong><small>zones entre 30% et 60%</small></article>
              <article className="stat-card tone-high"><span>Dense</span><strong>{highCount}</strong><small>zones au-dessus de 60%</small></article>
            </div>
          </div>
        )}

        {view === 'routes' && (
          <div className="split two-col">
            <article className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Routage recommande</span>
                  <h2>Trois styles de trajet</h2>
                </div>
                <span className="pill">{hourText(selectedHour)}</span>
              </div>
              <div className="profiles">
                {PROFILES.map((item) => (
                  <button key={item} className={profile === item ? 'active' : ''} onClick={() => { setProfile(item); setSelectedRouteId(item); }}>
                    {item}
                  </button>
                ))}
              </div>
              <div className="stack">
                {routes.map((route) => (
                  <button key={route.id} className={`route-card ${selectedRoute?.id === route.id ? 'selected' : ''}`} onClick={() => setSelectedRouteId(route.id)}>
                    <div className="route-top">
                      <div><strong>{route.label}</strong><span>{route.eta}</span></div>
                      <strong>{route.score}/100</strong>
                    </div>
                    <div className="bar"><span style={{ width: `${route.score}%` }} /></div>
                    <p>{route.note}</p>
                  </button>
                ))}
              </div>
            </article>
            <aside className="card preview-card">
              <div className="preview-ring">
                <RouteIcon size={22} />
                <strong>{selectedRoute?.eta}</strong>
                <span>{selectedRoute?.label}</span>
              </div>
              <div className="stack compact">
                <div className="mini-note"><Sparkles size={14} /> Charge estimee {selectedRoute?.crowd}%</div>
                <div className="mini-note"><TrendingUp size={14} /> {selectedRoute?.note}</div>
                <div className="mini-note"><ShieldCheck size={14} /> {calmZones[0]?.name || 'Zone calme la plus proche'} comme pause possible</div>
              </div>
            </aside>
          </div>
        )}

        {view === 'alerts' && (
          <div className="split two-col">
            <article className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Flux d alertes</span>
                  <h2>Signaux a surveiller</h2>
                </div>
                <span className="pill">{alerts.length} actives</span>
              </div>
              <div className="stack">
                {alerts.map((alert) => (
                  <article key={alert.id} className={`alert-card ${alert.tone}`}>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.text}</p>
                    </div>
                    <button onClick={() => setDismissedAlerts((current) => [...current, alert.id])}>x</button>
                  </article>
                ))}
                {alerts.length === 0 && <div className="empty">Toutes les alertes ont ete masquees.</div>}
              </div>
            </article>
            <aside className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Resume</span>
                  <h2>Ce que le systeme voit</h2>
                </div>
              </div>
              <div className="stack compact">
                <div className="mini-note"><BellRing size={14} /> Pic estime vers {hourText(peakSlot?.hour || selectedHour)}</div>
                <div className="mini-note"><ShieldCheck size={14} /> Secteur le plus calme: {bestSector?.zoneLabel || 'N/A'}</div>
                <div className="mini-note"><Activity size={14} /> Source: {sourceDescription || 'Historique + temps reel'}</div>
              </div>
            </aside>
          </div>
        )}

        {view === 'ai' && (
          <div className="split two-col">
            <article className="card assistant-card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Assistant local</span>
                  <h2>Dialogue sur les donnees du dashboard</h2>
                </div>
                <span className="pill low">Sans API externe</span>
              </div>
              <div className="assistant-feed" ref={assistantRef}>
                {assistantMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`bubble ${message.role === 'user' ? 'user' : ''}`}>{message.text}</div>
                ))}
                {assistantLoading && <div className="loading-dots"><span /><span /><span /></div>}
              </div>
              <div className="assistant-input">
                <input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendAssistant(assistantInput)} placeholder="Posez une question sur les zones, heures ou trajets..." />
                <button onClick={() => sendAssistant(assistantInput)} disabled={assistantLoading}>Envoyer</button>
              </div>
              <div className="prompts">
                {QUICK_PROMPTS.map((prompt) => <button key={prompt} onClick={() => sendAssistant(prompt)}>{prompt}</button>)}
              </div>
            </article>
            <aside className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Memo court</span>
                  <h2>Recommandations instantanees</h2>
                </div>
              </div>
              <div className="stack compact">
                <div className="mini-note"><ShieldCheck size={14} /> {bestSector ? `${bestSector.zoneLabel} a ${pct(bestSector.density)}` : 'Aucune zone detaillee'}</div>
                <div className="mini-note"><Clock3 size={14} /> Le meilleur creux se situe vers {hourText(calmSlot?.hour || selectedHour)}</div>
                <div className="mini-note"><RouteIcon size={14} /> {selectedRoute?.label} reste le meilleur compromis du moment</div>
              </div>
            </aside>
          </div>
        )}
          </section>
        </main>
      </div>
    </div>
  );
}
