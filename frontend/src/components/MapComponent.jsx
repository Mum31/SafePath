import React, { useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
  ZoomControl,
} from 'react-leaflet';
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
      minOpacity: 0.25,
      maxZoom: 18,
      radius: 22,
      blur: 18,
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

function BoundsFitter({ route }) {
  const map = useMap();
  useEffect(() => {
    if (!route?.path?.length || route.path.length < 2) return;
    const latlngs = route.path.map((c) => [c[1], c[0]]);
    map.fitBounds(latlngs, { padding: [60, 60], maxZoom: 15 });
  }, [map, route?.path]);
  return null;
}

function createIcon(color, label) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<span style="background:${color};width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:block;" title="${label}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const MapComponent = ({ route, userLocation, onMapClick, densityData }) => {
  const center = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [48.8566, 2.3522];

  const pathLatLngs = Array.isArray(route?.path) && route.path.length > 0
    ? route.path
        .filter((c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
        .map((c) => [Number(c[1]), Number(c[0])])
    : [];

  return (
    <div className="map-container">
      <MapContainer
        center={center}
        zoom={13}
        className="map map-leaflet"
        zoomControl={false}
        attributionControl={true}
      >
        <ZoomControl position="topright" />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <HeatLayer densityData={densityData} />
        {pathLatLngs.length > 0 && (
          <>
            <Polyline
              positions={pathLatLngs}
              pathOptions={{
                color: '#2D9D78',
                weight: 6,
                opacity: 0.85,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
            <BoundsFitter route={route} />
            <Marker position={pathLatLngs[0]} icon={createIcon('#10B981', 'Départ')}>
              <Popup>Départ</Popup>
            </Marker>
            <Marker
              position={pathLatLngs[pathLatLngs.length - 1]}
              icon={createIcon('#EF4444', 'Arrivée')}
            >
              <Popup>Arrivée</Popup>
            </Marker>
          </>
        )}
        {userLocation && !route?.path?.length && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={createIcon('#3B82F6', 'Vous êtes ici')}
          >
            <Popup>Vous êtes ici</Popup>
          </Marker>
        )}
      </MapContainer>
      {route && (
        <div className="map-legend">
          <div className="legend-title">Légende du stress</div>
          <div className="legend-items">
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#10B981' }} />
              <span>Faible stress (0-3)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#F59E0B' }} />
              <span>Stress moyen (4-6)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#EF4444' }} />
              <span>Stress élevé (7-10)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
