const CATEGORY_FALLBACK_IMAGES = {
  museum: 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Inside_the_Louvre_Pyramid.jpg',
  monument: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Eiffel_Tower%2CParis.jpg',
  urban: 'https://upload.wikimedia.org/wikipedia/commons/0/06/La_Defense%2C_Paris.jpg',
  explore: 'https://upload.wikimedia.org/wikipedia/commons/8/83/Paris_skyline.jpg',
};

function isUnsplashUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return false;

  try {
    const { hostname } = new URL(imageUrl);
    return hostname.includes('unsplash.com');
  } catch {
    return false;
  }
}

export function getCategoryFallbackImage(category) {
  return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES.explore;
}

export function resolveSpotlightImage(imageUrl, category) {
  if (imageUrl && typeof imageUrl === 'string') {
    return imageUrl;
  }

  return getCategoryFallbackImage(category);
}

/**
 * Unsplash: derive plusieurs largeurs pour srcset.
 * Pour les autres sources, on garde l'URL d'origine.
 */
export function buildSpotlightSrcSet(imageUrl) {
  if (!isUnsplashUrl(imageUrl)) return undefined;

  const q = (imgUrl, w) => {
    const u = new URL(imgUrl);
    u.searchParams.set('w', String(w));
    u.searchParams.set('q', '92');
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'crop');
    u.searchParams.set('fm', 'webp');
    return u.toString();
  };

  const w640 = q(imageUrl, 640);
  const w960 = q(imageUrl, 960);
  const w1400 = q(imageUrl, 1400);
  return `${w640} 640w, ${w960} 960w, ${w1400} 1400w`;
}

export function spotlightImageDefaultSrc(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return '';
  if (!isUnsplashUrl(imageUrl)) return imageUrl;

  const u = new URL(imageUrl);
  u.searchParams.set('w', '1400');
  u.searchParams.set('q', '92');
  u.searchParams.set('auto', 'format');
  u.searchParams.set('fit', 'crop');
  u.searchParams.set('fm', 'webp');
  return u.toString();
}
