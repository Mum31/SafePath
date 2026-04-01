import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { densityMeta } from '../utils/densityDisplay';
import { placeDetailPath } from '../utils/placeRoutes';
import { getCategoryFallbackImage, resolveSpotlightImage, spotlightImageDefaultSrc } from '../utils/spotlightImage';

function CarouselCard({ spot }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [currentImage, setCurrentImage] = useState(() => resolveSpotlightImage(spot.image, spot.category));
  const meta = densityMeta(spot.density);

  useEffect(() => {
    setImgFailed(false);
    setCurrentImage(resolveSpotlightImage(spot.image, spot.category));
  }, [spot.category, spot.image]);

  return (
    <Link to={placeDetailPath(spot)} className="caro-card">
      {!imgFailed && currentImage ? (
        <img
          src={spotlightImageDefaultSrc(currentImage)}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            const fallbackImage = getCategoryFallbackImage(spot.category);

            if (currentImage !== fallbackImage) {
              setCurrentImage(fallbackImage);
              return;
            }

            setImgFailed(true);
          }}
          className="caro-card-img"
        />
      ) : (
        <div className="caro-card-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
            <path d="M20 10c0-4.4-3.6-8-8-8s-8 3.6-8 8c0 3.8 2.8 7 8 7.5V20l3.2-2.5c.7.2 1.4.3 2.2.3 4.4 0 8-3.6 8-8z" />
          </svg>
        </div>
      )}
      <div className="caro-card-gradient" />
      <div className="caro-card-content">
        <span className="live-badge">
          <span className="live-dot" /> En direct
        </span>
        <div className="caro-card-info">
          <h3 className="caro-card-name">{spot.name}</h3>
          <p className="caro-card-city">{spot.city}</p>
          {spot.loading ? (
            <div className="caro-skel" />
          ) : !spot.error && meta.pct != null ? (
            <div className="caro-density">
              <span className={`caro-density-lbl caro-tone-${meta.tone}`}>{meta.label}</span>
              <div className="caro-density-bar">
                <div
                  className={`caro-density-fill caro-fill-${meta.tone}`}
                  style={{ width: `${meta.pct}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function CarouselSpotlights({ spotlights }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef(null);
  const touchX = useRef(null);
  const count = spotlights.length;

  const next = useCallback(() => setIndex(i => (i + 1) % count), [count]);
  const prev = useCallback(() => setIndex(i => (i - 1 + count) % count), [count]);

  // Smooth scroll to slide
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[index];
    if (slide) {
      track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
    }
  }, [index]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 4500);
    return () => clearInterval(id);
  }, [next, paused]);

  useEffect(() => {
    const h = e => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [next, prev]);

  return (
    <div
      className="caro-root"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={e => { touchX.current = e.targetTouches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const d = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(d) > 40) d > 0 ? next() : prev();
        touchX.current = null;
      }}
    >
      <div className="caro-track-wrap">
        <div className="caro-track" ref={trackRef}>
          {spotlights.map(spot => (
            <div key={spot.id} className="caro-slide">
              <CarouselCard spot={spot} />
            </div>
          ))}
        </div>
      </div>

      <button className="caro-btn caro-prev" onClick={prev} aria-label="Précédent">
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>
      <button className="caro-btn caro-next" onClick={next} aria-label="Suivant">
        <ChevronRight size={20} strokeWidth={2.5} />
      </button>

      <div className="caro-progress-wrap">
        <div
          className="caro-progress-bar"
          style={{ width: `${((index + 1) / count) * 100}%` }}
        />
      </div>
    </div>
  );
}
