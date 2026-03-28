import { getGoogleMapsApiKey, hasGoogleMapsApiKey } from './googleMaps';

const STREET_VIEW_API_KEY = getGoogleMapsApiKey();

export function buildStreetPreviewUrl({ lat, lng, width = 960, height = 540, heading = 0, pitch = 0, fov = 90 }) {
  if (!STREET_VIEW_API_KEY || lat == null || lng == null) {
    return null;
  }

  const params = new URLSearchParams({
    size: `${width}x${height}`,
    location: `${lat},${lng}`,
    heading: String(heading),
    pitch: String(pitch),
    fov: String(fov),
    source: 'outdoor',
    key: STREET_VIEW_API_KEY,
  });

  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

export function hasStreetPreviewProvider() {
  return hasGoogleMapsApiKey();
}
