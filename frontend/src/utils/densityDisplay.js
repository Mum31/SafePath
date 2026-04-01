/** Libelle et style d'affichage pour une densite 0-1. */
export const DENSITY_GUIDE = [
  { id: 'low', range: '0 a 35%', text: "non, il n'y a pas beaucoup de monde", tone: 'calm' },
  { id: 'mid', range: '35 a 65%', text: "il y a du passage", tone: 'moderate' },
  { id: 'high', range: '65 a 100%', text: "oui, c'est charge", tone: 'dense' },
];

export function densityMeta(density) {
  const v = typeof density === 'number' && !Number.isNaN(density) ? Math.min(1, Math.max(0, density)) : null;
  if (v == null) return { label: '...', tone: 'unknown', pct: null };
  const pct = Math.round(v * 100);
  if (v < 0.35) return { label: 'Calme', tone: 'calm', pct };
  if (v < 0.65) return { label: 'Modere', tone: 'moderate', pct };
  return { label: 'Dense', tone: 'dense', pct };
}
