/**
 * SSO Client — thin wrapper around ANKR SSO REST API (port 4260)
 *
 * Used by Register.tsx and Login.tsx instead of GraphQL mutations.
 * All other data queries still go through Apollo/GraphQL (port 4270).
 */

const SSO_URL = import.meta.env.VITE_SSO_URL ?? 'http://localhost:4260';

export interface SsoUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface SsoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: SsoUser;
}

export interface SsoError {
  error: string;
  issues?: Array<{ message: string }>;
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${SSO_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = data as SsoError;
    throw new Error(err.error ?? 'Request failed');
  }
  return data as T;
}

export const sso = {
  register(email: string, password: string, name?: string) {
    return post<{ userId: string; message: string; devOtpPreview?: string }>('/auth/register', {
      email,
      password,
      name,
    });
  },

  login(email: string, password: string) {
    return post<SsoTokens>('/auth/login', { email, password });
  },

  sendOtp(email: string) {
    return post<{ sent: boolean; devOtpPreview?: string }>('/auth/otp/send', {
      email,
      purpose: 'login',
    });
  },

  verifyOtp(email: string, code: string) {
    return post<SsoTokens>('/auth/otp/verify', { email, code, purpose: 'login' });
  },

  async logout(token: string) {
    await fetch(`${SSO_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      /* best-effort */
    });
  },

  async refresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: string } | null> {
    try {
      const res = await fetch(`${SSO_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  oauthUrl(provider: 'google' | 'github') {
    return `${SSO_URL}/oauth/${provider}/redirect`;
  },
};
