import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  MapPin,
  Share2,
  Mail,
  Clock,
  Lightbulb,
  Info,
  Map as MapIcon,
  Users,
  BarChart3,
  Loader2,
  ArrowLeft,
  Route,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import '../App.css';

const TABS = [
  { id: 'horaires', label: "Horaires d'ouverture", icon: Clock },
  { id: 'astuces', label: 'Astuces de visite', icon: Lightbulb },
  { id: 'infos', label: 'Informations pratiques', icon: Info },
  { id: 'localisation', label: 'Localisation', icon: MapIcon },
];

function getDensityLabel(percent) {
  if (percent < 35) return { text: 'Faible', color: 'var(--color-calm)', icons: 1 };
  if (percent < 65) return { text: 'Modérée', color: 'var(--color-moderate)', icons: 2 };
  return { text: 'Dense', color: 'var(--color-dense)', icons: 3 };
}

function PersonIcons({ count }) {
  return (
    <span className="place-detail-density-icons" aria-hidden>
      {[1, 2, 3].map((i) => (
        <Users key={i} size={16} style={{ opacity: i <= count ? 1 : 0.25 }} />
      ))}
    </span>
  );
}

export default function PlaceDetailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const nameParam = searchParams.get('name') || 'Lieu';
  const name = useMemo(() => {
    try {
      return decodeURIComponent(String(nameParam));
    } catch {
      return String(nameParam || 'Lieu');
    }
  }, [nameParam]);

  const [activeTab, setActiveTab] = useState('horaires');
  const [place, setPlace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvedCoords, setResolvedCoords] = useState(null);

  const latNum = latParam != null && latParam !== '' ? parseFloat(latParam) : NaN;
  const lngNum = lngParam != null && lngParam !== '' ? parseFloat(lngParam) : NaN;
  const hasUrlCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const effectiveLat = hasUrlCoords ? latNum : (resolvedCoords?.lat ?? null);
  const effectiveLng = hasUrlCoords ? lngNum : (resolvedCoords?.lng ?? null);
  const hasCoords = effectiveLat != null && effectiveLng != null && Number.isFinite(effectiveLat) && Number.isFinite(effectiveLng);

  const previewPosition = useMemo(
    () => (hasCoords ? [effectiveLat, effectiveLng] : null),
    [hasCoords, effectiveLat, effectiveLng]
  );

  const previewIcon = useMemo(
    () =>
      L.divIcon({
        className: 'custom-marker',
        html: '<span style="background:#0f766e;width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:block;"></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    []
  );

  const fetchPlaceData = useCallback(async () => {
    if (!hasCoords) {
      if (!nameParam || String(nameParam).trim() === '') {
        setError('Coordonnées ou nom du lieu manquant.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get('/api/geocode/', { params: { q: String(nameParam).trim() }, timeout: 8000 });
        const { lat: glat, lng: glng } = res.data;
        const gLat = Number(glat);
        const gLng = Number(glng);
        if (Number.isFinite(gLat) && Number.isFinite(gLng)) {
          setResolvedCoords({ lat: gLat, lng: gLng });
          return;
        }
      } catch {
        setError("Impossible de localiser ce lieu. Vérifiez l'adresse ou ouvrez la fiche depuis la carte.");
        setLoading(false);
        return;
      }
      setError('Coordonnées introuvables pour ce lieu.');
      setLoading(false);
      return;
    }

    const latNum = effectiveLat;
    const lngNum = effectiveLng;
    setLoading(true);
    setError(null);
    const now = new Date();
    const currentHour = now.getHours();
    const next6Hours = [0, 1, 2, 3, 4, 5].map((offset) => (currentHour + offset) % 24);
    const promises = next6Hours.map((h) =>
      axios
        .get('/api/density-prediction/', { params: { lat: latNum, lng: lngNum, hour: h }, timeout: 5000 })
        .then((res) => ({ hour: h, density: res.data.density ?? 0.5 }))
        .catch(() => ({ hour: h, density: 0.5 }))
    );
    try {
      const results = await Promise.all(promises);
      const densityNow = results[0]?.density ?? 0.5;
      setPlace({
        name,
        lat: latNum,
        lng: lngNum,
        densityNow,
        predictionsNext6h: results.map((r) => ({ hour: r.hour, density: r.density })),
        serenityIndex: Math.round((1 - densityNow) * 10 * 10) / 10,
      });
    } catch {
      setError('Impossible de charger les données d’affluence');
      setPlace({
        name,
        lat: latNum,
        lng: lngNum,
        densityNow: 0.5,
        predictionsNext6h: next6Hours.map((hour) => ({ hour, density: 0.5 })),
        serenityIndex: 5,
      });
    } finally {
      setLoading(false);
    }
  }, [hasCoords, effectiveLat, effectiveLng, name, nameParam]);

  useEffect(() => {
    if (hasUrlCoords || resolvedCoords) {
      fetchPlaceData();
    } else if (nameParam && String(nameParam).trim()) {
      fetchPlaceData();
    } else {
      setError('Indiquez un lieu (nom ou adresse) ou ouvrez la fiche depuis la carte.');
      setLoading(false);
    }
  }, [fetchPlaceData, hasUrlCoords, resolvedCoords, nameParam]);

  const densityPercent = place ? Math.round((place.densityNow ?? 0) * 100) : 0;
  const densityLabel = getDensityLabel(densityPercent);
  const handleCalculateRoute = () => {
    navigate(`/trajet?arrivee=${encodeURIComponent(place?.name || name)}&lat=${place?.lat}&lng=${place?.lng}`);
  };

  if (error && !place) {
    return (
      <div className="place-detail-page place-detail-error">
        <Link to="/exploration" className="place-detail-back">
          <ArrowLeft size={20} /> Retour à l’exploration
        </Link>
        <p className="place-detail-error-msg">{error}</p>
      </div>
    );
  }

  return (
    <div className="place-detail-page">
      <nav className="place-detail-breadcrumb" aria-label="Fil d’Ariane">
        <Link to="/">Accueil</Link>
        <ChevronRight size={16} aria-hidden />
        <Link to="/exploration">Exploration</Link>
        <ChevronRight size={16} aria-hidden />
        <span className="place-detail-breadcrumb-current">{place?.name || name}</span>
      </nav>

      <div className="place-detail-layout">
        <div className="place-detail-main">
          <header className="place-detail-header">
            <h1 className="place-detail-title">{place?.name || name}</h1>
            <p className="place-detail-address">
              <MapPin size={18} aria-hidden />
              {place?.lat != null && place?.lng != null
                ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`
                : hasCoords
                  ? `${Number(effectiveLat).toFixed(5)}, ${Number(effectiveLng).toFixed(5)}`
                  : loading
                    ? 'Chargement…'
                    : 'Coordonnées non disponibles'}
            </p>
            <div className="place-detail-actions">
              <button type="button" className="place-detail-action-btn" aria-label="Partager">
                <Share2 size={18} /> Partager
              </button>
              <button type="button" className="place-detail-action-btn" aria-label="Contacter">
                <Mail size={18} /> Contacter
              </button>
            </div>
          </header>

          <div className="place-detail-tabs" role="tablist" aria-label="Sections du lieu">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`panel-${id}`}
                id={`tab-${id}`}
                className={`place-detail-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>

          <div className="place-detail-content">
            {activeTab === 'horaires' && (
              <section id="panel-horaires" role="tabpanel" aria-labelledby="tab-horaires" className="place-detail-panel">
                <h2 className="place-detail-panel-title">Horaires d&apos;ouverture</h2>
                <p className="place-detail-placeholder">
                  Les horaires ne sont pas renseignés pour ce lieu. Consultez le site officiel ou sur place.
                </p>
              </section>
            )}
            {activeTab === 'astuces' && (
              <section id="panel-astuces" role="tabpanel" aria-labelledby="tab-astuces" className="place-detail-panel">
                <h2 className="place-detail-panel-title">Astuces et conseils pour optimiser votre visite</h2>
                <ul className="place-detail-tips">
                  <li>Préférez les créneaux en dehors des heures de pointe pour une affluence plus faible.</li>
                  <li>Consultez l’affluence en temps réel et les prévisions ci-contre pour choisir le meilleur moment.</li>
                  <li>SafePath vous aide à identifier les zones calmes et à planifier un trajet serein.</li>
                </ul>
              </section>
            )}
            {activeTab === 'infos' && (
              <section id="panel-infos" role="tabpanel" aria-labelledby="tab-infos" className="place-detail-panel">
                <h2 className="place-detail-panel-title">Informations pratiques</h2>
                <p className="place-detail-placeholder">
                  Indice de sérénité : <strong>{place?.serenityIndex != null ? place.serenityIndex.toFixed(1) : '—'}/10</strong> (basé sur la densité de foule et les zones calmes).
                </p>
              </section>
            )}
            {activeTab === 'localisation' && (
              <section id="panel-localisation" role="tabpanel" aria-labelledby="tab-localisation" className="place-detail-panel">
                <h2 className="place-detail-panel-title">Localisation</h2>
                {previewPosition && (
                  <div className="place-detail-map-preview">
                    <MapContainer
                      center={previewPosition}
                      zoom={15}
                      scrollWheelZoom={false}
                      dragging={false}
                      doubleClickZoom={false}
                      zoomControl={false}
                      style={{ height: 240, width: '100%', borderRadius: 8 }}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap'
                      />
                      <Marker position={previewPosition} icon={previewIcon} />
                    </MapContainer>
                    <Link
                      to={`/exploration?q=${encodeURIComponent(place?.name || name)}`}
                      className="place-detail-map-link"
                    >
                      Voir sur la carte interactive
                    </Link>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        <aside className="place-detail-sidebar">
          {previewPosition && (
            <div className="place-detail-sidebar-image">
              <MapContainer
                center={previewPosition}
                zoom={15}
                scrollWheelZoom={false}
                dragging={false}
                doubleClickZoom={false}
                zoomControl={false}
                attributionControl={false}
                style={{ height: '100%', width: '100%', minHeight: 200 }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap'
                />
                <Marker position={previewPosition} icon={previewIcon} />
              </MapContainer>
            </div>
          )}
          <p className="place-detail-status">
            <span className="place-detail-status-dot" aria-hidden /> Horaires non renseignés
          </p>

          <section className="place-detail-sidebar-section">
            <h3 className="place-detail-sidebar-title">
              <span className="place-detail-realtime-dot" aria-hidden /> En temps réel
            </h3>
            {loading ? (
              <div className="place-detail-loading">
                <Loader2 size={24} className="spin" /> Chargement…
              </div>
            ) : (
              <div className="place-detail-affluence" style={{ color: densityLabel.color }}>
                <PersonIcons count={densityLabel.icons} />
                <span className="place-detail-affluence-label">Affluence</span>
                <span className="place-detail-affluence-value">{densityLabel.text}</span>
              </div>
            )}
          </section>

          <section className="place-detail-sidebar-section">
            <h3 className="place-detail-sidebar-title">
              <BarChart3 size={18} /> Prévisions
            </h3>
            {loading ? (
              <p className="place-detail-placeholder">Chargement…</p>
            ) : (
              <>
                <ul className="place-detail-predictions-list">
                  {(place?.predictionsNext6h || []).map((p, i, arr) => {
                    const from = `${String(p.hour ?? 0).padStart(2, '0')}:00`;
                    const next = arr[i + 1];
                    const to = next ? `${String(next.hour ?? 0).padStart(2, '0')}:00` : '24:00';
                    const pct = Math.round((Number(p.density) || 0) * 100);
                    const label = getDensityLabel(Number.isFinite(pct) ? pct : 0);
                    return (
                      <li key={`${p.hour}-${i}`}>
                        <span className="place-detail-prediction-slot">{from}–{to}</span>
                        <span className="place-detail-prediction-value" style={{ color: label.color }}>
                          <PersonIcons count={label.icons} /> {label.text} ({pct} %)
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {(place?.predictionsNext6h || []).length > 0 && (
                  <div className="place-detail-chart-bars">
                    <p className="place-detail-chart-title">Affluence prévue par heure</p>
                    <div className="place-detail-bar-list">
                      {(place?.predictionsNext6h || []).map((p, i) => {
                        const pct = Math.min(100, Math.max(0, Math.round((Number(p.density) || 0) * 100)));
                        return (
                          <div key={`bar-${i}`} className="place-detail-bar-row">
                            <span className="place-detail-bar-label">{String(p.hour ?? 0).padStart(2, '0')}h</span>
                            <div className="place-detail-bar-track">
                              <div
                                className="place-detail-bar-fill"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: pct < 35 ? 'var(--color-calm)' : pct < 65 ? 'var(--color-moderate)' : 'var(--color-dense)',
                                }}
                              />
                            </div>
                            <span className="place-detail-bar-pct">{pct} %</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <button type="button" className="place-detail-cta" onClick={handleCalculateRoute}>
            <Route size={20} /> Calculer un trajet jusqu&apos;ici
          </button>
        </aside>
      </div>
    </div>
  );
}
