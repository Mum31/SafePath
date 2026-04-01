import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  Bike,
  BriefcaseBusiness,
  CalendarClock,
  CarFront,
  Check,
  Clock3,
  Footprints,
  Gauge,
  Home,
  LocateFixed,
  MapPin,
  Route as RouteIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  TriangleAlert,
} from 'lucide-react';

import MapComponent from '../components/MapComponent';
import { useAuth } from '../context/useAuth';
import { api } from '../services/api';
import './Dashboard.css';

const ZONES_FALLBACK = [
  { id: 'paris', label: 'Paris' },
  { id: 'lyon', label: 'Lyon' },
  { id: 'marseille', label: 'Marseille' },
  { id: 'bordeaux', label: 'Bordeaux' },
];

const DASHBOARD_PROFILE_PREFIX = 'safepath.dashboard.profile';

const DEFAULT_PROFILE = {
  mainZone: 'paris',
  homeLabel: '',
  workLabel: '',
  transports: ['transit'],
  morningDeparture: '08:00',
  eveningReturn: '18:00',
  objective: 'least_crowded',
  crowdTolerance: 'low',
  notifications: {
    traffic: true,
    schedule: true,
    realtime: true,
  },
  consents: {
    history: false,
    realtimeLocation: false,
  },
};

const TRANSPORT_OPTIONS = [
  { id: 'car', label: 'Voiture', Icon: CarFront },
  { id: 'transit', label: 'Transport', Icon: TrainFront },
  { id: 'bike', label: 'Velo', Icon: Bike },
  { id: 'walking', label: 'Marche', Icon: Footprints },
];

const OBJECTIVE_OPTIONS = [
  { id: 'fastest', label: 'Le plus rapide', shortLabel: 'Rapide' },
  { id: 'least_crowded', label: 'Le moins frequente', shortLabel: 'Moins de foule' },
  { id: 'eco', label: 'Le plus ecologique', shortLabel: 'Ecologique' },
  { id: 'cheapest', label: 'Le moins cher', shortLabel: 'Economique' },
];

const CROWD_TOLERANCE_OPTIONS = [
  { id: 'low', label: 'Faible', threshold: 0.34, shortLabel: 'Evite la foule' },
  { id: 'medium', label: 'Moyenne', threshold: 0.55, shortLabel: 'Equilibre' },
  { id: 'high', label: 'Elevee', threshold: 0.78, shortLabel: 'Flexible' },
];

const NOTIFICATION_OPTIONS = [
  { id: 'traffic', label: 'Alertes trafic' },
  { id: 'schedule', label: 'Suggestions horaires' },
  { id: 'realtime', label: 'Changements en temps reel' },
];

const CONSENT_OPTIONS = [
  { id: 'history', label: 'Historique des deplacements' },
  { id: 'realtimeLocation', label: 'Geolocalisation en temps reel' },
];

const MOMENT_LABELS = {
  morning: 'Aller',
  evening: 'Retour',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pct = (value) => `${Math.round((value || 0) * 100)}%`;
const hourText = (value) => `${String(value).padStart(2, '0')}:00`;

function parseHour(value, fallback) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  const [hour] = value.split(':');
  const parsed = Number(hour);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 23) : fallback;
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon apres-midi';
  return 'Bonsoir';
}

function densityMeta(density) {
  if (density < 0.3) return { label: 'Fluide', tone: 'low' };
  if (density < 0.6) return { label: 'Moderee', tone: 'mid' };
  return { label: 'Dense', tone: 'high' };
}

function projectionFor(avgDensity, maxDensity, selectedHour) {
  return [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((hour, index) => {
    const base = [0.22, 0.38, 0.7, 0.58, 0.46, 0.5, 0.68, 0.62, 0.48, 0.44, 0.56, 0.76, 0.88, 0.66, 0.5, 0.34][index];
    const focus = clamp(0.1 - Math.abs(hour - selectedHour) * 0.012, -0.05, 0.1);
    return {
      hour,
      density: clamp(base * 0.62 + avgDensity * 0.48 + maxDensity * 0.14 + focus, 0.08, 0.96),
    };
  });
}

function getProfileStorageKey(user) {
  const identity = user?.id || user?.username || user?.email || 'guest';
  return `${DASHBOARD_PROFILE_PREFIX}:${identity}`;
}

function mergeProfile(profile = {}) {
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    transports: Array.isArray(profile.transports) && profile.transports.length ? profile.transports : DEFAULT_PROFILE.transports,
    notifications: {
      ...DEFAULT_PROFILE.notifications,
      ...(profile.notifications || {}),
    },
    consents: {
      ...DEFAULT_PROFILE.consents,
      ...(profile.consents || {}),
    },
  };
}

function readStoredProfile(user) {
  try {
    const raw = window.localStorage.getItem(getProfileStorageKey(user));
    return raw ? mergeProfile(JSON.parse(raw)) : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function persistProfile(user, profile) {
  try {
    window.localStorage.setItem(getProfileStorageKey(user), JSON.stringify(profile));
  } catch {
    // Ignore local persistence issues and keep the UI responsive.
  }
}

function completionRatio(profile) {
  const answers = [
    Boolean(profile.homeLabel.trim()),
    Boolean(profile.workLabel.trim()),
    Array.isArray(profile.transports) && profile.transports.length > 0,
    Boolean(profile.morningDeparture && profile.eveningReturn),
    Boolean(profile.objective && profile.crowdTolerance),
  ];
  const completed = answers.filter(Boolean).length;
  return {
    completed,
    total: answers.length,
    percentage: Math.round((completed / answers.length) * 100),
  };
}

function formatTransportList(values) {
  if (!values?.length) {
    return 'A definir';
  }
  return values
    .map((value) => TRANSPORT_OPTIONS.find((option) => option.id === value)?.label || value)
    .join(', ');
}

function findSuggestedSlot(projection, targetHour, threshold) {
  const windowed = projection.filter((point) => Math.abs(point.hour - targetHour) <= 2);
  const pool = windowed.length ? windowed : projection;
  const matchingThreshold = pool.filter((point) => point.density <= threshold);
  const sortByDistance = (left, right) =>
    Math.abs(left.hour - targetHour) - Math.abs(right.hour - targetHour) || left.density - right.density;
  if (matchingThreshold.length) {
    return [...matchingThreshold].sort(sortByDistance)[0];
  }
  return [...pool].sort((left, right) => left.density - right.density || sortByDistance(left, right))[0] || null;
}

function buildMomentRecommendation({ label, targetHour, targetSlot, suggestedSlot, threshold, objectiveLabel }) {
  if (!targetSlot) {
    return {
      headline: `${label}: donnees en attente`,
      text: 'SafePath attend la prochaine projection pour recommander un horaire.',
    };
  }
  const targetDensity = targetSlot.density || 0;
  const status = densityMeta(targetDensity);
  const suggestedHour = suggestedSlot?.hour ?? targetHour;
  const shouldMove = targetDensity > threshold && suggestedHour !== targetHour;
  if (shouldMove) {
    const direction = suggestedHour < targetHour ? 'plus tot' : 'plus tard';
    return {
      headline: `${label}: trafic ${status.label.toLowerCase()} vers ${hourText(targetHour)}`,
      text: `Pour garder un trajet ${objectiveLabel.toLowerCase()}, partez ${direction}, idealement vers ${hourText(suggestedHour)}.`,
    };
  }
  if (targetDensity > threshold) {
    return {
      headline: `${label}: creneau charge mais gerable`,
      text: `Le pic reste limite autour de ${hourText(targetHour)}. Gardez ${objectiveLabel.toLowerCase()} comme priorite et surveillez les alertes.`,
    };
  }
  return {
    headline: `${label}: bonne fenetre a ${hourText(targetHour)}`,
    text: `La densite reste compatible avec votre tolerance. Vous pouvez garder votre depart habituel.`,
  };
}

function guessZoneId(zones, ...texts) {
  const haystack = texts.join(' ').toLowerCase();
  const match = zones.find((zone) => {
    const label = String(zone.label || zone.id || '').toLowerCase();
    const id = String(zone.id || '').toLowerCase();
    return label && (haystack.includes(label) || haystack.includes(id));
  });
  return match?.id || null;
}

function buildUserPreferencePayload(profile, user) {
  const tolerance = CROWD_TOLERANCE_OPTIONS.find((option) => option.id === profile.crowdTolerance) || CROWD_TOLERANCE_OPTIONS[0];
  const prefersTransit = profile.transports.includes('transit');
  const likesWalking = profile.transports.includes('walking');
  return {
    user_id: user?.id ? `auth_${user.id}` : user?.username ? `member_${user.username}` : 'dashboard_guest',
    max_crowd_density: tolerance.threshold,
    avoid_main_roads: profile.objective !== 'fastest',
    prefer_parks: profile.objective === 'eco' || profile.crowdTolerance === 'low',
    noise_sensitivity: profile.crowdTolerance === 'low' ? 8 : profile.crowdTolerance === 'medium' ? 5 : 2,
    walking_speed: likesWalking ? 1.55 : 1.35,
    consider_public_transport: prefersTransit,
    transport_factor: profile.objective === 'cheapest' ? 0.35 : profile.objective === 'eco' ? 0.28 : 0.15,
  };
}

function formatUpdateTime(value, fallbackDate) {
  const date = value ? new Date(value) : fallbackDate;
  if (Number.isNaN(date.getTime())) {
    return 'Maintenant';
  }
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [zones, setZones] = useState(ZONES_FALLBACK);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [selectedMoment, setSelectedMoment] = useState(() => (new Date().getHours() >= 14 ? 'evening' : 'morning'));
  const [zoneLabel, setZoneLabel] = useState('Paris');
  const [predictions, setPredictions] = useState([]);
  const [calmZones, setCalmZones] = useState([]);
  const [sourceDescription, setSourceDescription] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [liveTime, setLiveTime] = useState(new Date());
  const syncTimerRef = useRef(null);

  useEffect(() => {
    api.get('/zones/')
      .then((response) => {
        if (response.data?.zones?.length) {
          setZones(response.data.zones);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setProfile(readStoredProfile(user));
    setProfileHydrated(true);
  }, [user?.email, user?.id, user?.username]);

  useEffect(() => {
    if (!profileHydrated) {
      return;
    }
    persistProfile(user, profile);
  }, [profile, profileHydrated, user]);

  useEffect(() => () => syncTimerRef.current && window.clearTimeout(syncTimerRef.current), []);

  useEffect(() => {
    if (!profileHydrated) {
      return undefined;
    }
    syncTimerRef.current = window.setTimeout(async () => {
      try {
        await api.post('/user-preferences/', buildUserPreferencePayload(profile, user));
      } catch {
        // The dashboard still works even if backend preference sync is unavailable.
      }
    }, 700);
    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [profile, profileHydrated, user]);

  useEffect(() => {
    const guessedZone = guessZoneId(zones, profile.homeLabel, profile.workLabel);
    if (guessedZone && guessedZone !== profile.mainZone) {
      setProfile((current) => ({ ...current, mainZone: guessedZone }));
    }
  }, [profile.homeLabel, profile.mainZone, profile.workLabel, zones]);

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

  const focusHour = useMemo(
    () =>
      selectedMoment === 'morning'
        ? parseHour(profile.morningDeparture, new Date().getHours())
        : parseHour(profile.eveningReturn, new Date().getHours()),
    [profile.eveningReturn, profile.morningDeparture, selectedMoment]
  );

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [predictionResponse, calmResponse] = await Promise.all([
        api.get('/density-prediction/', {
          params: {
            zone: profile.mainZone,
            hour: focusHour,
            grid: 5,
          },
        }),
        api.get('/calm-zones/').catch(() => ({ data: { calm_zones: [] } })),
      ]);
      const zoneName =
        predictionResponse.data?.zone_label ||
        zones.find((zone) => zone.id === profile.mainZone)?.label ||
        profile.mainZone;
      setPredictions(predictionResponse.data?.predictions || []);
      setZoneLabel(zoneName);
      setSourceDescription(predictionResponse.data?.source || '');
      setUpdatedAt(predictionResponse.data?.updated_at || null);
      setCalmZones(calmResponse.data?.calm_zones || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de charger les previsions du dashboard.');
      setPredictions([]);
      setCalmZones([]);
    } finally {
      setLoading(false);
    }
  }, [focusHour, profile.mainZone, zones]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const sectors = useMemo(
    () =>
      predictions.map((prediction, index) => ({
        ...prediction,
        id: `${profile.mainZone}-${index}`,
        zoneLabel: prediction.zone_label || `${zoneLabel} secteur ${index + 1}`,
      })),
    [predictions, profile.mainZone, zoneLabel]
  );

  const densityData = useMemo(
    () =>
      sectors
        .filter((sector) => sector.location?.lat != null && sector.location?.lng != null)
        .map((sector) => ({
          location: sector.location,
          density: sector.density,
          confidence: sector.confidence || 0.7,
        })),
    [sectors]
  );

  const avgDensity = sectors.length
    ? sectors.reduce((sum, sector) => sum + (sector.density || 0), 0) / sectors.length
    : 0;
  const maxDensity = sectors.length ? Math.max(...sectors.map((sector) => sector.density || 0)) : 0;
  const bestSector = [...sectors].sort((left, right) => (left.density || 0) - (right.density || 0))[0];
  const projection = projectionFor(avgDensity, maxDensity, focusHour);
  const peakSlot = [...projection].sort((left, right) => right.density - left.density)[0];
  const objective = OBJECTIVE_OPTIONS.find((option) => option.id === profile.objective) || OBJECTIVE_OPTIONS[1];
  const crowdTolerance =
    CROWD_TOLERANCE_OPTIONS.find((option) => option.id === profile.crowdTolerance) || CROWD_TOLERANCE_OPTIONS[0];
  const progress = completionRatio(profile);
  const morningHour = parseHour(profile.morningDeparture, 8);
  const eveningHour = parseHour(profile.eveningReturn, 18);
  const morningSlot = projection.find((point) => point.hour === morningHour) || projection[0];
  const eveningSlot = projection.find((point) => point.hour === eveningHour) || projection[projection.length - 1];
  const morningSuggestion = findSuggestedSlot(projection, morningHour, crowdTolerance.threshold);
  const eveningSuggestion = findSuggestedSlot(projection, eveningHour, crowdTolerance.threshold);

  const tripMoments = [
    {
      id: 'morning',
      label: 'Aller',
      time: profile.morningDeparture,
      slot: morningSlot,
      suggestion: morningSuggestion,
      recommendation: buildMomentRecommendation({
        label: 'Aller',
        targetHour: morningHour,
        targetSlot: morningSlot,
        suggestedSlot: morningSuggestion,
        threshold: crowdTolerance.threshold,
        objectiveLabel: objective.label,
      }),
    },
    {
      id: 'evening',
      label: 'Retour',
      time: profile.eveningReturn,
      slot: eveningSlot,
      suggestion: eveningSuggestion,
      recommendation: buildMomentRecommendation({
        label: 'Retour',
        targetHour: eveningHour,
        targetSlot: eveningSlot,
        suggestedSlot: eveningSuggestion,
        threshold: crowdTolerance.threshold,
        objectiveLabel: objective.label,
      }),
    },
  ];

  const activeTrip = tripMoments.find((moment) => moment.id === selectedMoment) || tripMoments[0];
  const mood = densityMeta(activeTrip?.slot?.density || avgDensity);
  const displayName = user?.first_name?.trim() || user?.username || 'voyageur';
  const greeting = greetingFor(liveTime);
  const enabledNotificationCount = Object.values(profile.notifications).filter(Boolean).length;
  const enabledConsents = Object.values(profile.consents).filter(Boolean).length;
  const heroRouteLabel = `${profile.homeLabel || 'Domicile'} -> ${profile.workLabel || 'Travail / ecole'}`;
  const nextCalmZone = calmZones[0];
  const mapHighlight = bestSector?.location
    ? { lat: bestSector.location.lat, lng: bestSector.location.lng, name: bestSector.zoneLabel }
    : null;

  const smartSuggestions = [
    activeTrip?.recommendation?.text,
    nextCalmZone
      ? `${nextCalmZone.name} reste une zone refuge si vous avez besoin d'une pause sur le trajet.`
      : 'Aucune zone refuge supplementaire n est remontee pour le moment.',
    `Mode privilegie : ${formatTransportList(profile.transports)}.`,
    enabledNotificationCount
      ? `${enabledNotificationCount} type(s) de notification active(s) pour vous prevenir au bon moment.`
      : 'Aucune notification active, pensez a en garder au moins une pour les alertes utiles.',
  ];

  const updateField = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const toggleTransport = (transportId) => {
    setProfile((current) => {
      const alreadySelected = current.transports.includes(transportId);
      const nextTransports = alreadySelected
        ? current.transports.filter((item) => item !== transportId)
        : [...current.transports, transportId];
      return {
        ...current,
        transports: nextTransports.length ? nextTransports : current.transports,
      };
    });
  };

  const toggleNestedValue = (section, key) => {
    setProfile((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: !current[section][key],
      },
    }));
  };

  return (
    <div className="dashboard-page dashboard-room dashboard-personal-page">
      <section className="dashboard-personal-hero">
        <div className="dashboard-personal-hero-main">
          <div className="dashboard-personal-kicker">
            <Sparkles size={15} />
            Dashboard personnalise
          </div>
          <h1>{greeting}, {displayName}</h1>
          <p>
            SafePath adapte maintenant le dashboard a vos lieux cles, vos habitudes de deplacement et votre tolerance a la
            foule, pour vous donner une recommandation utile des la connexion.
          </p>
          <div className="dashboard-hero-pills">
            <span><MapPin size={14} /> {zoneLabel}</span>
            <span><Gauge size={14} /> {objective.shortLabel}</span>
            <span><ShieldCheck size={14} /> {crowdTolerance.shortLabel}</span>
          </div>
          <div className="dashboard-hero-grid">
            <article className="dashboard-hero-stat">
              <span>Ton trajet habituel</span>
              <strong>{heroRouteLabel}</strong>
              <small>{formatTransportList(profile.transports)}</small>
            </article>
            <article className={`dashboard-hero-stat tone-${mood.tone}`}>
              <span>Densite prevue aujourd hui</span>
              <strong>{pct(activeTrip?.slot?.density || avgDensity)}</strong>
              <small>{activeTrip?.label} vers {activeTrip?.time || hourText(focusHour)}</small>
            </article>
            <article className="dashboard-hero-stat tone-accent">
              <span>Recommandation rapide</span>
              <strong>{activeTrip?.suggestion ? hourText(activeTrip.suggestion.hour) : hourText(focusHour)}</strong>
              <small>{activeTrip?.recommendation?.headline}</small>
            </article>
          </div>
        </div>

        <aside className="dashboard-personal-hero-side">
          <div className="dashboard-side-card">
            <span className="dashboard-side-label">Onboarding rapide</span>
            <strong>{progress.completed}/{progress.total} questions renseignees</strong>
            <div className="dashboard-progress">
              <span style={{ width: `${progress.percentage}%` }} />
            </div>
            <p>
              Quelques infos suffisent pour personnaliser trajets, previsions et horaires conseilles sans alourdir
              l inscription.
            </p>
          </div>

          <div className="dashboard-side-card">
            <span className="dashboard-side-label">Actions rapides</span>
            <div className="dashboard-quick-links">
              <Link to="/trajet" className="dashboard-quick-link">
                <RouteIcon size={16} />
                <span>Calculer un trajet</span>
              </Link>
              <Link to="/exploration" className="dashboard-quick-link">
                <LocateFixed size={16} />
                <span>Ouvrir la carte</span>
              </Link>
            </div>
            <small>Mise a jour {formatUpdateTime(updatedAt, liveTime)}</small>
          </div>
        </aside>
      </section>

      {error && (
        <div className="dashboard-inline-error">
          <TriangleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="dashboard-personal-layout">
        <section className="dashboard-panel-card dashboard-setup-card">
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-eyebrow">Configuration personnelle</span>
              <h2>Votre espace utile en 5 reponses</h2>
            </div>
            <span className="dashboard-panel-pill"><Check size={14} /> {progress.percentage}% complete</span>
          </div>
          <div className="dashboard-checklist">
            <span className={profile.homeLabel ? 'done' : ''}>1. Domicile</span>
            <span className={profile.workLabel ? 'done' : ''}>2. Lieu frequent</span>
            <span className={profile.transports.length ? 'done' : ''}>3. Transport</span>
            <span className={profile.morningDeparture && profile.eveningReturn ? 'done' : ''}>4. Horaires</span>
            <span className={profile.objective && profile.crowdTolerance ? 'done' : ''}>5. Foule et priorite</span>
          </div>
          <div className="dashboard-form-grid">
            <label className="dashboard-field">
              <span>Zone suivie</span>
              <select value={profile.mainZone} onChange={(event) => updateField('mainZone', event.target.value)}>
                {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
              </select>
            </label>
            <label className="dashboard-field">
              <span>Domicile</span>
              <div className="dashboard-input-shell">
                <Home size={16} />
                <input type="text" value={profile.homeLabel} onChange={(event) => updateField('homeLabel', event.target.value)} placeholder="Ex: Paris 11e" />
              </div>
            </label>
            <label className="dashboard-field">
              <span>Travail / ecole</span>
              <div className="dashboard-input-shell">
                <BriefcaseBusiness size={16} />
                <input type="text" value={profile.workLabel} onChange={(event) => updateField('workLabel', event.target.value)} placeholder="Ex: La Defense" />
              </div>
            </label>
            <div className="dashboard-field dashboard-field-full">
              <span>Moyens de transport preferes</span>
              <div className="dashboard-choice-row">
                {TRANSPORT_OPTIONS.map(({ id, label, Icon }) => (
                  <button key={id} type="button" className={`dashboard-choice-chip ${profile.transports.includes(id) ? 'active' : ''}`} onClick={() => toggleTransport(id)}>
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="dashboard-field">
              <span>Depart habituel</span>
              <div className="dashboard-input-shell">
                <Clock3 size={16} />
                <input type="time" value={profile.morningDeparture} onChange={(event) => updateField('morningDeparture', event.target.value)} />
              </div>
            </label>
            <label className="dashboard-field">
              <span>Retour habituel</span>
              <div className="dashboard-input-shell">
                <CalendarClock size={16} />
                <input type="time" value={profile.eveningReturn} onChange={(event) => updateField('eveningReturn', event.target.value)} />
              </div>
            </label>
            <div className="dashboard-field dashboard-field-full">
              <span>Objectif principal</span>
              <div className="dashboard-segmented-row">
                {OBJECTIVE_OPTIONS.map((option) => (
                  <button key={option.id} type="button" className={`dashboard-segment ${profile.objective === option.id ? 'active' : ''}`} onClick={() => updateField('objective', option.id)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="dashboard-field dashboard-field-full">
              <span>Tolerance a la densite</span>
              <div className="dashboard-segmented-row">
                {CROWD_TOLERANCE_OPTIONS.map((option) => (
                  <button key={option.id} type="button" className={`dashboard-segment ${profile.crowdTolerance === option.id ? 'active' : ''}`} onClick={() => updateField('crowdTolerance', option.id)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="dashboard-field">
              <span>Notifications</span>
              <div className="dashboard-toggle-list">
                {NOTIFICATION_OPTIONS.map((option) => (
                  <label key={option.id} className="dashboard-toggle">
                    <input type="checkbox" checked={profile.notifications[option.id]} onChange={() => toggleNestedValue('notifications', option.id)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="dashboard-field">
              <span>Consentements sensibles</span>
              <div className="dashboard-toggle-list">
                {CONSENT_OPTIONS.map((option) => (
                  <label key={option.id} className="dashboard-toggle">
                    <input type="checkbox" checked={profile.consents[option.id]} onChange={() => toggleNestedValue('consents', option.id)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-panel-card dashboard-map-card">
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-eyebrow">Carte centree sur vous</span>
              <h2>Zone quotidienne et heatmap de densite</h2>
            </div>
            <div className="dashboard-moment-switch">
              {Object.entries(MOMENT_LABELS).map(([momentId, label]) => (
                <button key={momentId} type="button" className={selectedMoment === momentId ? 'active' : ''} onClick={() => setSelectedMoment(momentId)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="dashboard-map-status">
            <span><MapPin size={14} /> {zoneLabel}</span>
            <span><Sparkles size={14} /> {loading ? 'Actualisation en cours' : `Projection pour ${activeTrip?.time || hourText(focusHour)}`}</span>
            <span><ShieldCheck size={14} /> {sourceDescription || 'Historique + temps reel'}</span>
          </div>
          <div className="dashboard-map-stage">
            <MapComponent route={null} userLocation={userLocation} densityData={densityData} highlightedPoint={mapHighlight} />
            <div className="dashboard-map-overlay top-left">{loading ? 'Analyse...' : `Meilleur secteur: ${bestSector?.zoneLabel || zoneLabel}`}</div>
            <div className="dashboard-map-overlay top-right">{pct(activeTrip?.slot?.density || avgDensity)}</div>
            <div className="dashboard-map-overlay bottom-left">Pic estime vers {hourText(peakSlot?.hour || focusHour)}</div>
          </div>
        </section>

        <section className="dashboard-panel-card dashboard-suggestions-card">
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-eyebrow">Suggestions intelligentes</span>
              <h2>Le bon moment pour partir</h2>
            </div>
            <span className={`dashboard-panel-pill tone-${mood.tone}`}><BellRing size={14} /> {mood.label}</span>
          </div>
          <div className="dashboard-trip-grid">
            {tripMoments.map((moment) => {
              const status = densityMeta(moment.slot?.density || 0);
              return (
                <article
                  key={moment.id}
                  className={`dashboard-trip-card ${selectedMoment === moment.id ? 'active' : ''}`}
                  onClick={() => setSelectedMoment(moment.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedMoment(moment.id);
                    }
                  }}
                >
                  <div className="dashboard-trip-top">
                    <div>
                      <span>{moment.label}</span>
                      <strong>{moment.time}</strong>
                    </div>
                    <small className={`tone-${status.tone}`}>{status.label}</small>
                  </div>
                  <div className="dashboard-density-bar">
                    <span style={{ width: `${Math.round((moment.slot?.density || 0) * 100)}%` }} />
                  </div>
                  <p>{moment.recommendation.headline}</p>
                </article>
              );
            })}
          </div>
          <div className="dashboard-recommendation-callout">
            <strong>{activeTrip?.recommendation?.headline}</strong>
            <p>{activeTrip?.recommendation?.text}</p>
          </div>
          <div className="dashboard-suggestion-list">
            {smartSuggestions.map((suggestion) => (
              <article key={suggestion} className="dashboard-note">
                <Sparkles size={14} />
                <span>{suggestion}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-panel-card dashboard-learning-card">
          <div className="dashboard-panel-head">
            <div>
              <span className="dashboard-eyebrow">Confiance et apprentissage</span>
              <h2>Ce que SafePath personalise</h2>
            </div>
            <span className="dashboard-panel-pill"><SlidersHorizontal size={14} /> Sous votre controle</span>
          </div>
          <div className="dashboard-learning-grid">
            <article className="dashboard-learning-box">
              <span>Resume du profil</span>
              <strong>{objective.label}</strong>
              <p>
                Trajet habituel entre {profile.homeLabel || 'votre domicile'} et {profile.workLabel || 'votre lieu frequent'},
                avec {formatTransportList(profile.transports).toLowerCase()} et une tolerance {crowdTolerance.label.toLowerCase()}.
              </p>
            </article>
            <article className="dashboard-learning-box">
              <span>Notifications actives</span>
              <strong>{enabledNotificationCount}/3 canaux</strong>
              <p>Trafic, horaires et signaux temps reel peuvent vous prevenir si la densite change avant votre depart.</p>
            </article>
            <article className="dashboard-learning-box">
              <span>Donnees sensibles</span>
              <strong>{enabledConsents}/2 consentements</strong>
              <p>L historique des deplacements et la geolocalisation en temps reel restent optionnels. Vous choisissez ce qui est active.</p>
            </article>
            <article className="dashboard-learning-box">
              <span>Apprentissage progressif</span>
              <strong>Personnalisation evolutive</strong>
              <p>A mesure de vos connexions, SafePath pourra confirmer vos heures habituelles, les modes reels utilises et les trajets frequents.</p>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
