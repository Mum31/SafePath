import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Maximize2, X } from 'lucide-react';

import StreetViewPanorama from './StreetViewPanorama';

const MotionDiv = motion.div;

function getPanoramaStatusLabel(status) {
  if (status === 'ready') {
    return 'Panorama 360 interactif';
  }

  if (status === 'loading') {
    return 'Chargement du panorama 360...';
  }

  if (status === 'disabled') {
    return 'Cle Google Maps manquante';
  }

  if (status === 'unavailable') {
    return 'Panorama indisponible pour ce lieu';
  }

  if (status === 'error') {
    return 'Impossible de charger le panorama';
  }

  return 'Apercu immersif';
}

export default function PanoramaModal({ open, onClose, lat, lng, placeName, address, fallback = null }) {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <MotionDiv
            className="panorama-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <MotionDiv
            className="panorama-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="panorama-modal-title"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="panorama-modal-header">
              <div className="panorama-modal-heading">
                <div className="panorama-modal-kicker">
                  <Maximize2 size={14} aria-hidden /> {getPanoramaStatusLabel(status)}
                </div>
                <h2 id="panorama-modal-title">{placeName || 'Panorama 360'}</h2>
                {address && (
                  <p className="panorama-modal-address">
                    <MapPin size={15} aria-hidden /> {address}
                  </p>
                )}
              </div>

              <button type="button" className="panorama-modal-close" onClick={onClose} aria-label="Fermer le panorama">
                <X size={20} />
              </button>
            </div>

            <div className="panorama-modal-body">
              <StreetViewPanorama
                key={`panorama-modal-${lat ?? 'x'}-${lng ?? 'y'}`}
                lat={lat}
                lng={lng}
                onStatusChange={setStatus}
                className="panorama-modal-viewer"
                radius={120}
                fallback={fallback}
              />
            </div>
          </MotionDiv>
        </>
      )}
    </AnimatePresence>
  );
}
