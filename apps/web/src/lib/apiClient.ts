/**
 * API Client — typed wrapper around the xShield REST API
 *
 * Auth endpoints: POST /auth/register | /auth/login | /auth/refresh | /auth/logout | GET /auth/me
 * Refresh token lives in an httpOnly cookie (xsh_refresh) — sent automatically via credentials:'include'
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4270';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ankrshield_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // carries httpOnly xsh_refresh cookie
  });

  if (res.status === 204) return undefined as unknown as T;

  const data = await res.json();
  if (!res.ok) {
    const msg: string =
      (data as { message?: string; error?: string }).message ??
      (data as { message?: string; error?: string }).error ??
      'Request failed';
    throw new Error(msg);
  }
  return data as T;
}

export const apiClient = {
  register(email: string, password: string, name: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async refresh(): Promise<{ token: string } | null> {
    try {
      return await request<{ token: string }>('/auth/refresh', { method: 'POST' });
    } catch {
      return null;
    }
  },

  logout(): Promise<void> {
    return request('/auth/logout', { method: 'POST' }).catch(() => {
      /* best-effort */
    }) as Promise<void>;
  },

  me(): Promise<AuthUser> {
    return request<AuthUser>('/auth/me');
  },
};

/** Decode JWT exp without verification. Returns expiry ms, or null. */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const exp = jwtExpiry(token);
  return exp === null || exp < Date.now();
}
