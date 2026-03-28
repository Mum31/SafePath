import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Bus,
  CarFront,
  CheckCircle2,
  Clock3,
  Download,
  Footprints,
  Gauge,
  MapPin,
  Maximize2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Waves,
} from 'lucide-react';

import ApiStatus from '../components/ApiStatus';
import EmergencyButton from '../components/EmergencyButton';
import MapComponent from '../components/MapComponent';
import PanoramaModal from '../components/PanoramaModal';
import RouteForm from '../components/RouteForm';
import StreetViewPanorama from '../components/StreetViewPanorama';
import StressFilters from '../components/StressFilters';
import '../App.css';
import { api } from '../services/api';
import { buildStreetPreviewUrl } from '../utils/placePreview';

const DEFAULT_USER_PREFERENCES = {
  maxDensity: 0.7,
  avoidMainRoads: true,
  preferParks: true,
  noiseSensitivity: 5,
  walkingSpeed: 1.4,
  considerPublicTransport: true,
  transportFactor: 0.15,
};

const USER_ID_STORAGE_KEY = 'safepath.route.userId';

const MODE_META = {
  transit: {
    label: 'Transport',
    subtitle: 'Metro, RER, train, tram, bus',
    Icon: TrainFront,
  },
  walking: {
    label: 'A pied',
    subtitle: 'Le plus simple pour les trajets directs',
    Icon: Footprints,
  },
  bike: {
    label: 'Velo',
    subtitle: 'Rapide sur moyenne distance',
    Icon: Bike,
  },
  car: {
    label: 'Voiture',
    subtitle: 'Lecture trafic et axes routiers',
    Icon: CarFront,
  },
};

const TRANSPORT_LABELS = {
  metro: 'Metro',
  rer: 'RER',
  rail: 'Train',
  train: 'Train',
  tram: 'Tram',
  bus: 'Bus',
  coach: 'Bus',
  transit: 'Transport',
  walking: 'A pied',
  bike: 'Velo',
  car: 'Voiture',
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPersistentUserId() {
  try {
    const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const generated = `user_${Date.now()}`;
    window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `user_${Date.now()}`;
  }
}

function mapPreferencesResponse(payload = {}) {
  return {
    maxDensity: toNumber(payload.max_crowd_density, DEFAULT_USER_PREFERENCES.maxDensity),
    avoidMainRoads:
      payload.avoid_main_roads == null ? DEFAULT_USER_PREFERENCES.avoidMainRoads : Boolean(payload.avoid_main_roads),
    preferParks: payload.prefer_parks == null ? DEFAULT_USER_PREFERENCES.preferParks : Boolean(payload.prefer_parks),
    noiseSensitivity: toNumber(payload.noise_sensitivity, DEFAULT_USER_PREFERENCES.noiseSensitivity),
    walkingSpeed: toNumber(payload.walking_speed, DEFAULT_USER_PREFERENCES.walkingSpeed),
    considerPublicTransport:
      payload.consider_public_transport == null
        ? DEFAULT_USER_PREFERENCES.considerPublicTransport
        : Boolean(payload.consider_public_transport),
    transportFactor: toNumber(payload.transport_factor, DEFAULT_USER_PREFERENCES.transportFactor),
  };
}

function formatMinutes(value) {
  const minutes = toNumber(value, 0);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remaining = Math.round(minutes % 60);
    return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
  }
  return `${Math.max(1, Math.round(minutes))} min`;
}

function formatMeters(value) {
  const meters = toNumber(value, 0);
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDateTime(value) {
  if (!value) {
    return 'Non communique';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatFare(fare) {
  const amount = toNumber(fare?.value, NaN);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Inclus reseau';
  }
  const rawCurrency = String(fare?.currency || 'EUR').trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'EUR';

  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function normalizeLineColor(color, fallback = '#163247') {
  if (!color) {
    return fallback;
  }

  const normalized = String(color).trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3,8}$/.test(normalized)) {
    return fallback;
  }

  return `#${normalized}`;
}

function getTransportLabel(item = {}) {
  const modeKey = String(item.mode_family || item.mode || '').toLowerCase();
  return TRANSPORT_LABELS[modeKey] || item.mode || 'Transport';
}

function buildPreviewTarget(source, fallback = {}) {
  if (!source) {
    return null;
  }

  const coord =
    source.coord ||
    source.location ||
    source.from_coord ||
    source.to_coord ||
    (source.lat != null && source.lng != null ? { lat: source.lat, lng: source.lng } : null);

  if (coord?.lat == null || coord?.lng == null) {
    return null;
  }

  return {
    lat: toNumber(coord.lat),
    lng: toNumber(coord.lng),
    name:
      source.name ||
      source.label ||
      source.title ||
      source.departure_stop ||
      source.arrival_stop ||
      fallback.name ||
      'Point du trajet',
    address:
      source.address ||
      source.detail ||
      source.direction ||
      fallback.address ||
      fallback.name ||
      '',
  };
}

function TransportMix({ mix = [] }) {
  if (!mix.length) {
    return <span className="journey-chip muted">Direct</span>;
  }

  return (
    <div className="journey-mix-list">
      {mix.map((item) => (
        <span key={`${item.mode_family}-${item.code || item.name || item.count}`} className="journey-chip">
          {getTransportLabel(item)}
          {item.code ? ` ${item.code}` : ''}
          {item.count > 1 ? ` x${item.count}` : ''}
        </span>
      ))}
    </div>
  );
}

function LineBadge({ line = {} }) {
  const bg = normalizeLineColor(line.color, '#12384d');
  const color = normalizeLineColor(line.text_color, '#ffffff');
  const label = line.code || line.name || getTransportLabel(line);

  return (
    <span
      className="journey-line-badge"
      style={{
        backgroundColor: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}

function SegmentIcon({ segment, size = 16 }) {
  if (segment.type === 'public_transport') {
    if (segment.mode_family === 'bus') {
      return <Bus size={size} />;
    }
    return <TrainFront size={size} />;
  }

  if (segment.mode === 'bike') {
    return <Bike size={size} />;
  }

  if (segment.mode === 'car') {
    return <CarFront size={size} />;
  }

  if (segment.type === 'waiting' || segment.type === 'transfer') {
    return <Clock3 size={size} />;
  }

  return <Footprints size={size} />;
}

function SegmentCard({ index, segment, onPreview }) {
  const previewTarget = buildPreviewTarget(segment, {
    name: segment.arrival_stop || segment.departure_stop || segment.label,
    address: segment.detail,
  });

  return (
    <article className="journey-step">
      <div className="journey-step-index">{index + 1}</div>
      <div className="journey-step-main">
        <div className="journey-step-top">
          <div className="journey-step-title">
            <span className="journey-step-icon-wrap">
              <SegmentIcon segment={segment} />
            </span>
            <div>
              <strong>{segment.label || 'Etape'}</strong>
              <p>{segment.detail || getTransportLabel(segment)}</p>
            </div>
          </div>

          <div className="journey-step-side">
            <span className="journey-chip muted">{formatMinutes((segment.duration || 0) / 60)}</span>
            {previewTarget && (
              <button type="button" className="journey-inline-action" onClick={() => onPreview(previewTarget)}>
                <MapPin size={14} /> Voir
              </button>
            )}
          </div>
        </div>

        <div className="journey-step-meta">
          <span>{formatMeters(segment.distance || 0)}</span>
          {segment.departure_time && <span>{formatDateTime(segment.departure_time)}</span>}
          {segment.arrival_time && <span>{formatDateTime(segment.arrival_time)}</span>}
        </div>

        {segment.type === 'public_transport' && segment.line && (
          <div className="journey-step-route">
            <LineBadge line={segment.line} />
            <span>{segment.departure_stop || 'Depart'}</span>
            <span className="journey-route-arrow">{'>'}</span>
            <span>{segment.arrival_stop || 'Arrivee'}</span>
            {segment.stop_count > 0 && <span>{segment.stop_count} arret(s)</span>}
          </div>
        )}

        {segment.intermediate_stops?.length > 0 && (
          <div className="journey-step-stops">
            {segment.intermediate_stops.slice(0, 4).map((stop) => (
              <button
                key={`${segment.label}-${stop.name}-${stop.arrival_time || stop.departure_time || ''}`}
                type="button"
                className="journey-stop-pill"
                onClick={() =>
                  onPreview(
                    buildPreviewTarget(stop, {
                      name: stop.name,
                      address: stop.name,
                    })
                  )
                }
              >
                {stop.name}
              </button>
            ))}
            {segment.intermediate_stops.length > 4 && (
              <span className="journey-stop-pill muted">+{segment.intermediate_stops.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function RoutePage() {
  const userIdRef = useRef(getPersistentUserId());
  const [userLocation, setUserLocation] = useState(null);
  const [apiStatus, setApiStatus] = useState('Verification...');
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [userPreferences, setUserPreferences] = useState(DEFAULT_USER_PREFERENCES);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [primaryRoute, setPrimaryRoute] = useState(null);
  const [routeOptions, setRouteOptions] = useState({});
  const [selectedMode, setSelectedMode] = useState('transit');
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [originPlace, setOriginPlace] = useState(null);
  const [destinationPlace, setDestinationPlace] = useState(null);
  const [routeMetadata, setRouteMetadata] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [panoramaOpen, setPanoramaOpen] = useState(false);
  const [routeHistory, setRouteHistory] = useState([]);

  const modeCounts = useMemo(
    () =>
      Object.keys(MODE_META).reduce((accumulator, mode) => {
        accumulator[mode] = routeOptions[mode]?.length || 0;
        return accumulator;
      }, {}),
    [routeOptions]
  );

  const selectedModeRoutes = useMemo(() => routeOptions[selectedMode] || [], [routeOptions, selectedMode]);

  const selectedRoute = useMemo(() => {
    if (selectedModeRoutes.length) {
      return selectedModeRoutes.find((route) => route.id === selectedRouteId) || selectedModeRoutes[0];
    }

    return primaryRoute;
  }, [primaryRoute, selectedModeRoutes, selectedRouteId]);

  const previewFallback = useMemo(() => {
    const point = previewTarget || selectedRoute?.preview_point || destinationPlace;
    const previewUrl = point
      ? buildStreetPreviewUrl({
          lat: point.lat ?? point.coord?.lat,
          lng: point.lng ?? point.coord?.lng,
          width: 1200,
          height: 700,
        })
      : null;

    if (previewUrl) {
      return (
        <img
          src={previewUrl}
          alt={point?.name || 'Apercu du lieu'}
          className="journey-panorama-image"
          loading="lazy"
        />
      );
    }

    return (
      <div className="journey-panorama-placeholder">
        <MapPin size={18} />
        <span>Le panorama n'est pas disponible pour ce point. La carte reste active juste au-dessus.</span>
      </div>
    );
  }, [destinationPlace, previewTarget, selectedRoute]);

  const heroFacts = useMemo(
    () => [
      {
        label: 'Modes compares',
        value: Object.values(modeCounts).reduce((total, count) => total + count, 0) || '4',
      },
      {
        label: 'Source transport',
        value: 'IDFM / Navitia',
      },
      {
        label: 'Panorama',
        value: '360 interactif',
      },
    ],
    [modeCounts]
  );

  useEffect(() => {
    const loadBootData = async () => {
      try {
        await api.get('/test/');
        setApiStatus('API connectee');
      } catch {
        setApiStatus('API non connectee');
      }
    };

    loadBootData();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => setUserLocation({ lat: 48.8566, lng: 2.3522 })
      );
    } else {
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadUserPreferences = async () => {
      try {
        const response = await api.get('/user-preferences/', {
          params: { user_id: userIdRef.current },
        });
        if (isMounted && response.data?.user_id) {
          setUserPreferences(mapPreferencesResponse(response.data));
        }
      } catch {
        if (isMounted) {
          setUserPreferences(DEFAULT_USER_PREFERENCES);
        }
      } finally {
        if (isMounted) {
          setPreferencesHydrated(true);
        }
      }
    };

    loadUserPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        await api.post('/user-preferences/', {
          user_id: userIdRef.current,
          max_crowd_density: userPreferences.maxDensity,
          avoid_main_roads: userPreferences.avoidMainRoads,
          prefer_parks: userPreferences.preferParks,
          noise_sensitivity: userPreferences.noiseSensitivity,
          walking_speed: userPreferences.walkingSpeed,
          consider_public_transport: userPreferences.considerPublicTransport,
          transport_factor: userPreferences.transportFactor,
        });
      } catch {
        // Preferences are still kept locally even if persistence fails.
      }
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [preferencesHydrated, userPreferences]);

  useEffect(() => {
    if (!selectedModeRoutes.length) {
      setSelectedRouteId(null);
      return;
    }

    const routeStillExists = selectedModeRoutes.some((route) => route.id === selectedRouteId);
    if (!routeStillExists) {
      setSelectedRouteId(selectedModeRoutes[0].id);
    }
  }, [selectedModeRoutes, selectedRouteId]);

  useEffect(() => {
    if (!selectedRoute) {
      return;
    }

    const nextPreview =
      buildPreviewTarget(selectedRoute.preview_point, {
        name: destinationPlace?.name,
        address: destinationPlace?.address,
      }) ||
      buildPreviewTarget(destinationPlace) ||
      buildPreviewTarget((selectedRoute.stops || [])[0]);

    setPreviewTarget(nextPreview);
  }, [destinationPlace, selectedRoute]);

  const handleCalculateRoute = async (origin, destination, options = {}) => {
    setLoading(true);
    setRouteError(null);

    try {
      const payload = {
        origin,
        destination,
        user_id: userIdRef.current,
        preferences: userPreferences,
        modes: Object.keys(MODE_META),
        preferred_mode: selectedMode,
        ...options,
      };

      const response = await api.post('/calculate-route/', payload);
      const data = response.data || {};
      const nextRouteOptions = data.route_options || {};
      const nextSelectedMode = data.selected_mode || data.route?.mode || 'transit';
      const nextModeRoutes = nextRouteOptions[nextSelectedMode] || [];

      setPrimaryRoute(data.route || null);
      setRouteOptions(nextRouteOptions);
      setSelectedMode(nextSelectedMode);
      setSelectedRouteId((nextModeRoutes[0] || data.route)?.id || null);
      setOriginPlace(data.origin_place || data.route?.origin_place || null);
      setDestinationPlace(data.destination_place || data.route?.destination_place || null);
      setRouteMetadata(data.metadata || null);

      const preview =
        buildPreviewTarget(data.route?.preview_point) ||
        buildPreviewTarget(data.destination_place) ||
        buildPreviewTarget(data.route?.destination_place);
      setPreviewTarget(preview);

      setRouteHistory((previous) => {
        const entry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          origin: data.origin_place?.name || origin?.name || origin?.query || 'Depart',
          destination: data.destination_place?.name || destination?.name || destination?.query || 'Arrivee',
          mode: nextSelectedMode,
          duration: data.route?.estimated_time || data.route?.duration_minutes || 0,
          calmScore: data.route?.comfort?.calm_score || 0,
        };
        return [entry, ...previous].slice(0, 4);
      });
    } catch (error) {
      setRouteError(error.response?.data?.error || 'Impossible de calculer le trajet pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPrimaryRoute(null);
    setRouteOptions({});
    setSelectedRouteId(null);
    setRouteMetadata(null);
    setOriginPlace(null);
    setDestinationPlace(null);
    setPreviewTarget(null);
    setRouteError(null);
  };

  const handleExportGpx = () => {
    if (!selectedRoute?.path?.length) {
      return;
    }

    const gpxContent = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="SafePath">',
      '  <trk>',
      `    <name>${originPlace?.name || 'Depart'} - ${destinationPlace?.name || 'Arrivee'}</name>`,
      '    <trkseg>',
      ...selectedRoute.path.map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}" />`),
      '    </trkseg>',
      '  </trk>',
      '</gpx>',
    ].join('\n');

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `safepath-${Date.now()}.gpx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const highlightCards = selectedRoute
    ? [
        {
          label: 'Duree estimee',
          value: formatMinutes(selectedRoute.estimated_time || selectedRoute.duration_minutes),
          note: `${formatMeters(selectedRoute.distance || selectedRoute.distance_m)} sur le parcours`,
        },
        {
          label: 'Depart',
          value: formatDateTime(selectedRoute.departure_time),
          note: selectedRoute.arrival_time ? `Arrivee ${formatDateTime(selectedRoute.arrival_time)}` : 'En direct',
        },
        {
          label: 'Confort',
          value: `${selectedRoute.comfort?.calm_score || 0}/100`,
          note: selectedRoute.comfort?.label || 'Analyse en cours',
        },
        {
          label: 'Correspondances',
          value: String(selectedRoute.transfers || 0),
          note: formatFare(selectedRoute.fare),
        },
      ]
    : [];

  return (
    <div className="route-page route-page-navitia">
      <div className="journey-page-shell">
        <div className="journey-orb journey-orb-a" aria-hidden="true" />
        <div className="journey-orb journey-orb-b" aria-hidden="true" />

        <section className="journey-hero">
          <div className="journey-hero-copy">
            <span className="journey-kicker">
              <Sparkles size={14} /> Navigation urbaine repensee
            </span>
            <h1>Une page itineraire enfin plus claire, plus guidee et plus credible.</h1>
            <p>
              Comparez vos trajets comme dans une vraie console de mobilite: modes distincts, etapes lisibles,
              trafic, perturbations, panorama 360 et score de calme reunis dans une seule interface.
            </p>

            <div className="journey-hero-facts">
              {heroFacts.map((fact) => (
                <div key={fact.label} className="journey-hero-fact">
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>

            <div className="journey-hero-trust">
              <div className="journey-trust-card">
                <ShieldCheck size={18} />
                <div>
                  <strong>Sources synchronisees</strong>
                  <span>Navitia, trafic, meteo, densite et perturbations.</span>
                </div>
              </div>
              <div className="journey-trust-card">
                <Waves size={18} />
                <div>
                  <strong>Lecture apaisante</strong>
                  <span>Vue carte, timeline et zone immersive sans surcharge.</span>
                </div>
              </div>
            </div>
          </div>

          <RouteForm
            onCalculateRoute={handleCalculateRoute}
            userLocation={userLocation}
            loading={loading}
            error={routeError}
            onClearError={() => setRouteError(null)}
          />
        </section>

        {selectedRoute && (
          <section className="journey-command-bar">
            <div className="journey-command-main">
              <div className="journey-route-pill">
                <span>{originPlace?.name || 'Depart'}</span>
                <ArrowRight size={16} />
                <span>{destinationPlace?.name || 'Arrivee'}</span>
              </div>

              <div className="journey-command-summary">
                <h2>{routeMetadata?.recommendation_summary || selectedRoute.summary || 'Trajet recommande'}</h2>
                <p>
                  {selectedRoute.recommended ? 'Option la plus calme detectee' : 'Alternative a comparer'}{' '}
                  {routeMetadata?.calculation_time_ms ? `- calcule en ${routeMetadata.calculation_time_ms} ms` : ''}
                </p>
              </div>
            </div>

            <div className="journey-summary-grid">
              {highlightCards.map((card) => (
                <div key={card.label} className="journey-summary-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <p>{card.note}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="journey-workspace">
          <aside className="journey-sidebar">
            <section className="journey-card journey-card-floating">
              <div className="journey-card-head">
                <div>
                  <h2>Modes</h2>
                  <span>Choisissez la logique la plus adaptee a votre deplacement.</span>
                </div>
              </div>

              <div className="journey-mode-tabs">
                {Object.entries(MODE_META).map(([mode, meta]) => {
                  const Icon = meta.Icon;
                  const count = modeCounts[mode];

                  return (
                    <button
                      key={mode}
                      type="button"
                      className={`journey-mode-tab ${selectedMode === mode ? 'active' : ''}`}
                      disabled={!count && !primaryRoute}
                      onClick={() => setSelectedMode(mode)}
                    >
                      <div className="journey-mode-top">
                        <span className="journey-mode-icon">
                          <Icon size={18} />
                        </span>
                        <span className="journey-chip muted">{count || 0}</span>
                      </div>
                      <strong>{meta.label}</strong>
                      <span>{meta.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedModeRoutes.length > 0 && (
              <section className="journey-card journey-card-floating">
                <div className="journey-card-head">
                  <div>
                    <h2>Alternatives</h2>
                    <span>{selectedModeRoutes.length} proposition(s) pour ce mode.</span>
                  </div>
                </div>

                <div className="journey-options">
                  {selectedModeRoutes.map((route, index) => (
                    <button
                      key={route.id}
                      type="button"
                      className={`journey-option-card ${selectedRoute?.id === route.id ? 'active' : ''}`}
                      onClick={() => setSelectedRouteId(route.id)}
                    >
                      <div className="journey-option-top">
                        <div>
                          <strong>
                            Option {index + 1}
                            {route.recommended ? ' - Recommandee' : ''}
                          </strong>
                          <p className="journey-summary-text">{route.summary || route.comfort?.label || 'Trajet analyse'}</p>
                        </div>
                        <span className="journey-chip">{formatMinutes(route.estimated_time || route.duration_minutes)}</span>
                      </div>

                      <div className="journey-option-meta">
                        <span>{formatMeters(route.distance || route.distance_m)}</span>
                        <span>{route.comfort?.calm_score || 0}/100 calme</span>
                        <span>{route.transfers || 0} correspondance(s)</span>
                      </div>

                      <TransportMix mix={route.transport_mix} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="journey-card journey-card-floating">
              <div className="journey-card-head">
                <div>
                  <h2>Preferences de confort</h2>
                  <span>Ces reglages influencent la recommandation SafePath.</span>
                </div>
              </div>
              <StressFilters preferences={userPreferences} onPreferencesChange={setUserPreferences} />
            </section>

            {routeHistory.length > 0 && (
              <section className="journey-card journey-card-floating">
                <div className="journey-card-head">
                  <div>
                    <h2>Recherches recentes</h2>
                    <span>Pour relancer rapidement un trajet proche.</span>
                  </div>
                </div>

                <div className="journey-history-list">
                  {routeHistory.map((item) => (
                    <div key={item.id} className="journey-history-item">
                      <div>
                        <strong>
                          {item.origin} <ArrowRight size={14} /> {item.destination}
                        </strong>
                        <span>{MODE_META[item.mode]?.label || item.mode}</span>
                      </div>
                      <div className="journey-history-metrics">
                        <span>{formatMinutes(item.duration)}</span>
                        <span>{item.calmScore}/100</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="journey-card journey-card-floating">
              <ApiStatus status={apiStatus} />
            </section>
          </aside>

          <section className="journey-stage">
            {selectedRoute ? (
              <>
                <article className="journey-card journey-map-card">
                  <div className="journey-card-head">
                    <div>
                      <h2>Carte dynamique</h2>
                      <span>
                        {selectedRoute.mode_label || MODE_META[selectedMode]?.label} -{' '}
                        {selectedRoute.comfort?.average_density_pct || 0}% densite moyenne
                      </span>
                    </div>

                    <div className="journey-map-actions">
                      <button type="button" className="journey-inline-action" onClick={handleExportGpx}>
                        <Download size={15} /> GPX
                      </button>
                      <button type="button" className="journey-inline-action" onClick={() => setPanoramaOpen(true)}>
                        <Maximize2 size={15} /> Ouvrir le panorama 360
                      </button>
                      <button type="button" className="journey-inline-action" onClick={handleReset}>
                        <RotateCcw size={15} /> Reinitialiser
                      </button>
                    </div>
                  </div>

                  <div className="journey-map-wrap">
                    <MapComponent
                      route={selectedRoute}
                      userLocation={userLocation}
                      densityData={selectedRoute.density_data || []}
                      stops={selectedRoute.stops || []}
                      highlightedPoint={previewTarget}
                      originPlace={originPlace}
                      destinationPlace={destinationPlace}
                    />
                  </div>
                </article>

                <div className="journey-stage-grid">
                  <article className="journey-card">
                    <div className="journey-card-head">
                      <div>
                        <h2>Etapes du trajet</h2>
                        <span>Lecture sequentielle proche d'un calculateur moderne.</span>
                      </div>
                    </div>

                    <div className="journey-steps">
                      {(selectedRoute.segments || []).map((segment, index) => (
                        <SegmentCard key={`${segment.label}-${index}`} index={index} segment={segment} onPreview={setPreviewTarget} />
                      ))}
                    </div>
                  </article>

                  <div className="journey-stage-stack">
                    <article className="journey-card">
                      <div className="journey-card-head">
                        <div>
                          <h2>Horaires et lignes</h2>
                          <span>Depart, arrivee, reseaux et codes de ligne.</span>
                        </div>
                      </div>

                      <div className="journey-line-list">
                        {(selectedRoute.schedules || []).length > 0 ? (
                          (selectedRoute.schedules || []).map((schedule) => (
                            <div key={`${schedule.line_id}-${schedule.departure_time}`} className="journey-line-row">
                              <div className="journey-line-main">
                                <LineBadge
                                  line={{
                                    code: schedule.line_code,
                                    name: schedule.line_name,
                                    color: schedule.color,
                                    text_color: schedule.text_color,
                                  }}
                                />
                                <div>
                                  <strong>{schedule.network || getTransportLabel(schedule)}</strong>
                                  <span>
                                    {schedule.from} <span className="journey-route-arrow">{'>'}</span> {schedule.to}
                                  </span>
                                </div>
                              </div>
                              <div className="journey-line-times">
                                <strong>{formatDateTime(schedule.departure_time)}</strong>
                                <span>{formatDateTime(schedule.arrival_time)}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="journey-empty">Aucun horaire detaille disponible pour ce mode.</p>
                        )}
                      </div>

                      <div className="journey-insight-list">
                        {(selectedRoute.comfort?.rationale || []).map((reason) => (
                          <span key={reason} className="journey-insight-pill">
                            <CheckCircle2 size={14} /> {reason}
                          </span>
                        ))}
                      </div>
                    </article>

                    <article className="journey-card">
                      <div className="journey-card-head">
                        <div>
                          <h2>Arrets, perturbations et contexte</h2>
                          <span>Ce qui influence vraiment le confort du parcours.</span>
                        </div>
                      </div>

                      {(selectedRoute.stops || []).length > 0 && (
                        <div className="journey-stop-list">
                          {(selectedRoute.stops || []).slice(0, 6).map((stop) => (
                            <button
                              key={stop.id}
                              type="button"
                              className="journey-stop-row"
                              onClick={() =>
                                setPreviewTarget(
                                  buildPreviewTarget(stop, {
                                    name: stop.name,
                                    address: stop.name,
                                  })
                                )
                              }
                            >
                              <div>
                                <strong>{stop.name}</strong>
                                <span>{stop.commercial_mode || 'Arret reseau'}</span>
                              </div>
                              <MapPin size={16} />
                            </button>
                          ))}
                        </div>
                      )}

                      {(selectedRoute.disruptions || []).length > 0 ? (
                        <div className="journey-alert-stack">
                          {(selectedRoute.disruptions || []).map((disruption) => (
                            <div key={disruption.id} className="journey-alert">
                              <AlertTriangle size={16} />
                              <div>
                                <strong>{disruption.title}</strong>
                                <p>{disruption.messages?.[0] || disruption.severity || 'Perturbation en cours'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="journey-alert is-good">
                          <CheckCircle2 size={16} />
                          <div>
                            <strong>Aucune perturbation majeure</strong>
                            <p>Le reseau selectionne ne remonte pas d'alerte bloquante.</p>
                          </div>
                        </div>
                      )}

                      <div className="journey-facts">
                        <span>
                          <Gauge size={15} />
                          Trafic routier: {selectedRoute.traffic?.road_level || 'Modere'}
                        </span>
                        <span>
                          <Footprints size={15} />
                          Flux pieton: {selectedRoute.traffic?.pedestrian_level || 'Anime'}
                        </span>
                        <span>
                          <Sparkles size={15} />
                          Evenements: {selectedRoute.traffic?.events_count || 0}
                        </span>
                        <span>
                          <Clock3 size={15} />
                          Stress: {selectedRoute.total_stress || 0}/10
                        </span>
                      </div>

                      {(selectedRoute.calm_zones || []).length > 0 && (
                        <div className="journey-calm-zones">
                          <h3>Zones refuges proches</h3>
                          <div className="journey-calm-zone-list">
                            {(selectedRoute.calm_zones || []).map((zone) => (
                              <button
                                key={zone.id}
                                type="button"
                                className="journey-calm-zone-card"
                                onClick={() =>
                                  setPreviewTarget(
                                    buildPreviewTarget(zone, {
                                      name: zone.name,
                                      address: zone.type_display || zone.type,
                                    })
                                  )
                                }
                              >
                                <strong>{zone.name}</strong>
                                <span>{formatMeters(zone.distance || 0)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>

                    <article className="journey-card">
                      <div className="journey-card-head">
                        <div>
                          <h2>Apercu immersif</h2>
                          <span>
                            {previewTarget?.name || destinationPlace?.name || 'Destination'} -{' '}
                            {previewTarget?.address || destinationPlace?.address || 'Point cible'}
                          </span>
                        </div>
                      </div>

                      <div className="journey-panorama-shell">
                        <StreetViewPanorama
                          lat={previewTarget?.lat}
                          lng={previewTarget?.lng}
                          fallback={previewFallback}
                          className="journey-panorama-viewer"
                          radius={110}
                        />
                      </div>

                      <div className="journey-panorama-footer">
                        <button type="button" className="journey-inline-action" onClick={() => setPanoramaOpen(true)}>
                          <Maximize2 size={15} /> Plein ecran
                        </button>
                        <p className="journey-panorama-caption">
                          Cliquez sur une etape, un arret ou une zone calme pour changer le point d'observation.
                        </p>
                      </div>
                    </article>
                  </div>
                </div>
              </>
            ) : (
              <section className="journey-empty-state">
                <span className="journey-kicker">
                  <Sparkles size={14} /> Interface repensee
                </span>
                <h2>Entrez un depart et une arrivee pour afficher une experience bien plus lisible.</h2>
                <p>
                  La page mettra ensuite en scene les modes de transport, la timeline, le trafic, les perturbations,
                  les zones calmes et le panorama 360 sans melanger toutes les informations.
                </p>
                <div className="journey-empty-features">
                  <span>
                    <TrainFront size={16} /> Onglets transport facon calculateur moderne
                  </span>
                  <span>
                    <MapPin size={16} /> Carte, arrets, lignes et points de vue lies
                  </span>
                  <span>
                    <AlertTriangle size={16} /> Perturbations et contexte directement visibles
                  </span>
                  <span>
                    <Maximize2 size={16} /> Street View 360 integre a la page
                  </span>
                </div>
              </section>
            )}
          </section>
        </div>
      </div>

      <PanoramaModal
        open={panoramaOpen}
        onClose={() => setPanoramaOpen(false)}
        lat={previewTarget?.lat}
        lng={previewTarget?.lng}
        placeName={previewTarget?.name || destinationPlace?.name}
        address={previewTarget?.address || destinationPlace?.address || destinationPlace?.name}
        fallback={previewFallback}
      />

      <EmergencyButton
        userLocation={userLocation}
        onStartRouteToZone={(zone) => {
          if (!userLocation || !zone?.location) {
            return;
          }

          handleCalculateRoute(
            {
              lat: userLocation.lat,
              lng: userLocation.lng,
              name: 'Ma position',
            },
            {
              lat: zone.location.lat,
              lng: zone.location.lng,
              name: zone.name,
              address: zone.name,
            }
          );
        }}
      />
    </div>
  );
}
