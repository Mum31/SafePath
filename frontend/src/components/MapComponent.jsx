import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

const MapComponent = ({ route, userLocation, onMapClick, densityData }) => {

  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapboxgl.accessToken) {
      console.error('Mapbox token missing');
      return;
    }

    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: userLocation ? [userLocation.lng, userLocation.lat] : [2.3522, 48.8566],
      zoom: 13,
      attributionControl: false
    });

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // Add geolocation control
      map.current.addControl(new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true
      }), 'top-right');

      // Add fullscreen control
      map.current.addControl(new mapboxgl.FullscreenControl());

      // Click handler
      if (onMapClick) {
        map.current.on('click', (e) => {
          onMapClick({
            lng: e.lngLat.lng,
            lat: e.lngLat.lat
          });
        });
      }
    });

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update user location
  useEffect(() => {
    if (map.current && userLocation) {
      map.current.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 14,
        duration: 1500
      });

      // Add marker for user location
      new mapboxgl.Marker({ color: '#3B82F6' })
        .setLngLat([userLocation.lng, userLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML('<h3>Vous êtes ici</h3>'))
        .addTo(map.current);
    }
  }, [userLocation]);

  // Display route
  useEffect(() => {
    if (!map.current || !mapLoaded || !route) return;

    // Remove existing route
    if (map.current.getSource('route')) {
      map.current.removeLayer('route');
      map.current.removeSource('route');
    }

    // Add new route
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: route.path
        },
        properties: {
          stress: route.total_stress || 5
        }
      }
    });

    map.current.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': [
          'interpolate',
          ['linear'],
          ['get', 'stress'],
          0, '#10B981',   // Green - low stress
          5, '#F59E0B',   // Yellow - medium stress
          10, '#EF4444'   // Red - high stress
        ],
        'line-width': 6,
        'line-opacity': 0.8,
        'line-dasharray': [0.5, 2]
      }
    });

    // Add start and end markers
    if (route.path.length > 0) {
      // Start marker
      new mapboxgl.Marker({ color: '#10B981' })
        .setLngLat(route.path[0])
        .setPopup(new mapboxgl.Popup().setHTML('<h3>Départ</h3>'))
        .addTo(map.current);

      // End marker
      new mapboxgl.Marker({ color: '#EF4444' })
        .setLngLat(route.path[route.path.length - 1])
        .setPopup(new mapboxgl.Popup().setHTML('<h3>Arrivée</h3>'))
        .addTo(map.current);
    }

    // Fit bounds
    if (route.path.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      route.path.forEach(coord => bounds.extend(coord));
      map.current.fitBounds(bounds, {
        padding: 60,
        duration: 1000
      });
    }
  }, [route, mapLoaded]);

  // Display density data as heatmap
  useEffect(() => {
    if (!map.current || !mapLoaded || !densityData || densityData.length === 0) return;

    // Remove existing heatmap
    if (map.current.getSource('density')) {
      if (map.current.getLayer('density-heatmap')) {
        map.current.removeLayer('density-heatmap');
      }
      map.current.removeSource('density');
    }

    // Prepare data for heatmap
    const features = densityData.map(point => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.location.lng, point.location.lat]
      },
      properties: {
        density: point.density
      }
    }));

    map.current.addSource('density', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: features
      }
    });

    // Add heatmap layer
    map.current.addLayer({
      id: 'density-heatmap',
      type: 'heatmap',
      source: 'density',
      maxzoom: 15,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'density'], 0, 0, 1, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(33, 102, 172, 0)',
          0.2, 'rgb(103, 169, 207)',
          0.4, 'rgb(209, 229, 240)',
          0.6, 'rgb(253, 219, 199)',
          0.8, 'rgb(239, 138, 98)',
          1, 'rgb(178, 24, 43)'
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
        'heatmap-opacity': 0.6
      }
    }, 'waterway-label');
  }, [densityData, mapLoaded]);

  if (!mapboxgl.accessToken) {
    return (
      <div className="map-error">
        <div className="error-content">
          <h3>Carte non disponible</h3>
          <p>Le token Mapbox est manquant. Ajoutez-le dans le fichier .env</p>
          <a 
            href="https://account.mapbox.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="mapbox-link"
          >
            Obtenir un token gratuit
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="map-container">
      <div ref={mapContainer} className="map" />
      {route && (
        <div className="map-legend">
          <div className="legend-title">Légende du stress</div>
          <div className="legend-items">
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#10B981' }}></span>
              <span>Faible stress (0-3)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#F59E0B' }}></span>
              <span>Stress moyen (4-6)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#EF4444' }}></span>
              <span>Stress élevé (7-10)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;