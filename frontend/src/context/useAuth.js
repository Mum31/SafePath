import { useContext } from 'react';

import AuthContext from './auth-context';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit etre utilise dans AuthProvider');
  }
  return context;
}
