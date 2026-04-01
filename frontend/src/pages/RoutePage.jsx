import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

import MapComponent from '../components/MapComponent';
import PanoramaModal from '../components/PanoramaModal';
import RouteForm from '../components/RouteForm';
import StreetViewPanorama from '../components/StreetViewPanorama';
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

const MODE_META = {
  transit: {
    label: 'Transport',
    subtitle: 'Métro, bus, RER…',
    Icon: TrainFront,
  },
  walking: {
    label: 'A pied',
    subtitle: 'Trajet direct',
    Icon: Footprints,
  },
  bike: {
    label: 'Velo',
    subtitle: 'Moyenne distance',
    Icon: Bike,
  },
  car: {
    label: 'Voiture',
    subtitle: 'Axes & trafic',
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
  const [searchParams] = useSearchParams();
  const routeIntentRef = useRef(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);
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

  const routeIntent = useMemo(() => {
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    const arrivee = (searchParams.get('arrivee') || searchParams.get('destination') || searchParams.get('name') || '').trim();
    const address = (searchParams.get('address') || '').trim();

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        key: `${lat}:${lng}:${arrivee}:${address}`,
        destination: {
          lat,
          lng,
          name: arrivee || 'Destination',
          address: address || arrivee || 'Destination',
        },
      };
    }

    if (arrivee) {
      return {
        key: `query:${arrivee}`,
        destination: {
          query: arrivee,
          name: arrivee,
          address: address || arrivee,
        },
      };
    }

    return null;
  }, [searchParams]);

  useEffect(() => {
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

  useEffect(() => {
    if (!routeIntent || !userLocation || loading) {
      return;
    }

    if (routeIntentRef.current === routeIntent.key) {
      return;
    }

    routeIntentRef.current = routeIntent.key;

    handleCalculateRoute(
      {
        lat: userLocation.lat,
        lng: userLocation.lng,
        name: 'Ma position',
      },
      routeIntent.destination
    );
  }, [routeIntent, userLocation, loading]);

  const handleCalculateRoute = async (origin, destination, options = {}) => {
    setLoading(true);
    setRouteError(null);

    try {
      const payload = {
        origin,
        destination,
        preferences: DEFAULT_USER_PREFERENCES,
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
          label: 'Duree',
          value: formatMinutes(selectedRoute.estimated_time || selectedRoute.duration_minutes),
          meta: formatMeters(selectedRoute.distance || selectedRoute.distance_m),
        },
        {
          label: 'Depart',
          value: formatDateTime(selectedRoute.departure_time),
          meta: selectedRoute.arrival_time ? formatDateTime(selectedRoute.arrival_time) : 'Direct',
        },
        {
          label: 'Mode choisi',
          value: selectedRoute.mode_label || MODE_META[selectedMode]?.label || 'Trajet',
          meta: `${selectedRoute.comfort?.calm_score || 0}/100 calme • ${formatFare(selectedRoute.fare)}`,
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
              <Sparkles size={14} /> Itineraire SafePath
            </span>
            <h1>Trouvez un trajet plus vite.</h1>
            <p>Entrez votre destination, choisissez un mode, puis consultez la carte et les etapes dans le meme flux.</p>

            <div className="journey-hero-trust">
              <div className="journey-trust-card">
                <ShieldCheck size={18} />
                <div>
                  <strong>Données agrégées</strong>
                  <span>Navitia, densité, trafic.</span>
                </div>
              </div>
              <div className="journey-trust-card">
                <Waves size={18} />
                <div>
                  <strong>Vue claire</strong>
                  <span>Carte + ligne du temps + panorama.</span>
                </div>
              </div>
            </div>

            <div className="journey-hero-steps" aria-label="Etapes rapides">
              <span className="journey-hero-step">1. Saisir le trajet</span>
              <span className="journey-hero-step">2. Choisir un mode</span>
              <span className="journey-hero-step">3. Suivre la meilleure option</span>
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
                <p>Choisissez un mode ou une option pour mettre a jour la carte, les horaires et les etapes.</p>
              </div>
            </div>

            <div className="journey-summary-grid">
              {highlightCards.map((card) => (
                <div key={card.label} className="journey-summary-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <p>{card.meta}</p>
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
                  <span>Comment vous déplacez-vous ?</span>
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
                    <span>{selectedModeRoutes.length} option(s) pour ce mode</span>
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
                          <strong>{route.recommended ? 'Recommandee' : `Option ${index + 1}`}</strong>
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

            {routeHistory.length > 0 && (
              <section className="journey-card journey-card-floating journey-history-card">
                <div className="journey-card-head">
                  <div>
                    <h2>Recents</h2>
                    <span>Vos derniers trajets</span>
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
          </aside>

          <section className="journey-stage">
            {selectedRoute ? (
              <>
                <article className="journey-card journey-map-card">
                  <div className="journey-card-head">
                    <div>
                      <h2>Carte du trajet</h2>
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
                        <span>{(selectedRoute.segments || []).length} etape(s)</span>
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
                          <h2>Lignes et horaires</h2>
                          <span>Les infos utiles pour partir</span>
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
                          <h2>Infos utiles</h2>
                          <span>Arrets, perturbations et contexte</span>
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
                          <h2>Vue du lieu</h2>
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
                        <p className="journey-panorama-caption">Cliquez sur une etape pour changer le point.</p>
                      </div>
                    </article>
                  </div>
                </div>
              </>
            ) : (
              <section className="journey-empty-state">
                <span className="journey-kicker">
                  <Sparkles size={14} /> Itineraire
                </span>
                <h2>Entrez un depart et une arrivee.</h2>
                <p>Saisissez votre trajet pour voir directement la carte, le meilleur mode et les etapes a suivre.</p>
                <div className="journey-empty-features">
                  <span>
                    <TrainFront size={16} /> Modes compares
                  </span>
                  <span>
                    <MapPin size={16} /> Carte et etapes
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
    </div>
  );
}
