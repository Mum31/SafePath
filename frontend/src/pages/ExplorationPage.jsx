import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, MapPin, TreePine, Route, Umbrella, Loader2 } from 'lucide-react';
import axios from 'axios';
import MapExploration from '../components/MapExploration';
import PlaceDrawer from '../components/PlaceDrawer';
import '../App.css';

const ExplorationPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [searchLocation, setSearchLocation] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState({
    parcsOnly: false,
    avoidMainRoads: true,
    zonesCouvertes: false
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 48.8566, lng: 2.3522 })
      );
    } else {
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
    }
  }, []);

  const runGeocode = useCallback(async (query) => {
    const q = (query || '').trim();
    if (!q) {
      setSearchLocation(null);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await axios.get('/api/geocode/', { params: { q } });
      const { lat, lng, display_name } = res.data;
      setSearchLocation({ lat, lng, display_name: display_name || q });
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'Lieu introuvable. Essayez une adresse ou un lieu en France.'
        : 'Recherche indisponible. Réessayez plus tard.';
      setSearchError(msg);
      setSearchLocation(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (urlQuery.trim()) {
      setSearchQuery(urlQuery);
      runGeocode(urlQuery);
    } else {
      setSearchLocation(null);
      setSearchError(null);
    }
  }, [urlQuery, runGeocode]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchParams({});
      setSearchLocation(null);
      setSearchError(null);
      return;
    }
    setSearchParams({ q });
    runGeocode(q);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchError(null);
    setSearchParams({});
    setSearchLocation(null);
  };

  useEffect(() => {
    setLoading(true);
    axios.get('/api/density-prediction/', {
      params: { zone: 'paris', hour: new Date().getHours(), grid: 5 }
    }).then((res) => {
      setPredictions(res.data.predictions || []);
    }).catch(() => setPredictions([])).finally(() => setLoading(false));
  }, []);

  const densityData = predictions.map(p => ({
    location: p.location,
    density: p.density,
    confidence: p.confidence || 0.7
  }));

  const [placeDrawerLoading, setPlaceDrawerLoading] = useState(false);

  const fetchPlaceDensity = useCallback(async (lat, lng, displayName) => {
    setSelectedPlace({ name: displayName || 'Lieu', lat, lng, densityNow: 0, predictionsNext6h: [], serenityIndex: null });
    setDrawerOpen(true);
    setPlaceDrawerLoading(true);
    const now = new Date();
    const currentHour = now.getHours();
    const next6Hours = [0, 1, 2, 3, 4, 5].map((offset) => (currentHour + offset) % 24);
    const promises = next6Hours.map((h) => {
      return axios.get('/api/density-prediction/', { params: { lat, lng, hour: h }, timeout: 5000 })
        .then((res) => ({ hour: h, density: res.data.density ?? 0.5 }))
        .catch(() => ({ hour: h, density: 0.5 }));
    });
    try {
      const results = await Promise.all(promises);
      const densityNow = results[0]?.density ?? 0.5;
      setSelectedPlace({
        name: displayName || 'Zone sélectionnée',
        lat,
        lng,
        densityNow,
        predictionsNext6h: results.map((r) => ({ hour: r.hour, density: r.density })),
        serenityIndex: Math.round((1 - densityNow) * 10 * 10) / 10
      });
    } catch {
      const fallback = 0.5;
      setSelectedPlace({
        name: displayName || 'Zone sélectionnée',
        lat,
        lng,
        densityNow: fallback,
        predictionsNext6h: next6Hours.map((hour) => ({ hour, density: fallback })),
        serenityIndex: 5
      });
    } finally {
      setPlaceDrawerLoading(false);
    }
  }, []);

  const handleMapClick = useCallback((point) => {
    fetchPlaceDensity(point.lat, point.lng, 'Zone sélectionnée');
  }, [fetchPlaceDensity]);

  const handleSearchLocationClick = useCallback((searchLocation) => {
    if (!searchLocation?.lat || !searchLocation?.lng) return;
    fetchPlaceDensity(
      searchLocation.lat,
      searchLocation.lng,
      searchLocation.display_name || 'Lieu recherché'
    );
  }, [fetchPlaceDensity]);

  return (
    <div className="exploration-page">
      <form
        className="exploration-search-bar"
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label="Rechercher un lieu sur la carte"
      >
        <Search size={20} className="search-icon" aria-hidden />
        <input
          type="search"
          placeholder="Adresse ou lieu (ex. Tour Eiffel, Place de la Bastille…)"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSearchError(null); }}
          className="exploration-search-input"
          aria-label="Rechercher un lieu pour voir l’affluence"
          aria-describedby={searchError ? 'search-error' : undefined}
          autoComplete="off"
        />
        {searchLoading && (
          <span className="exploration-search-spinner" aria-hidden>
            <Loader2 size={20} className="spin" />
          </span>
        )}
        {searchQuery.trim() && (
          <button
            type="button"
            className="exploration-search-clear"
            onClick={handleClearSearch}
            aria-label="Effacer la recherche"
          >
            ✕
          </button>
        )}
        <button type="submit" className="exploration-search-btn">
          Voir sur la carte
        </button>
      </form>
      {searchError && (
        <p id="search-error" className="exploration-search-error" role="alert">
          {searchError}
        </p>
      )}

      <div className="exploration-filters">
        <button
          type="button"
          className={`filter-chip ${filters.parcsOnly ? 'active' : ''}`}
          onClick={() => setFilters(f => ({ ...f, parcsOnly: !f.parcsOnly }))}
        >
          <TreePine size={16} /> Parcs uniquement
        </button>
        <button
          type="button"
          className={`filter-chip ${filters.avoidMainRoads ? 'active' : ''}`}
          onClick={() => setFilters(f => ({ ...f, avoidMainRoads: !f.avoidMainRoads }))}
        >
          <Route size={16} /> Éviter les grands axes
        </button>
        <button
          type="button"
          className={`filter-chip ${filters.zonesCouvertes ? 'active' : ''}`}
          onClick={() => setFilters(f => ({ ...f, zonesCouvertes: !f.zonesCouvertes }))}
        >
          <Umbrella size={16} /> Zones couvertes
        </button>
      </div>

      <div className="exploration-map-wrap">
        <MapExploration
          userLocation={userLocation}
          densityData={densityData}
          onMapClick={handleMapClick}
          loading={loading}
          searchLocation={searchLocation}
          onSearchLocationClick={handleSearchLocationClick}
        />
        <div className="heatmap-legend exploration-legend">
          <span className="legend-item"><span className="dot calm" /> Calme</span>
          <span className="legend-item"><span className="dot moderate" /> Modéré</span>
          <span className="legend-item"><span className="dot dense" /> Dense</span>
        </div>
      </div>

      <PlaceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        place={selectedPlace}
        loading={placeDrawerLoading}
      />
    </div>
  );
};

export default ExplorationPage;
