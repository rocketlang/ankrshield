/**
 * VerifyMagicLink — handles /auth/verify?token=...
 *
 * On mount: calls GET /auth/verify?token=<token from URL>
 * On success: stores JWT in localStorage, redirects to /dashboard
 * On error: shows "Link expired or invalid" + link back to /login
 */

import { Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4270';

type VerifyState = 'verifying' | 'success' | 'error';

export default function VerifyMagicLink() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerifyState>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      setErrorMsg('No token provided in the link.');
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/verify?token=${encodeURIComponent(token)}`, {
          credentials: 'include',
        });
        if (cancelled) return;

        const data = (await res.json()) as {
          success?: boolean;
          token?: string;
          email?: string;
          user?: { id: string; email: string; name: string | null; tier: string };
          error?: string;
        };

        if (!res.ok || !data.success || !data.token || !data.user) {
          setState('error');
          setErrorMsg(data.error ?? 'Invalid or expired link.');
          return;
        }

        // Store JWT and user in auth store + localStorage
        localStorage.setItem('ankrshield_token', data.token);
        loginStore(data.token, {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          tier: data.user.tier,
          role: 'user',
        });

        setState('success');
        setTimeout(() => {
          if (!cancelled) navigate('/dashboard', { replace: true });
        }, 800);
      } catch {
        if (!cancelled) {
          setState('error');
          setErrorMsg('Could not connect to the server. Please try again.');
        }
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, loginStore]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="flex items-center justify-center space-x-2 mb-10">
          <Shield className="w-10 h-10 text-blue-400" />
          <span className="text-2xl font-bold text-white">xShield</span>
        </div>

        <div className="bg-gray-800 rounded-xl p-8 shadow-xl border border-gray-700">
          {state === 'verifying' && (
            <div>
              <div className="flex justify-center mb-5">
                <div className="w-12 h-12 rounded-full bg-violet-900/40 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-violet-400 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Verifying your link...</h2>
              <p className="text-sm text-gray-400">Just a moment while we sign you in.</p>
            </div>
          )}

          {state === 'success' && (
            <div>
              <div className="flex justify-center mb-5">
                <div className="w-12 h-12 rounded-full bg-green-900/40 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Signed in!</h2>
              <p className="text-sm text-gray-400">Redirecting you to the dashboard...</p>
            </div>
          )}

          {state === 'error' && (
            <div>
              <div className="flex justify-center mb-5">
                <div className="w-12 h-12 rounded-full bg-red-900/40 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Link expired or invalid</h2>
              <p className="text-sm text-gray-400 mb-6">
                {errorMsg || 'This magic link has expired or already been used.'}
              </p>
              <Link
                to="/login"
                className="inline-block bg-violet-600 hover:bg-violet-500 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition"
              >
                Request a new link
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
