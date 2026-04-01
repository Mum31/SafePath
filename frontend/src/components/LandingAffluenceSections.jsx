import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { densityMeta } from '../utils/densityDisplay';
import { placeDetailPath } from '../utils/placeRoutes';
import {
  buildSpotlightSrcSet,
  getCategoryFallbackImage,
  resolveSpotlightImage,
  spotlightImageDefaultSrc,
} from '../utils/spotlightImage';

function LandingSpotlightImage({ imageUrl, label, category }) {
  const fallbackImage = getCategoryFallbackImage(category);
  const [currentImage, setCurrentImage] = useState(() => resolveSpotlightImage(imageUrl, category));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentImage(resolveSpotlightImage(imageUrl, category));
    setFailed(false);
  }, [category, imageUrl]);

  const src = spotlightImageDefaultSrc(currentImage);
  const srcSet = buildSpotlightSrcSet(currentImage);

  if (failed) {
    return (
      <div className="spotlight-card-fallback landing-spot-fallback">
        <svg className="spotlight-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M20 10c0-4.4-3.6-8-8-8s-8 3.6-8 8c0 3.8 2.8 7 8 7.5V20l3.2-2.5c.7.2 1.4.3 2.2.3 4.4 0 8-3.6 8-8z" />
        </svg>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes="(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 320px"
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (currentImage !== fallbackImage) {
          setCurrentImage(fallbackImage);
          return;
        }

        setFailed(true);
      }}
      className="spotlight-image landing-spot-image-crisp"
    />
  );
}

export function CrowdPlacesSection({ spotlights }) {
  const sorted = useMemo(() => {
    const copy = [...spotlights];
    copy.sort((a, b) => {
      const da = typeof a.density === 'number' ? a.density : -1;
      const db = typeof b.density === 'number' ? b.density : -1;
      return db - da;
    });
    return copy;
  }, [spotlights]);

  return (
    <div className="landing-crowd-grid">
      {sorted.map((spot) => {
        const meta = densityMeta(spot.density);
        const to = placeDetailPath(spot);
        return (
          <article key={spot.id} className="landing-crowd-card">
            <Link to={to} className="landing-crowd-card-link">
              <div className="landing-crowd-media">
                <LandingSpotlightImage imageUrl={spot.image} label={spot.name} category={spot.category} />
                <div className="spotlight-card-gradient" />
                <span className="landing-crowd-city">{spot.city}</span>
              </div>
              <div className="landing-crowd-body">
                <h3 className="landing-crowd-name">{spot.name}</h3>
                <div className="spotlight-card-meter">
                  {spot.loading ? (
                    <span className="spotlight-skeleton-text" />
                  ) : spot.error ? (
                    <span className="spotlight-fallback">Indisponible</span>
                  ) : (
                    <>
                      <span className={`spotlight-level spotlight-level-${meta.tone}`}>{meta.label}</span>
                      <span className="spotlight-pct">{meta.pct}%</span>
                    </>
                  )}
                </div>
                {!spot.loading && !spot.error && meta.pct != null && (
                  <div className="spotlight-bar">
                    <span
                      className={`spotlight-bar-fill spotlight-bar-${meta.tone}`}
                      style={{ width: `${meta.pct}%` }}
                    />
                  </div>
                )}
                <span className="landing-crowd-cta">
                  Fiche complète <ChevronRight size={16} aria-hidden />
                </span>
              </div>
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export function CategoryPlaceRows({ spotlights, categoryOrder, categoryLabels }) {
  const byCategory = useMemo(() => {
    const m = Object.fromEntries(categoryOrder.map((k) => [k, []]));
    for (const s of spotlights) {
      if (m[s.category]) m[s.category].push(s);
    }
    return m;
  }, [spotlights, categoryOrder]);

  return (
    <div className="landing-category-stack">
      {categoryOrder.map((key) => {
        const list = byCategory[key] || [];
        if (!list.length) return null;
        const title = categoryLabels[key] || key;
        return (
          <section key={key} className="landing-category-block" aria-labelledby={`cat-${key}`}>
            <div className="landing-category-head">
              <h3 id={`cat-${key}`} className="landing-category-title">
                {title}
              </h3>
            </div>
            <div className="landing-category-scroller">
              {list.map((spot) => {
                const to = placeDetailPath(spot);
                return (
                  <article key={spot.id} className="landing-category-card">
                    <Link to={to} className="landing-category-card-link">
                      <div className="landing-category-media">
                        <LandingSpotlightImage imageUrl={spot.image} label={spot.name} category={spot.category} />
                        <div className="spotlight-card-gradient" />
                      </div>
                      <div className="landing-category-body">
                        <span className="landing-category-name">{spot.name}</span>
                        <span className="landing-category-meta">{spot.city}</span>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
