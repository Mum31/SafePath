import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, ExternalLink, Gauge, Loader2, MapPin, Maximize2, Wind, X } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import ChartErrorBoundary from './ChartErrorBoundary';
import PanoramaModal from './PanoramaModal';
import StreetViewPanorama from './StreetViewPanorama';
import { buildStreetPreviewUrl, hasStreetPreviewProvider } from '../utils/placePreview';

const formatCoordinatesLabel = (lat, lng) => `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
const MotionDiv = motion.div;

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

  return 'Apercu cartographique. Ajoutez une cle Google Maps pour afficher un panorama 360.';
}

export default function PlaceDrawer({ open, onClose, place, loading = false }) {
  const navigate = useNavigate();
  const [failedStreetPreviewUrl, setFailedStreetPreviewUrl] = useState(null);
  const [interactivePreviewStatus, setInteractivePreviewStatus] = useState('idle');
  const [panoramaModalOpen, setPanoramaModalOpen] = useState(false);

  const previewPosition = place?.lat == null || place?.lng == null ? null : [place.lat, place.lng];

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
        lat: place?.lat,
        lng: place?.lng,
        width: 960,
        height: 480,
      }),
    [place?.lat, place?.lng]
  );

  const densityPercent = place ? Math.round((place.densityNow ?? 0) * 100) : 0;
  const chartData = (place?.predictionsNext6h || []).map((prediction) => {
    const rawDensity = Number(prediction.density);
    const affluence = Number.isFinite(rawDensity) ? Math.min(100, Math.max(0, Math.round(rawDensity * 100))) : 0;
    return {
      heure: `${String(prediction.hour ?? 0).padStart(2, '0')}h`,
      affluence,
    };
  });

  const addressLabel =
    place?.address || (place?.lat != null && place?.lng != null ? formatCoordinatesLabel(place.lat, place.lng) : '');
  const showingStreetPreview = Boolean(streetPreviewUrl) && failedStreetPreviewUrl !== streetPreviewUrl;
  const previewNote = getPreviewNote(interactivePreviewStatus, showingStreetPreview);
  const previewFallback = previewPosition
    ? showingStreetPreview ? (
        <img
          src={streetPreviewUrl}
          alt={`Apercu du lieu ${place?.name || ''}`}
          className="place-drawer-map-img"
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
          attributionControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <Marker position={previewPosition} icon={previewIcon} />
        </MapContainer>
      )
    : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <MotionDiv
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <MotionDiv
            className="place-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            <div className="place-drawer-handle" aria-hidden="true" />

            <div className="place-drawer-header">
              <div>
                <h2 id="drawer-title">{place?.name || 'Lieu'}</h2>
                {addressLabel && (
                  <p className="place-drawer-address">
                    <MapPin size={16} /> {addressLabel}
                  </p>
                )}
              </div>
              <button type="button" className="place-drawer-close" onClick={onClose} aria-label="Fermer">
                <X size={24} />
              </button>
            </div>

            <div className="place-drawer-body">
              {previewPosition && (
                <section className="drawer-section place-drawer-map-wrap">
                  <h3>
                    <MapPin size={18} /> Apercu du lieu
                  </h3>
                  <div className="place-drawer-map">
                    <StreetViewPanorama
                      key={`drawer-panorama-${place?.lat ?? 'x'}-${place?.lng ?? 'y'}`}
                      lat={place?.lat}
                      lng={place?.lng}
                      onStatusChange={setInteractivePreviewStatus}
                      fallback={previewFallback}
                    />
                  </div>
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
                </section>
              )}

              {loading ? (
                <div className="place-drawer-loading">
                  <Loader2 size={32} className="spin" />
                  <p>Chargement de l'affluence...</p>
                </div>
              ) : (
                <>
                  <section className="drawer-section">
                    <h3>
                      <Gauge size={18} /> Densite actuelle
                    </h3>
                    <div className="density-gauge-wrap">
                      <div className="density-gauge-bar">
                        <div
                          className="density-gauge-fill"
                          style={{
                            width: `${densityPercent}%`,
                            backgroundColor:
                              densityPercent < 35
                                ? 'var(--color-calm)'
                                : densityPercent < 65
                                  ? 'var(--color-moderate)'
                                  : 'var(--color-dense)',
                          }}
                        />
                      </div>
                      <span className="density-gauge-value">{densityPercent} %</span>
                    </div>
                  </section>

                  {chartData.length > 0 && (
                    <section className="drawer-section">
                      <h3>
                        <BarChart3 size={18} /> Affluence prevue par heure
                      </h3>
                      <div className="drawer-chart">
                        <ChartErrorBoundary>
                          <ResponsiveContainer width="100%" height={180}>
                            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="fillAffluence" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="var(--color-teal)" stopOpacity={0.4} />
                                  <stop offset="100%" stopColor="var(--color-teal)" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="heure" tick={{ fontSize: 12 }} />
                              <YAxis
                                domain={[0, 100]}
                                tick={{ fontSize: 11 }}
                                tickFormatter={(value) => (Number.isFinite(value) ? `${value}%` : '0%')}
                              />
                              <Tooltip
                                formatter={(value) => [
                                  typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '0%',
                                  'Affluence',
                                ]}
                              />
                              <Area
                                type="monotone"
                                dataKey="affluence"
                                stroke="var(--color-navy)"
                                strokeWidth={2}
                                fill="url(#fillAffluence)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </ChartErrorBoundary>
                      </div>
                    </section>
                  )}

                  <section className="drawer-section">
                    <h3>
                      <Wind size={18} /> Indice de serenite
                    </h3>
                    <div className="serenity-index">
                      <span className="serenity-value">
                        {place?.serenityIndex != null ? place.serenityIndex.toFixed(1) : '-'}
                      </span>
                      <span className="serenity-max">/ 10</span>
                      <p className="serenity-desc">Base sur la densite de foule et les zones calmes.</p>
                    </div>
                  </section>

                  {place?.lat != null && place?.lng != null && (
                    <div className="place-drawer-cta-wrap">
                      <button
                        type="button"
                        className="place-drawer-cta"
                        onClick={() => {
                          onClose();
                          navigate(
                            `/exploration/lieu?lat=${place.lat}&lng=${place.lng}&name=${encodeURIComponent(
                              place.name || 'Lieu'
                            )}&address=${encodeURIComponent(place.address || '')}`
                          );
                        }}
                      >
                        <ExternalLink size={18} /> Voir la fiche complete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </MotionDiv>

          <PanoramaModal
            open={panoramaModalOpen}
            onClose={() => setPanoramaModalOpen(false)}
            lat={place?.lat}
            lng={place?.lng}
            placeName={place?.name}
            address={addressLabel}
            fallback={previewFallback}
          />
        </>
      )}
    </AnimatePresence>
  );
}
