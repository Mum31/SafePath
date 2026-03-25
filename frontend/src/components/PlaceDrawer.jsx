import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gauge, Wind, BarChart3, Loader2, MapPin, ExternalLink } from 'lucide-react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ChartErrorBoundary from './ChartErrorBoundary';

const PlaceDrawer = ({ open, onClose, place, loading = false }) => {
  const navigate = useNavigate();
  const previewPosition = useMemo(() => {
    if (place?.lat == null || place?.lng == null) return null;
    return [place.lat, place.lng];
  }, [place?.lat, place?.lng]);

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

  const densityPercent = place ? Math.round((place.densityNow ?? 0) * 100) : 0;
  const chartData = (place?.predictionsNext6h || []).map((p) => {
    const raw = Number(p.density);
    const affluence = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw * 100))) : 0;
    return {
      heure: `${String(p.hour ?? 0).padStart(2, '0')}h`,
      affluence,
    };
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
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
              <h2 id="drawer-title">{place?.name || 'Lieu'}</h2>
              <button type="button" className="place-drawer-close" onClick={onClose} aria-label="Fermer">
                <X size={24} />
              </button>
            </div>

            <div className="place-drawer-body">
              {previewPosition && (
                <section className="drawer-section place-drawer-map-wrap">
                  <h3><MapPin size={18} /> Aperçu du lieu</h3>
                  <div className="place-drawer-map">
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
                  </div>
                </section>
              )}
              {loading ? (
                <div className="place-drawer-loading">
                  <Loader2 size={32} className="spin" />
                  <p>Chargement de l’affluence…</p>
                </div>
              ) : (
                <>
              <section className="drawer-section">
                <h3><Gauge size={18} /> Densité actuelle (affluence)</h3>
                <div className="density-gauge-wrap">
                  <div className="density-gauge-bar">
                    <div
                      className="density-gauge-fill"
                      style={{
                        width: `${densityPercent}%`,
                        backgroundColor: densityPercent < 35 ? 'var(--color-calm)' : densityPercent < 65 ? 'var(--color-moderate)' : 'var(--color-dense)'
                      }}
                    />
                  </div>
                  <span className="density-gauge-value">{densityPercent} %</span>
                </div>
              </section>

              {chartData.length > 0 && (
                <section className="drawer-section">
                  <h3><BarChart3 size={18} /> Affluence prévue par heure (6 prochaines heures)</h3>
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
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => (v != null && Number.isFinite(v) ? `${v}%` : '0%')} />
                          <Tooltip formatter={(v) => [typeof v === 'number' && Number.isFinite(v) ? `${v}%` : '0%', 'Affluence']} />
                          <Area type="monotone" dataKey="affluence" stroke="var(--color-navy)" strokeWidth={2} fill="url(#fillAffluence)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartErrorBoundary>
                  </div>
                </section>
              )}

              <section className="drawer-section">
                <h3><Wind size={18} /> Indice de Sérénité</h3>
                <div className="serenity-index">
                  <span className="serenity-value">{place?.serenityIndex != null ? place.serenityIndex.toFixed(1) : '—'}</span>
                  <span className="serenity-max">/ 10</span>
                  <p className="serenity-desc">Basé sur la densité de foule et les zones calmes.</p>
                </div>
              </section>
              {place?.lat != null && place?.lng != null && (
                <div className="place-drawer-cta-wrap">
                  <button
                    type="button"
                    className="place-drawer-cta"
                    onClick={() => {
                      onClose();
                      navigate(`/exploration/lieu?lat=${place.lat}&lng=${place.lng}&name=${encodeURIComponent(place.name || 'Lieu')}`);
                    }}
                  >
                    <ExternalLink size={18} /> Voir la fiche complète
                  </button>
                </div>
              )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PlaceDrawer;
