import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LANDING_SPOTLIGHTS } from '../data/landingSpotlights';

function Thumb({ src, city }) {
  const [bad, setBad] = useState(!src);
  if (bad) {
    return <div className="city-strip-fallback">{city}</div>;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBad(true)}
    />
  );
}

export default function CompactCityStrip({ title = 'Lieux phares', className = '' }) {
  return (
    <section className={`city-strip-section ${className}`.trim()} aria-label={title}>
      {title ? <h2 className="city-strip-heading">{title}</h2> : null}
      <div className="city-strip-scroller">
        {LANDING_SPOTLIGHTS.map((spot) => (
          <Link
            key={spot.id}
            to={`/exploration/lieu?lat=${spot.lat}&lng=${spot.lng}&name=${encodeURIComponent(spot.name)}`}
            className="city-strip-card"
          >
            <div className="city-strip-media">
              <Thumb src={spot.image} city={spot.city} />
            </div>
            <span className="city-strip-label">{spot.city}</span>
            <span className="city-strip-sublabel">{spot.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
