const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_STREET_VIEW_API_KEY || '';

const GOOGLE_MAPS_SCRIPT_ID = 'safepath-google-maps-api';
const GOOGLE_MAPS_CALLBACK_NAME = '__safePathGoogleMapsInit';

let googleMapsPromise = null;

function cleanupGoogleMapsCallback() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    delete window[GOOGLE_MAPS_CALLBACK_NAME];
  } catch {
    window[GOOGLE_MAPS_CALLBACK_NAME] = undefined;
  }
}

export function getGoogleMapsApiKey() {
  return GOOGLE_MAPS_API_KEY;
}

export function hasGoogleMapsApiKey() {
  return Boolean(GOOGLE_MAPS_API_KEY);
}

export function loadGoogleMapsApi() {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('missing_google_maps_api_key'));
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('google_maps_requires_browser'));
  }

  if (window.google?.maps?.StreetViewPanorama) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const resolveMaps = () => {
      cleanupGoogleMapsCallback();
      if (window.google?.maps) {
        resolve(window.google.maps);
        return;
      }

      googleMapsPromise = null;
      reject(new Error('google_maps_not_available'));
    };

    const rejectMaps = () => {
      cleanupGoogleMapsCallback();
      googleMapsPromise = null;
      reject(new Error('google_maps_load_failed'));
    };

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener('load', resolveMaps, { once: true });
      existingScript.addEventListener('error', rejectMaps, { once: true });
      return;
    }

    window[GOOGLE_MAPS_CALLBACK_NAME] = resolveMaps;

    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      loading: 'async',
      callback: GOOGLE_MAPS_CALLBACK_NAME,
      v: 'weekly',
      language: 'fr',
      region: 'FR',
    });

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.onerror = rejectMaps;

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
