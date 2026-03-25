import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';

/**
 * Error boundary pour la page fiche lieu.
 * Évite une page blanche si un composant (ex. Recharts) plante.
 */
class PlaceDetailErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err, info) {
    console.warn('[PlaceDetailErrorBoundary]', err, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="place-detail-page place-detail-error" style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
          <Link to="/exploration" className="place-detail-back">
            <ArrowLeft size={20} /> Retour à l’exploration
          </Link>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <MapPin size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} aria-hidden />
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--color-text)' }}>
              Une erreur s&apos;est produite
            </h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              La fiche du lieu n&apos;a pas pu s&apos;afficher correctement. Revenez à l&apos;exploration ou réessayez.
            </p>
            <Link
              to="/exploration"
              style={{
                display: 'inline-block',
                padding: '0.6rem 1.2rem',
                background: 'var(--color-accent)',
                color: 'var(--color-bg)',
                borderRadius: 'var(--radius)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Retour à l’exploration
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default PlaceDetailErrorBoundary;
