import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock,
  Info,
  Lightbulb,
  Loader2,
  Mail,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Route,
  Share2,
  Users,
} from 'lucide-react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

import '../App.css';
import PanoramaModal from '../components/PanoramaModal';
import StreetViewPanorama from '../components/StreetViewPanorama';
import { buildForecastTargets } from '../utils/forecast';
import { buildStreetPreviewUrl, hasStreetPreviewProvider } from '../utils/placePreview';

const TABS = [
  { id: 'horaires', label: "Horaires d'ouverture", icon: Clock },
  { id: 'astuces', label: 'Astuces de visite', icon: Lightbulb },
  { id: 'infos', label: 'Informations pratiques', icon: Info },
  { id: 'localisation', label: 'Localisation', icon: MapIcon },
];

const GENERIC_PLACE_LABELS = new Set(['lieu', 'lieu selectionne', 'zone selectionnee', 'point selectionne']);

const decodeParam = (value, fallback = '') => {
  try {
    return decodeURIComponent(String(value || fallback));
  } catch {
    return String(value || fallback);
  }
};

const formatCoordinatesLabel = (lat, lng) => `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;

const isGenericPlaceLabel = (value) =>
  GENERIC_PLACE_LABELS.has(
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );

function getDensityLabel(percent) {
  if (percent < 35) {
    return { text: 'Faible', color: 'var(--color-calm)', icons: 1 };
  }
  if (percent < 65) {
    return { text: 'Moderee', color: 'var(--color-moderate)', icons: 2 };
  }
  return { text: 'Dense', color: 'var(--color-dense)', icons: 3 };
}

function PersonIcons({ count }) {
  return (
    <span className="place-detail-density-icons" aria-hidden>
      {[1, 2, 3].map((index) => (
        <Users key={index} size={16} style={{ opacity: index <= count ? 1 : 0.25 }} />
      ))}
    </span>
  );
}

function getPreviewNote(interactivePreviewStatus, showingStreetPreview) {
  if (interactivePreviewStatus === 'ready') {
    return 'Panorama 360 interactif du lieu';
  }

  if (interactivePreviewStatus === 'loading') {
    return 'Chargement du panorama 360 interactif...';
  }

  if (showingStreetPreview) {
    return 'Photo reelle du lieu';
  }

  if (hasStreetPreviewProvider()) {
    return 'Panorama 360 indisponible ici, apercu photo ou carte affiche en repli.';
  }

  return 'Ajoutez une cle Google Maps pour afficher un panorama 360.';
}

export default function PlaceDetailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const rawName = searchParams.get('name') || 'Lieu';
  const rawAddress = searchParams.get('address') || '';

  const name = useMemo(() => decodeParam(rawName, 'Lieu'), [rawName]);
  const initialAddress = useMemo(() => decodeParam(rawAddress, ''), [rawAddress]);

  const [activeTab, setActiveTab] = useState('horaires');
  const [place, setPlace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvedCoords, setResolvedCoords] = useState(null);
  const [resolvedMeta, setResolvedMeta] = useState(null);
  const [failedStreetPreviewUrl, setFailedStreetPreviewUrl] = useState(null);
  const [mainInteractivePreviewStatus, setMainInteractivePreviewStatus] = useState('idle');
  const [panoramaModalOpen, setPanoramaModalOpen] = useState(false);

  const latNum = latParam != null && latParam !== '' ? parseFloat(latParam) : NaN;
  const lngNum = lngParam != null && lngParam !== '' ? parseFloat(lngParam) : NaN;
  const hasUrlCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const effectiveLat = hasUrlCoords ? latNum : (resolvedCoords?.lat ?? null);
  const effectiveLng = hasUrlCoords ? lngNum : (resolvedCoords?.lng ?? null);
  const hasCoords = effectiveLat != null && effectiveLng != null && Number.isFinite(effectiveLat) && Number.isFinite(effectiveLng);

  const previewPosition = hasCoords ? [effectiveLat, effectiveLng] : null;

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

  const streetPreviewUrl = useMemo(
    () =>
      buildStreetPreviewUrl({
        lat: effectiveLat,
        lng: effectiveLng,
        width: 960,
        height: 540,
      }),
    [effectiveLat, effectiveLng]
  );

  const fetchPlaceData = useCallback(async () => {
    if (!hasCoords) {
      if (!rawName || String(rawName).trim() === '') {
        setError('Coordonnees ou nom du lieu manquant.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await axios.get('/api/geocode/', {
          params: { q: String(rawName).trim() },
          timeout: 8000,
        });
        const { lat, lng, name: resolvedName, address, display_name: displayName } = response.data;
        const geocodedLat = Number(lat);
        const geocodedLng = Number(lng);

        if (Number.isFinite(geocodedLat) && Number.isFinite(geocodedLng)) {
          setResolvedCoords({ lat: geocodedLat, lng: geocodedLng });
          setResolvedMeta({
            name: resolvedName || name,
            address: address || displayName || initialAddress,
          });
          return;
        }
      } catch {
        setError("Impossible de localiser ce lieu. Verifiez l'adresse ou ouvrez la fiche depuis la carte.");
        setLoading(false);
        return;
      }

      setError('Coordonnees introuvables pour ce lieu.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const forecastTargets = buildForecastTargets(6);

    const predictionsPromise = Promise.all(
      forecastTargets.map((target) =>
        axios
          .get('/api/density-prediction/', {
            params: { lat: effectiveLat, lng: effectiveLng, datetime: target.iso },
            timeout: 5000,
          })
          .then((response) => ({
            hour: response.data.hour ?? target.hour,
            density: response.data.density ?? 0.5,
            requestedDatetime: response.data.requested_datetime || target.iso,
          }))
          .catch(() => ({ hour: target.hour, density: 0.5, requestedDatetime: target.iso }))
      )
    );

    const reversePromise = axios
      .get('/api/reverse-geocode/', {
        params: { lat: effectiveLat, lng: effectiveLng },
        timeout: 5000,
      })
      .then((response) => response.data)
      .catch(() => null);

    try {
      const [results, reverseData] = await Promise.all([predictionsPromise, reversePromise]);
      const densityNow = results[0]?.density ?? 0.5;
      const baseName = resolvedMeta?.name || name;
      const resolvedName =
        !baseName || isGenericPlaceLabel(baseName) ? reverseData?.name || baseName || 'Lieu' : baseName;
      const resolvedAddress =
        reverseData?.address ||
        reverseData?.display_name ||
        resolvedMeta?.address ||
        initialAddress ||
        formatCoordinatesLabel(effectiveLat, effectiveLng);

      setPlace({
        name: resolvedName,
        address: resolvedAddress,
        lat: effectiveLat,
        lng: effectiveLng,
        densityNow,
        predictionsNext6h: results.map((result) => ({
          hour: result.hour,
          density: result.density,
          requestedDatetime: result.requestedDatetime,
        })),
        serenityIndex: Math.round((1 - densityNow) * 100) / 10,
      });
    } catch {
      setError("Impossible de charger les donnees d'affluence");
      setPlace({
        name: resolvedMeta?.name || name,
        address: resolvedMeta?.address || initialAddress || formatCoordinatesLabel(effectiveLat, effectiveLng),
        lat: effectiveLat,
        lng: effectiveLng,
        densityNow: 0.5,
        predictionsNext6h: forecastTargets.map((target) => ({
          hour: target.hour,
          density: 0.5,
          requestedDatetime: target.iso,
        })),
        serenityIndex: 5,
      });
    } finally {
      setLoading(false);
    }
  }, [effectiveLat, effectiveLng, hasCoords, initialAddress, name, rawName, resolvedMeta]);

  useEffect(() => {
    if (hasUrlCoords || resolvedCoords) {
      fetchPlaceData();
      return;
    }

    if (rawName && String(rawName).trim()) {
      fetchPlaceData();
      return;
    }

    setError('Indiquez un lieu (nom ou adresse) ou ouvrez la fiche depuis la carte.');
    setLoading(false);
  }, [fetchPlaceData, hasUrlCoords, rawName, resolvedCoords]);

  const densityPercent = place ? Math.round((place.densityNow ?? 0) * 100) : 0;
  const densityLabel = getDensityLabel(densityPercent);
  const addressLabel =
    place?.address ||
    resolvedMeta?.address ||
    initialAddress ||
    (hasCoords ? formatCoordinatesLabel(effectiveLat, effectiveLng) : 'Adresse non disponible');
  const showingStreetPreview = Boolean(streetPreviewUrl) && failedStreetPreviewUrl !== streetPreviewUrl;
  const previewNote = getPreviewNote(mainInteractivePreviewStatus, showingStreetPreview);

  const previewFallback = previewPosition ? (
    showingStreetPreview ? (
      <img
        src={streetPreviewUrl}
        alt={`Apercu du lieu ${place?.name || name}`}
        onError={() => setFailedStreetPreviewUrl(streetPreviewUrl)}
      />
    ) : (
      <MapContainer
        center={previewPosition}
        zoom={15}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        style={{ height: '100%', width: '100%', borderRadius: 8 }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <Marker position={previewPosition} icon={previewIcon} />
      </MapContainer>
    )
  ) : null;

  const handleCalculateRoute = () => {
    navigate(
      `/trajet?arrivee=${encodeURIComponent(place?.name || name)}&lat=${place?.lat}&lng=${place?.lng}`
    );
  };

  if (error && !place) {
    return (
      <div className="place-detail-page place-detail-error">
        <Link to="/exploration" className="place-detail-back">
          <ArrowLeft size={20} /> Retour a l'exploration
        </Link>
        <p className="place-detail-error-msg">{error}</p>
      </div>
    );
  }

  return (
    <div className="place-detail-page">
      <nav className="place-detail-breadcrumb" aria-label="Fil d'Ariane">
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
              {loading && !place ? 'Chargement...' : addressLabel}
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
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  id={`tab-${tab.id}`}
                  className={`place-detail-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <TabIcon size={18} /> {tab.label}
                </button>
              );
            })}
          </div>

          <div className="place-detail-content">
            {activeTab === 'horaires' && (
              <section id="panel-horaires" role="tabpanel" aria-labelledby="tab-horaires" className="place-detail-panel">
                <h2 className="place-detail-panel-title">Horaires d'ouverture</h2>
                <p className="place-detail-placeholder">
                  Les horaires ne sont pas renseignes pour ce lieu. Consultez le site officiel ou sur place.
                </p>
              </section>
            )}

            {activeTab === 'astuces' && (
              <section id="panel-astuces" role="tabpanel" aria-labelledby="tab-astuces" className="place-detail-panel">
                <h2 className="place-detail-panel-title">Astuces et conseils pour optimiser votre visite</h2>
                <ul className="place-detail-tips">
                  <li>Preferez les creneaux hors heures de pointe pour une affluence plus faible.</li>
                  <li>Consultez l'affluence en temps reel et les previsions ci-contre pour choisir le meilleur moment.</li>
                  <li>SafePath vous aide a identifier les zones calmes et a planifier un trajet serein.</li>
                </ul>
              </section>
            )}

            {activeTab === 'infos' && (
              <section id="panel-infos" role="tabpanel" aria-labelledby="tab-infos" className="place-detail-panel">
                <h2 className="place-detail-panel-title">Informations pratiques</h2>
                <p className="place-detail-placeholder">
                  Indice de serenite : <strong>{place?.serenityIndex != null ? place.serenityIndex.toFixed(1) : '-'}/10</strong>
                  {' '}base sur la densite de foule et les zones calmes.
                </p>
              </section>
            )}

            {activeTab === 'localisation' && (
              <section
                id="panel-localisation"
                role="tabpanel"
                aria-labelledby="tab-localisation"
                className="place-detail-panel"
              >
                <h2 className="place-detail-panel-title">Localisation</h2>
                {previewPosition && (
                  <div className="place-detail-map-preview">
                    <StreetViewPanorama
                      key={`detail-main-panorama-${effectiveLat ?? 'x'}-${effectiveLng ?? 'y'}`}
                      lat={effectiveLat}
                      lng={effectiveLng}
                      onStatusChange={setMainInteractivePreviewStatus}
                      fallback={previewFallback}
                    />
                    <div className="place-preview-footer">
                      <p className="place-preview-note">{previewNote}</p>
                      <button
                        type="button"
                        className="place-preview-expand-btn"
                        onClick={() => setPanoramaModalOpen(true)}
                      >
                        <Maximize2 size={16} /> Ouvrir le panorama 360
                      </button>
                    </div>
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
              <StreetViewPanorama
                key={`detail-sidebar-panorama-${effectiveLat ?? 'x'}-${effectiveLng ?? 'y'}`}
                lat={effectiveLat}
                lng={effectiveLng}
                fallback={previewFallback}
              />
            </div>
          )}

          <p className="place-detail-status">
            <span className="place-detail-status-dot" aria-hidden /> Horaires non renseignes
          </p>

          <section className="place-detail-sidebar-section">
            <h3 className="place-detail-sidebar-title">
              <span className="place-detail-realtime-dot" aria-hidden /> En temps reel
            </h3>
            {loading ? (
              <div className="place-detail-loading">
                <Loader2 size={24} className="spin" /> Chargement...
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
              <BarChart3 size={18} /> Previsions
            </h3>
            {loading ? (
              <p className="place-detail-placeholder">Chargement...</p>
            ) : (
              <>
                <ul className="place-detail-predictions-list">
                  {(place?.predictionsNext6h || []).map((prediction, index, values) => {
                    const from = `${String(prediction.hour ?? 0).padStart(2, '0')}:00`;
                    const next = values[index + 1];
                    const to = next ? `${String(next.hour ?? 0).padStart(2, '0')}:00` : '24:00';
                    const percent = Math.round((Number(prediction.density) || 0) * 100);
                    const label = getDensityLabel(Number.isFinite(percent) ? percent : 0);

                    return (
                      <li key={`${prediction.hour}-${index}`}>
                        <span className="place-detail-prediction-slot">{from}-{to}</span>
                        <span className="place-detail-prediction-value" style={{ color: label.color }}>
                          <PersonIcons count={label.icons} /> {label.text} ({percent} %)
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {(place?.predictionsNext6h || []).length > 0 && (
                  <div className="place-detail-chart-bars">
                    <p className="place-detail-chart-title">Affluence prevue par heure</p>
                    <div className="place-detail-bar-list">
                      {(place?.predictionsNext6h || []).map((prediction, index) => {
                        const percent = Math.min(100, Math.max(0, Math.round((Number(prediction.density) || 0) * 100)));
                        return (
                          <div key={`bar-${index}`} className="place-detail-bar-row">
                            <span className="place-detail-bar-label">
                              {String(prediction.hour ?? 0).padStart(2, '0')}h
                            </span>
                            <div className="place-detail-bar-track">
                              <div
                                className="place-detail-bar-fill"
                                style={{
                                  width: `${percent}%`,
                                  backgroundColor:
                                    percent < 35
                                      ? 'var(--color-calm)'
                                      : percent < 65
                                        ? 'var(--color-moderate)'
                                        : 'var(--color-dense)',
                                }}
                              />
                            </div>
                            <span className="place-detail-bar-pct">{percent} %</span>
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
            <Route size={20} /> Calculer un trajet jusqu'ici
          </button>
        </aside>
      </div>

      <PanoramaModal
        open={panoramaModalOpen}
        onClose={() => setPanoramaModalOpen(false)}
        lat={effectiveLat}
        lng={effectiveLng}
        placeName={place?.name || name}
        address={addressLabel}
        fallback={previewFallback}
      />
    </div>
  );
}
