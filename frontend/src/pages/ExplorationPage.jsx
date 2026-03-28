import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Compass,
  Info,
  Loader2,
  LocateFixed,
  Radar,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TreePine,
  Umbrella,
  Waves,
} from 'lucide-react';
import axios from 'axios';

import MapExploration from '../components/MapExploration';
import PlaceDrawer from '../components/PlaceDrawer';
import '../App.css';
import { buildForecastTargets } from '../utils/forecast';

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
  const [filters, setFilters] = useState({
    parcsOnly: false,
    avoidMainRoads: true,
    zonesCouvertes: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setUserLocation({ lat: 48.8566, lng: 2.3522 })
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

  const densityData = predictions.map((prediction) => ({
    location: prediction.location,
    density: prediction.density,
    confidence: prediction.confidence || 0.7,
  }));

  const densitySummary = useMemo(() => {
    const total = densityData.length;
    const calm = densityData.filter((item) => (item.density ?? 0) < 0.35).length;
    const moderate = densityData.filter((item) => (item.density ?? 0) >= 0.35 && (item.density ?? 0) < 0.65).length;
    const dense = densityData.filter((item) => (item.density ?? 0) >= 0.65).length;
    const averageDensity =
      total > 0 ? densityData.reduce((sum, item) => sum + (Number(item.density) || 0), 0) / total : 0;

    return { total, calm, moderate, dense, averageDensity };
  }, [densityData]);

  const activeFilters = useMemo(
    () =>
      [
        filters.parcsOnly ? 'Parcs uniquement' : null,
        filters.avoidMainRoads ? 'Grands axes évités' : null,
        filters.zonesCouvertes ? 'Zones couvertes' : null,
      ].filter(Boolean),
    [filters]
  );

  const focusTitle = searchLocation?.name || searchLocation?.display_name || 'Paris en direct';
  const focusSubtitle =
    searchLocation?.address ||
    (userLocation ? `Autour de votre position • ${formatCoordinatesLabel(userLocation.lat, userLocation.lng)}` : 'Vue globale de la ville');

  const explorationInsights = useMemo(() => {
    const insights = [];

    if (densitySummary.calm > densitySummary.dense) {
      insights.push('La carte affiche actuellement davantage de zones calmes que de zones denses.');
    } else if (densitySummary.dense > 0) {
      insights.push('Plusieurs poches de densité sont visibles: privilégiez les zones vertes pour un trajet serein.');
    } else {
      insights.push('La carte est globalement stable pour le moment, avec peu de densité critique.');
    }

    if (filters.parcsOnly) {
      insights.push('Le filtre parcs aide à repérer rapidement des points de respiration à proximité.');
    }

    if (filters.avoidMainRoads) {
      insights.push('Le mode évitement des grands axes favorise des parcours plus confortables et moins exposés.');
    }

    if (filters.zonesCouvertes) {
      insights.push('Les zones couvertes sont utiles pour lisser le confort en cas d’intempéries ou d’affluence variable.');
    }

    if (!insights.length) {
      insights.push('Activez un ou plusieurs filtres pour personnaliser l’exploration selon votre niveau de confort.');
    }

    return insights.slice(0, 3);
  }, [densitySummary, filters]);

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
      if (!location?.lat || !location?.lng) {
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

  return (
    <div className="exploration-page">
      <section className="exploration-hero">
        <div className="exploration-hero-copy">
          <span className="exploration-kicker">
            <Sparkles size={16} />
            Exploration intelligente
          </span>
          <h1>Explorez la ville avec une lecture plus claire, plus calme, plus moderne.</h1>
          <p>
            Repérez les zones sereines, concentrez-vous sur un quartier précis et ouvrez les détails d’un lieu en un clic
            pour mieux décider avant de vous déplacer.
          </p>
        </div>

        <div className="exploration-hero-stats">
          <article className="exploration-stat-card">
            <span className="exploration-stat-label">Zone focus</span>
            <strong>{focusTitle}</strong>
            <p>{focusSubtitle}</p>
          </article>
          <article className="exploration-stat-card">
            <span className="exploration-stat-label">Lecture moyenne</span>
            <strong>{formatDensityPercent(densitySummary.averageDensity)}</strong>
            <p>{densitySummary.total} points analysés sur la carte courante.</p>
          </article>
          <article className="exploration-stat-card is-accent">
            <span className="exploration-stat-label">Zones calmes</span>
            <strong>{densitySummary.calm}</strong>
            <p>{activeFilters.length} filtre{activeFilters.length > 1 ? 's' : ''} actif{activeFilters.length > 1 ? 's' : ''}.</p>
          </article>
        </div>
      </section>

      <section className="exploration-workspace">
        <div className="exploration-main-column">
          <div className="exploration-control-shell">
            <div className="exploration-panel-head">
              <div>
                <span className="exploration-panel-kicker">
                  <Compass size={15} />
                  Recherche et filtres
                </span>
                <h2>Cadrez rapidement votre zone d’exploration</h2>
              </div>
              <span className="exploration-filter-count">
                <SlidersHorizontal size={15} />
                {activeFilters.length} actif{activeFilters.length > 1 ? 's' : ''}
              </span>
            </div>

            <form
              className="exploration-search-bar"
              onSubmit={handleSearchSubmit}
              role="search"
              aria-label="Rechercher un lieu sur la carte"
            >
              <Search size={20} className="search-icon" aria-hidden />
              <input
                type="search"
                placeholder="Adresse ou lieu (ex. Tour Eiffel, Place de la Bastille...)"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchError(null);
                }}
                className="exploration-search-input"
                aria-label="Rechercher un lieu pour voir l'affluence"
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
                  x
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
                onClick={() => setFilters((current) => ({ ...current, parcsOnly: !current.parcsOnly }))}
              >
                <TreePine size={16} /> Parcs uniquement
              </button>
              <button
                type="button"
                className={`filter-chip ${filters.avoidMainRoads ? 'active' : ''}`}
                onClick={() => setFilters((current) => ({ ...current, avoidMainRoads: !current.avoidMainRoads }))}
              >
                <Route size={16} /> Eviter les grands axes
              </button>
              <button
                type="button"
                className={`filter-chip ${filters.zonesCouvertes ? 'active' : ''}`}
                onClick={() => setFilters((current) => ({ ...current, zonesCouvertes: !current.zonesCouvertes }))}
              >
                <Umbrella size={16} /> Zones couvertes
              </button>
            </div>

            <div className="exploration-active-row">
              <div className="exploration-active-card">
                <LocateFixed size={18} />
                <div>
                  <strong>Point de vue actuel</strong>
                  <span>{focusTitle}</span>
                </div>
              </div>
              <div className="exploration-active-card">
                <Radar size={18} />
                <div>
                  <strong>Carte analysée</strong>
                  <span>{densitySummary.total} zones avec densité estimée</span>
                </div>
              </div>
            </div>
          </div>

          <div className="exploration-map-card">
            <div className="exploration-map-header">
              <div>
                <span className="exploration-panel-kicker">
                  <Waves size={15} />
                  Heatmap urbaine
                </span>
                <h2>Vue en direct de l’affluence</h2>
              </div>
              <div className="exploration-map-header-badges">
                <span className="exploration-map-badge is-calm">Calmes: {densitySummary.calm}</span>
                <span className="exploration-map-badge is-dense">Denses: {densitySummary.dense}</span>
              </div>
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

              <div className="exploration-map-overlay exploration-map-overlay-top">
                <div className="exploration-overlay-card">
                  <span className="exploration-overlay-label">Focus</span>
                  <strong>{focusTitle}</strong>
                  <p>{searchLocation ? 'Cliquez le repère pour ouvrir son analyse détaillée.' : 'Cliquez sur la carte pour inspecter un lieu.'}</p>
                </div>
                <div className="exploration-overlay-mini-grid">
                  <div className="exploration-overlay-mini">
                    <span>Calme</span>
                    <strong>{densitySummary.calm}</strong>
                  </div>
                  <div className="exploration-overlay-mini">
                    <span>Modéré</span>
                    <strong>{densitySummary.moderate}</strong>
                  </div>
                  <div className="exploration-overlay-mini">
                    <span>Dense</span>
                    <strong>{densitySummary.dense}</strong>
                  </div>
                </div>
              </div>

              <div className="heatmap-legend exploration-legend">
                <span className="legend-item">
                  <span className="dot calm" /> Calme
                </span>
                <span className="legend-item">
                  <span className="dot moderate" /> Modéré
                </span>
                <span className="legend-item">
                  <span className="dot dense" /> Dense
                </span>
              </div>
            </div>
          </div>
        </div>

        <aside className="exploration-side-column">
          <article className="exploration-side-card">
            <span className="exploration-panel-kicker">
              <Info size={15} />
              Lecture rapide
            </span>
            <h3>Comment interpréter la carte</h3>
            <ul className="exploration-insight-list">
              <li>Vert: zone plus respirable et souvent plus confortable pour marcher.</li>
              <li>Orange: fréquentation intermédiaire, à surveiller selon votre sensibilité.</li>
              <li>Rouge: densité plus forte, idéale à contourner si vous cherchez un trajet apaisé.</li>
            </ul>
          </article>

          <article className="exploration-side-card is-highlight">
            <span className="exploration-panel-kicker">
              <ShieldCheck size={15} />
              Lecture SafePath
            </span>
            <h3>Recommandations du moment</h3>
            <ul className="exploration-insight-list">
              {explorationInsights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </article>

          <article className="exploration-side-card">
            <span className="exploration-panel-kicker">
              <SlidersHorizontal size={15} />
              Filtres actifs
            </span>
            <h3>Votre configuration</h3>
            <div className="exploration-active-tags">
              {activeFilters.length ? (
                activeFilters.map((label) => (
                  <span key={label} className="exploration-active-tag">
                    {label}
                  </span>
                ))
              ) : (
                <span className="exploration-active-tag is-muted">Aucun filtre spécifique</span>
              )}
            </div>
            <p className="exploration-side-note">
              Astuce: combinez la recherche avec un clic sur la carte pour comparer plusieurs lieux très vite.
            </p>
          </article>
        </aside>
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
