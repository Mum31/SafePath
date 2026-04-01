/**
 * Lieux mis en avant sur l'accueil : image + coords pour /api/density-prediction/
 * `category` regroupe les fiches pour la section « Catégorie d'établissement » (esprit Affluences).
 * Zone cible : Île-de-France uniquement.
 */
export const LANDING_CATEGORY_LABELS = {
  museum: 'Musées & culture',
  monument: 'Monuments & patrimoine',
  urban: 'Centres-villes & places',
};

/** Ordre d'affichage des rangées « catégorie » */
export const LANDING_CATEGORY_ORDER = ['museum', 'monument', 'urban'];

export const LANDING_SPOTLIGHTS = [
  // ── Musées ──────────────────────────────────────────────────────────────
  {
    id: 'louvre',
    name: 'Louvre',
    city: 'Paris',
    category: 'museum',
    lat: 48.860611,
    lng: 2.337644,
    image:
      'https://images.unsplash.com/photo-1752166964586-a71fa13289d1?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'orsay',
    name: "Musée d'Orsay",
    city: 'Paris',
    category: 'museum',
    lat: 48.860001,
    lng: 2.326987,
    image:
      'https://images.unsplash.com/photo-1632127255440-6e35813e7b60?fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'pompidou',
    name: 'Centre Pompidou',
    city: 'Paris',
    category: 'museum',
    lat: 48.860642,
    lng: 2.352245,
    image:
      'https://images.unsplash.com/photo-1741708240982-d630ebf0c5ac?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },

  // ── Monuments ───────────────────────────────────────────────────────────
  {
    id: 'eiffel',
    name: 'Tour Eiffel',
    city: 'Paris',
    category: 'monument',
    lat: 48.85837,
    lng: 2.294481,
    image:
      'https://images.unsplash.com/photo-1742388485112-f993e2ed062e?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'notre-dame',
    name: 'Notre-Dame',
    city: 'Paris',
    category: 'monument',
    lat: 48.852968,
    lng: 2.349902,
    image:
      'https://images.unsplash.com/photo-1752166830643-1c04246ab894?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'sacre-coeur',
    name: 'Sacré-Cœur',
    city: 'Paris',
    category: 'monument',
    lat: 48.886705,
    lng: 2.343104,
    image:
      'https://images.unsplash.com/photo-1756476871643-1928e9bdb56e?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'versailles',
    name: 'Château de Versailles',
    city: 'Versailles',
    category: 'monument',
    lat: 48.804865,
    lng: 2.120355,
    image:
      'https://images.unsplash.com/photo-1748126914101-d9b6550f17c7?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'arc-triomphe',
    name: 'Arc de Triomphe',
    city: 'Paris',
    category: 'monument',
    lat: 48.873792,
    lng: 2.295028,
    image:
      'https://images.unsplash.com/photo-1752887624201-0c09d8b3df1e?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'invalides',
    name: 'Hôtel des Invalides',
    city: 'Paris',
    category: 'monument',
    lat: 48.855290,
    lng: 2.312375,
    image:
      'https://images.unsplash.com/photo-1744047336434-6f06ee309e6f?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },

  // ── Places & centres-villes ─────────────────────────────────────────────
  {
    id: 'bastille',
    name: 'Place de la Bastille',
    city: 'Paris',
    category: 'urban',
    lat: 48.853291,
    lng: 2.369013,
    image:
      'https://images.unsplash.com/photo-1749867785944-4c6176820f4e?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'defense',
    name: 'La Défense',
    city: 'Puteaux',
    category: 'urban',
    lat: 48.891552,
    lng: 2.236366,
    image:
      'https://images.unsplash.com/photo-1760454386136-0f2b76f7a743?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
  {
    id: 'marais',
    name: 'Le Marais',
    city: 'Paris',
    category: 'urban',
    lat: 48.857368,
    lng: 2.354950,
    image:
      'https://images.unsplash.com/photo-1673688242253-a7e62c9ed524?auto=format&fit=crop&fm=jpg&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&ixlib=rb-4.1.0&q=60&w=3000',
  },
];
