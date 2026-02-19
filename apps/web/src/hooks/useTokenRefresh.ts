/**
 * useTokenRefresh — silently refreshes the JWT access token 5 minutes before expiry.
 *
 * Uses the httpOnly xsh_refresh cookie (sent automatically by the browser).
 * If refresh fails, logs the user out.
 *
 * Mount this once near the top of the app (inside App.tsx's inner component).
 */

import { useEffect, useRef } from 'react';

import { apiClient, jwtExpiry } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';

const REFRESH_BEFORE_MS = 5 * 60 * 1000; // 5 minutes

export function useTokenRefresh() {
  const token = useAuthStore((s) => s.token);
  const loginStore = useAuthStore((s) => s.login);
  const logoutStore = useAuthStore((s) => s.logout);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!token) return;

    const expMs = jwtExpiry(token);
    if (!expMs) return;

    const delay = expMs - Date.now() - REFRESH_BEFORE_MS;

    async function doRefresh() {
      const result = await apiClient.refresh();
      if (result?.token) {
        const user = useAuthStore.getState().user;
        if (user) loginStore(result.token, user);
      } else {
        logoutStore();
      }
    }

    if (delay <= 0) {
      doRefresh();
      return;
    }

    timerRef.current = setTimeout(doRefresh, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [token, loginStore, logoutStore]);
}
