/** Chemin React Router vers la fiche lieu (PlaceDetailPage). */
export function placeDetailPath(spot) {
  const lat = spot.lat;
  const lng = spot.lng;
  const name = spot.name ?? '';
  return `/exploration/lieu?lat=${lat}&lng=${lng}&name=${encodeURIComponent(name)}`;
}
