import React from 'react';
import { BarChart3 } from 'lucide-react';

/**
 * Error boundary pour les graphiques Recharts.
 * Évite qu'une erreur dans <Text> ou autre composant interne ne fasse planter toute la page.
 */
class ChartErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err, info) {
    console.warn('[ChartErrorBoundary]', err, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="chart-error-fallback" role="img" aria-label="Graphique non disponible">
          <BarChart3 size={32} className="chart-error-icon" />
          <p>Graphique temporairement indisponible</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ChartErrorBoundary;
