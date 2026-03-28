import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { hasGoogleMapsApiKey, loadGoogleMapsApi } from '../utils/googleMaps';

function getPanoramaRequest(maps, lat, lng, radius, outdoorOnly) {
  const request = {
    location: { lat: Number(lat), lng: Number(lng) },
    radius,
  };

  if (outdoorOnly && maps.StreetViewSource?.OUTDOOR) {
    request.source = maps.StreetViewSource.OUTDOOR;
  }

  return request;
}

export default function StreetViewPanorama({
  lat,
  lng,
  fallback = null,
  onStatusChange,
  className = '',
  radius = 80,
}) {
  const containerRef = useRef(null);
  const panoramaRef = useRef(null);

  const hasCoords = lat != null && lng != null;
  const canLoadInteractivePanorama = hasCoords && hasGoogleMapsApiKey();
  const [asyncStatus, setAsyncStatus] = useState(canLoadInteractivePanorama ? 'loading' : 'idle');

  const effectiveStatus = useMemo(() => {
    if (!hasCoords) {
      return 'unavailable';
    }

    if (!hasGoogleMapsApiKey()) {
      return 'disabled';
    }

    return asyncStatus;
  }, [asyncStatus, hasCoords]);

  useEffect(() => {
    if (!canLoadInteractivePanorama || !containerRef.current) {
      return undefined;
    }

    let isCancelled = false;

    const initializePanorama = async () => {
      try {
        const maps = await loadGoogleMapsApi();
        if (isCancelled || !containerRef.current) {
          return;
        }

        const service = new maps.StreetViewService();

        let response = null;

        try {
          response = await service.getPanorama(getPanoramaRequest(maps, lat, lng, radius, true));
        } catch {
          response = null;
        }

        if (!response) {
          try {
            response = await service.getPanorama(getPanoramaRequest(maps, lat, lng, radius, false));
          } catch {
            response = null;
          }
        }

        if (!response?.data?.location?.pano) {
          if (!isCancelled) {
            setAsyncStatus('unavailable');
          }
          return;
        }

        const panorama = new maps.StreetViewPanorama(containerRef.current, {
          pano: response.data.location.pano,
          pov: {
            heading: response.data.tiles?.centerHeading ?? 0,
            pitch: 0,
          },
          zoom: 0,
          addressControl: false,
          enableCloseButton: false,
          fullscreenControl: true,
          linksControl: true,
          motionTracking: true,
          motionTrackingControl: true,
          panControl: true,
          showRoadLabels: true,
          visible: true,
          zoomControl: true,
        });

        panoramaRef.current = panorama;

        if (!isCancelled) {
          setAsyncStatus('ready');
        }
      } catch {
        if (!isCancelled) {
          setAsyncStatus('error');
        }
      }
    };

    initializePanorama();

    return () => {
      isCancelled = true;
      if (panoramaRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(panoramaRef.current);
      }
      panoramaRef.current = null;
    };
  }, [canLoadInteractivePanorama, lat, lng, radius]);

  useEffect(() => {
    onStatusChange?.(effectiveStatus);
  }, [effectiveStatus, onStatusChange]);

  return (
    <div className={`street-view-shell ${className}`.trim()}>
      {canLoadInteractivePanorama && (
        <div
          ref={containerRef}
          className={`street-view-panorama ${effectiveStatus === 'ready' ? 'is-visible' : 'is-hidden'}`}
        />
      )}

      {effectiveStatus !== 'ready' && <div className="street-view-fallback">{fallback}</div>}

      {effectiveStatus === 'loading' && (
        <div className="street-view-loading-overlay" aria-live="polite">
          <Loader2 size={20} className="spin" />
          <span>Chargement du panorama 360...</span>
        </div>
      )}
    </div>
  );
}
