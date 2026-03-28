import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/useAuth';

export default function ProtectedRoute({ children }) {
  const { authLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return <div className="auth-route-loading">Verification de la session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return children;
}
