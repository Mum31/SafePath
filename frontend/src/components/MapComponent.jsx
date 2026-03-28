import React, { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

const HEATMAP_GRADIENT = {
  0.0: 'rgba(34, 197, 94, 0)',
  0.3: 'rgb(134, 239, 172)',
  0.55: 'rgb(249, 115, 22)',
  1.0: 'rgb(239, 68, 68)',
};

function HeatLayer({ densityData }) {
  const map = useMap();
  const heatRef = useRef(null);
  useEffect(() => {
    const points = (densityData || []).map((item) => [item.location.lat, item.location.lng, Math.min(1, Math.max(0, item.density ?? 0))]);
    if (!points.length) {
      if (heatRef.current) map.removeLayer(heatRef.current);
      heatRef.current = null;
      return undefined;
    }
    if (heatRef.current) heatRef.current.setLatLngs(points);
    else heatRef.current = L.heatLayer(points, { minOpacity: 0.2, radius: 24, blur: 18, gradient: HEATMAP_GRADIENT, max: 1 }).addTo(map);
    return () => {
      if (heatRef.current) map.removeLayer(heatRef.current);
      heatRef.current = null;
    };
  }, [densityData, map]);
  return null;
}

function BoundsFitter({ route, highlightedPoint }) {
  const map = useMap();
  useEffect(() => {
    const latlngs = [];
    (route?.path || []).forEach((point) => Array.isArray(point) && point.length >= 2 && latlngs.push([point[1], point[0]]));
    if (highlightedPoint?.lat != null && highlightedPoint?.lng != null) latlngs.push([highlightedPoint.lat, highlightedPoint.lng]);
    if (latlngs.length >= 2) map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 15 });
  }, [highlightedPoint, map, route?.path]);
  return null;
}

const createIcon = (color) => L.divIcon({ className: 'custom-marker', html: `<span style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.22);display:block;"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });

export default function MapComponent({ route, userLocation, densityData, stops = [], highlightedPoint, originPlace, destinationPlace }) {
  const center = userLocation ? [userLocation.lat, userLocation.lng] : [48.8566, 2.3522];
  const pathLatLngs = (route?.path || []).filter((point) => Array.isArray(point) && point.length >= 2).map(([lng, lat]) => [Number(lat), Number(lng)]);
  const shownStops = stops.filter((stop) => stop?.coord?.lat != null && stop?.coord?.lng != null).slice(0, 8);

  return (
    <div className="map-container">
      <MapContainer center={center} zoom={13} className="map map-leaflet" zoomControl={false} attributionControl>
        <ZoomControl position="topright" />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
        <HeatLayer densityData={densityData} />
        <BoundsFitter route={route} highlightedPoint={highlightedPoint} />
        {pathLatLngs.length > 0 && <Polyline positions={pathLatLngs} pathOptions={{ color: '#2D9D78', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />}
        {pathLatLngs[0] && <Marker position={pathLatLngs[0]} icon={createIcon('#10B981')}><Popup>{originPlace?.name || 'Depart'}</Popup></Marker>}
        {pathLatLngs[pathLatLngs.length - 1] && <Marker position={pathLatLngs[pathLatLngs.length - 1]} icon={createIcon('#EF4444')}><Popup>{destinationPlace?.name || 'Arrivee'}</Popup></Marker>}
        {shownStops.map((stop) => <Marker key={stop.id} position={[stop.coord.lat, stop.coord.lng]} icon={createIcon('#2563EB')}><Popup>{stop.name}</Popup></Marker>)}
        {highlightedPoint?.lat != null && highlightedPoint?.lng != null && <Marker position={[highlightedPoint.lat, highlightedPoint.lng]} icon={createIcon('#F59E0B')}><Popup>{highlightedPoint.name || 'Point cible'}</Popup></Marker>}
      </MapContainer>
      {route && (
        <div className="map-legend">
          <div className="legend-title">Lecture de la carte</div>
          <div className="legend-items">
            <div className="legend-item"><span className="legend-color" style={{ backgroundColor: '#2D9D78' }} /><span>Itineraire selectionne</span></div>
            <div className="legend-item"><span className="legend-color" style={{ backgroundColor: '#2563EB' }} /><span>Arrets principaux</span></div>
            <div className="legend-item"><span className="legend-color" style={{ backgroundColor: '#F59E0B' }} /><span>Point Street View</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
