import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

/* Heatmap : faible densité = vert, moyenne = orange, élevée = rouge */
const HEATMAP_GRADIENT = {
  0.0: 'rgba(34, 197, 94, 0)',
  0.2: 'rgb(134, 239, 172)',
  0.4: 'rgb(34, 197, 94)',
  0.55: 'rgb(253, 186, 116)',
  0.7: 'rgb(249, 115, 22)',
  0.85: 'rgb(234, 88, 12)',
  1.0: 'rgb(239, 68, 68)',
};

function HeatLayer({ densityData }) {
  const map = useMap();
  const heatRef = useRef(null);

  useEffect(() => {
    if (!map || !densityData?.length) {
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
        heatRef.current = null;
      }
      return;
    }

    const points = densityData.map((p) => [
      p.location.lat,
      p.location.lng,
      Math.min(1, Math.max(0, p.density ?? 0)),
    ]);

    if (heatRef.current) {
      heatRef.current.setLatLngs(points);
      return;
    }

    heatRef.current = L.heatLayer(points, {
      minOpacity: 0.3,
      maxZoom: 18,
      radius: 28,
      blur: 20,
      gradient: HEATMAP_GRADIENT,
      max: 1,
    }).addTo(map);

    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
        heatRef.current = null;
      }
    };
  }, [map, densityData]);

  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function CenterUpdater({ userLocation }) {
  const map = useMap();
  useEffect(() => {
    if (!userLocation) return;
    map.flyTo([userLocation.lat, userLocation.lng], 13, { duration: 1.2 });
  }, [map, userLocation?.lat, userLocation?.lng]);
  return null;
}

function SearchLocationUpdater({ searchLocation }) {
  const map = useMap();
  useEffect(() => {
    if (!searchLocation?.lat || !searchLocation?.lng) return;
    map.flyTo([searchLocation.lat, searchLocation.lng], 15, { duration: 1 });
  }, [map, searchLocation?.lat, searchLocation?.lng]);
  return null;
}

function createSearchMarkerIcon() {
  return L.divIcon({
    className: 'search-result-marker',
    html: '<span class="search-marker-pin" title="Résultat de recherche">📍</span>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

function LocateControl() {
  const map = useMap();
  return (
    <button
      type="button"
      className="leaflet-locate-btn"
      aria-label="Ma position"
      onClick={() => {
        map.locate({ setView: true, maxZoom: 15 });
      }}
    >
      📍
    </button>
  );
}

const MapExploration = ({ userLocation, densityData, onMapClick, loading, searchLocation, onSearchLocationClick }) => {
  const center = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [48.8566, 2.3522];

  return (
    <div className="map-exploration-container">
      {loading && <div className="map-exploration-loading" />}
      <MapContainer
        center={center}
        zoom={12}
        className="map-exploration map-exploration-leaflet"
        zoomControl={false}
        attributionControl={true}
      >
        <ZoomControl position="topright" />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <HeatLayer densityData={densityData} />
        <MapClickHandler onMapClick={onMapClick} />
        <CenterUpdater userLocation={userLocation} />
        {searchLocation?.lat != null && searchLocation?.lng != null && (
          <>
            <SearchLocationUpdater searchLocation={searchLocation} />
            <Marker
              position={[searchLocation.lat, searchLocation.lng]}
              icon={createSearchMarkerIcon()}
              eventHandlers={{
                click: () => onSearchLocationClick?.(searchLocation),
              }}
            >
              <Popup>
                <span className="marker-popup-title">{searchLocation.display_name || 'Lieu recherché'}</span>
                <br />
                <span className="marker-popup-hint">Cliquez pour voir l’affluence</span>
              </Popup>
            </Marker>
          </>
        )}
        <LocateControl />
      </MapContainer>
    </div>
  );
};

export default MapExploration;
