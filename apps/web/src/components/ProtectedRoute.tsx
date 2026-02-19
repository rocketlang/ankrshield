/**
 * Protected Route Component
 * Redirects to login if the user is not authenticated or their token has expired.
 */

import { Navigate } from 'react-router-dom';

import { isTokenExpired } from '../lib/apiClient';
import { useAuthToken, useIsAuthenticated } from '../stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useIsAuthenticated();
  const token = useAuthToken();

  if (!isAuthenticated || isTokenExpired(token)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
