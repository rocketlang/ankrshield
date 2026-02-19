/**
 * Authentication Store with Zustand
 * Manages user authentication state and JWT tokens
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  name: string | null;
  tier: string; // mapped from SSO role
  role?: string; // raw SSO role
}

interface AuthState {
  // State
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  login: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      // Actions
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setToken: (token) =>
        set({
          token,
        }),

      login: (token, user, refreshToken) => {
        // Store token in localStorage for Apollo Client
        localStorage.setItem('ankrshield_token', token);
        localStorage.setItem('ankr_access_token', token); // SSO-compatible key
        localStorage.setItem('ankrshield_user', JSON.stringify(user));
        if (refreshToken) localStorage.setItem('ankr_refresh_token', refreshToken);

        set({
          token,
          refreshToken: refreshToken ?? null,
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      logout: () => {
        // Clear localStorage
        localStorage.removeItem('ankrshield_token');
        localStorage.removeItem('ankr_access_token');
        localStorage.removeItem('ankr_refresh_token');
        localStorage.removeItem('ankrshield_user');

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      setLoading: (loading) =>
        set({
          isLoading: loading,
        }),
    }),
    {
      name: 'ankrshield-auth', // localStorage key
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selector hooks for better performance
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthToken = () => useAuthStore((state) => state.token);
