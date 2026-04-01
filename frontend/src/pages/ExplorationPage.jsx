import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Compass, Loader2, LocateFixed, MapPin, Radar, Search, Sparkles } from 'lucide-react';
import axios from 'axios';

import MapExploration from '../components/MapExploration';
import PlaceDrawer from '../components/PlaceDrawer';
import '../App.css';
import './ExplorationPage.css';
import { buildForecastTargets } from '../utils/forecast';

const PARIS_FALLBACK_COORDS = { lat: 48.8566, lng: 2.3522 };
const formatCoordinatesLabel = (lat, lng) => `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
const formatDensityPercent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

export default function ExplorationPage() {
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
  const [placeDrawerLoading, setPlaceDrawerLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation(PARIS_FALLBACK_COORDS);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setUserLocation(PARIS_FALLBACK_COORDS)
    );
  }, []);

  const runGeocode = useCallback(async (query) => {
    const normalizedQuery = (query || '').trim();
    if (!normalizedQuery) {
      setSearchLocation(null);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    try {
      const response = await axios.get('/api/geocode/', { params: { q: normalizedQuery } });
      const { lat, lng, name, address, display_name: displayName } = response.data;
      setSearchLocation({
        lat,
        lng,
        name: name || displayName || normalizedQuery,
        address: address || displayName || normalizedQuery,
        display_name: displayName || address || normalizedQuery,
      });
    } catch (error) {
      const message =
        error.response?.status === 404
          ? 'Lieu introuvable. Essayez une adresse ou un lieu en France.'
          : 'Recherche indisponible. Reessayez plus tard.';
      setSearchError(message);
      setSearchLocation(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!urlQuery.trim()) {
      setSearchLocation(null);
      setSearchError(null);
      return;
    }

    setSearchQuery(urlQuery);
    runGeocode(urlQuery);
  }, [runGeocode, urlQuery]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const normalizedQuery = searchQuery.trim();

    if (!normalizedQuery) {
      setSearchParams({});
      setSearchLocation(null);
      setSearchError(null);
      return;
    }

    setSearchParams({ q: normalizedQuery });
    runGeocode(normalizedQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchError(null);
    setSearchParams({});
    setSearchLocation(null);
  };

  const handleResetView = () => {
    handleClearSearch();
    setDrawerOpen(false);
  };

  useEffect(() => {
    setLoading(true);
    axios
      .get('/api/density-prediction/', {
        params: { zone: 'paris', hour: new Date().getHours(), grid: 5 },
      })
      .then((response) => {
        setPredictions(response.data.predictions || []);
      })
      .catch(() => setPredictions([]))
      .finally(() => setLoading(false));
  }, []);

  const densityData = useMemo(
    () =>
      predictions.map((prediction) => ({
        location: prediction.location,
        density: prediction.density,
        confidence: prediction.confidence || 0.7,
      })),
    [predictions]
  );

  const densitySummary = useMemo(() => {
    const total = densityData.length;
    const calm = densityData.filter((item) => (item.density ?? 0) < 0.35).length;
    const moderate = densityData.filter((item) => (item.density ?? 0) >= 0.35 && (item.density ?? 0) < 0.65).length;
    const dense = densityData.filter((item) => (item.density ?? 0) >= 0.65).length;
    const averageDensity =
      total > 0 ? densityData.reduce((sum, item) => sum + (Number(item.density) || 0), 0) / total : 0;

    return { total, calm, moderate, dense, averageDensity };
  }, [densityData]);

  const focusTitle = searchLocation?.name || searchLocation?.display_name || 'Paris en direct';
  const focusSubtitle =
    searchLocation?.address ||
    (userLocation
      ? `Autour de votre position • ${formatCoordinatesLabel(userLocation.lat, userLocation.lng)}`
      : 'Vue globale de la ville');

  const resolvePlaceDetails = useCallback(async (lat, lng, fallbackName, fallbackAddress) => {
    try {
      const response = await axios.get('/api/reverse-geocode/', {
        params: { lat, lng },
        timeout: 5000,
      });
      return {
        name: response.data?.name || fallbackName,
        address: response.data?.address || response.data?.display_name || fallbackAddress,
      };
    } catch {
      return {
        name: fallbackName,
        address: fallbackAddress,
      };
    }
  }, []);

  const fetchPlaceDensity = useCallback(
    async (lat, lng, initialName, initialAddress) => {
      const fallbackName = initialName || 'Lieu selectionne';
      const fallbackAddress = initialAddress || formatCoordinatesLabel(lat, lng);

      setSelectedPlace({
        name: fallbackName,
        address: fallbackAddress,
        lat,
        lng,
        densityNow: 0,
        predictionsNext6h: [],
        serenityIndex: null,
      });
      setDrawerOpen(true);
      setPlaceDrawerLoading(true);

      const forecastTargets = buildForecastTargets(6);
      const predictionsPromise = Promise.all(
        forecastTargets.map((target) =>
          axios
            .get('/api/density-prediction/', { params: { lat, lng, datetime: target.iso }, timeout: 5000 })
            .then((response) => ({
              hour: response.data.hour ?? target.hour,
              density: response.data.density ?? 0.5,
              requestedDatetime: response.data.requested_datetime || target.iso,
            }))
            .catch(() => ({ hour: target.hour, density: 0.5, requestedDatetime: target.iso }))
        )
      );

      try {
        const [placeDetails, results] = await Promise.all([
          resolvePlaceDetails(lat, lng, fallbackName, fallbackAddress),
          predictionsPromise,
        ]);
        const densityNow = results[0]?.density ?? 0.5;

        setSelectedPlace({
          name: placeDetails.name || fallbackName,
          address: placeDetails.address || fallbackAddress,
          lat,
          lng,
          densityNow,
          predictionsNext6h: results.map((result) => ({
            hour: result.hour,
            density: result.density,
            requestedDatetime: result.requestedDatetime,
          })),
          serenityIndex: Math.round((1 - densityNow) * 100) / 10,
        });
      } catch {
        const fallbackDensity = 0.5;
        setSelectedPlace({
          name: fallbackName,
          address: fallbackAddress,
          lat,
          lng,
          densityNow: fallbackDensity,
          predictionsNext6h: forecastTargets.map((target) => ({
            hour: target.hour,
            density: fallbackDensity,
            requestedDatetime: target.iso,
          })),
          serenityIndex: 5,
        });
      } finally {
        setPlaceDrawerLoading(false);
      }
    },
    [resolvePlaceDetails]
  );

  const handleMapClick = useCallback(
    (point) => {
      fetchPlaceDensity(point.lat, point.lng, null, null);
    },
    [fetchPlaceDensity]
  );

  const handleSearchLocationClick = useCallback(
    (location) => {
      if (location?.lat == null || location?.lng == null) {
        return;
      }

      fetchPlaceDensity(
        location.lat,
        location.lng,
        location.name || location.display_name || 'Lieu recherche',
        location.address || location.display_name || null
      );
    },
    [fetchPlaceDensity]
  );

  const handleOpenMyLocation = () => {
    if (!userLocation) {
      return;
    }

    fetchPlaceDensity(userLocation.lat, userLocation.lng, 'Ma position', formatCoordinatesLabel(userLocation.lat, userLocation.lng));
  };

  return (
    <div className="ep-root">
      <header className="ep-topbar">
        <div className="ep-brand" aria-hidden="true">
          <span className="ep-brand-dot" />
          <span className="ep-brand-label">EXPLORATION</span>
        </div>

        <div className="ep-search-wrap">
          <form className="ep-search-form" onSubmit={handleSearchSubmit} role="search" aria-label="Rechercher un lieu">
            <Search size={18} />
            <input
              type="search"
              className="ep-search-input"
              placeholder="Tour Eiffel, gare, quartier..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchError(null);
              }}
              aria-describedby={searchError ? 'ep-search-error' : undefined}
              autoComplete="off"
            />
            {searchLoading && <Loader2 size={18} className="ep-spin" />}
            {searchQuery.trim() && (
              <button type="button" className="ep-search-clear" onClick={handleClearSearch} aria-label="Effacer">
                x
              </button>
            )}
            <button type="submit" className="ep-search-btn">
              Voir
            </button>
          </form>

          {searchError && (
            <div id="ep-search-error" className="ep-search-error" role="alert">
              {searchError}
            </div>
          )}
        </div>

        <div className="ep-stats">
          <div className="ep-stat">
            <span className="ep-stat-dot calm" />
            <span className="ep-stat-num">{densitySummary.calm}</span>
            <span className="ep-stat-lbl">calmes</span>
          </div>
          <div className="ep-stat">
            <span className="ep-stat-dot avg" />
            <span className="ep-stat-num">{formatDensityPercent(densitySummary.averageDensity)}</span>
            <span className="ep-stat-lbl">moyenne</span>
          </div>
          <div className="ep-stat">
            <span className="ep-stat-dot dense" />
            <span className="ep-stat-num">{densitySummary.dense}</span>
            <span className="ep-stat-lbl">denses</span>
          </div>
        </div>
      </header>

      <section className="ep-map-area">
        <MapExploration
          userLocation={userLocation}
          densityData={densityData}
          onMapClick={handleMapClick}
          searchLocation={searchLocation}
          onSearchLocationClick={handleSearchLocationClick}
        />

        {loading && (
          <div className="ep-loading" role="status" aria-live="polite">
            <Loader2 size={18} className="ep-spin" />
            <span>Mise a jour de la densite...</span>
          </div>
        )}

        <div className="ep-map-info">
          <div className="ep-info-pill">
            <div className="ep-info-pill-icon">
              <Radar size={14} />
            </div>
            <div className="ep-info-pill-text">
              <strong>{focusTitle}</strong>
              <span>{focusSubtitle}</span>
            </div>
          </div>

          <div className="ep-info-pill">
            <div className="ep-info-pill-icon">
              <MapPin size={14} />
            </div>
            <div className="ep-info-pill-text">
              <strong>Action rapide</strong>
              <span>{searchLocation ? 'Touchez le repere ou ouvrez sa fiche en bas.' : 'Touchez la carte pour analyser un point.'}</span>
            </div>
          </div>
        </div>

        <div className="ep-hint">
          <Compass size={13} />
          Carte live de densite. Un clic ouvre le detail du lieu.
        </div>

        <div className="ep-legend" aria-label="Legende de densite">
          <span className="ep-legend-item">
            <span className="ep-legend-dot calm" />
            Calme
          </span>
          <span className="ep-legend-item">
            <span className="ep-legend-dot moderate" />
            Modere
          </span>
          <span className="ep-legend-item">
            <span className="ep-legend-dot dense" />
            Dense
          </span>
        </div>

        <div className="ep-filter-bar" aria-label="Actions rapides">
          <button type="button" className={`ep-filter-chip ${!searchLocation ? 'active' : ''}`} onClick={handleResetView}>
            <Sparkles size={14} />
            Paris
          </button>
          <button type="button" className="ep-filter-chip" onClick={handleOpenMyLocation} disabled={!userLocation}>
            <LocateFixed size={14} />
            Autour de moi
          </button>
          {searchLocation && (
            <button type="button" className="ep-filter-chip active" onClick={() => handleSearchLocationClick(searchLocation)}>
              <MapPin size={14} />
              Ouvrir {searchLocation.name || 'le lieu'}
            </button>
          )}
          {searchLocation && (
            <>
              <span className="ep-filter-sep" aria-hidden="true" />
              <button type="button" className="ep-filter-chip" onClick={handleResetView}>
                Effacer le focus
              </button>
            </>
          )}
        </div>
      </section>

      <PlaceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        place={selectedPlace}
        loading={placeDrawerLoading}
      />
    </div>
  );
}
