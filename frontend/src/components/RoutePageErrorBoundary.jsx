import React from 'react';

class RoutePageErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('RoutePage error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="route-page route-page-error" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-text)', marginBottom: '1rem' }}>Erreur sur la page Itinéraire</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Une erreur inattendue s&apos;est produite. Rechargez la page ou revenez à l&apos;accueil.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default RoutePageErrorBoundary;
