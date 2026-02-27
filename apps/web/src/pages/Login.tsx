/**
 * Login Page — wired directly to xShield API (/auth/login + /auth/magic-link)
 */

import { Shield } from 'lucide-react';
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { apiClient, type AuthUser } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4270';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Magic link state
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicError, setMagicError] = useState('');

  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);

  function storeAndGo(token: string, user: AuthUser) {
    loginStore(token, {
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      role: user.role,
    });
    navigate('/dashboard');
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Enter your email and password');

    setLoading(true);
    try {
      const { token, user } = await apiClient.login(email, password);
      storeAndGo(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setMagicError('');
    if (!magicEmail) return setMagicError('Enter your email address');

    setMagicLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: magicEmail }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send magic link');
      setMagicSent(true);
    } catch (err) {
      setMagicError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setMagicLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Shield className="w-12 h-12 text-blue-400" />
            <span className="text-3xl font-bold text-white">xShield</span>
          </div>
          <p className="text-gray-400">Sign in to your account</p>
        </div>

        {/* Form card */}
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl border border-gray-700">
          {/* Tab toggle: Password | Magic Link */}
          <div className="flex rounded-lg bg-gray-900 p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => {
                setMagicLinkMode(false);
                setError('');
                setMagicError('');
              }}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                !magicLinkMode
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setMagicLinkMode(true);
                setError('');
                setMagicError('');
                setMagicSent(false);
              }}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                magicLinkMode
                  ? 'bg-violet-700 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Magic Link
            </button>
          </div>

          {/* Password login form */}
          {!magicLinkMode && (
            <>
              {error && (
                <Alert variant="error" dismissible className="mb-6">
                  {error}
                </Alert>
              )}
              <form onSubmit={(e) => void handleLogin(e)} className="space-y-6">
                <Input
                  type="email"
                  label="Email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  type="password"
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <Button type="submit" fullWidth isLoading={loading}>
                  Sign In
                </Button>
              </form>
            </>
          )}

          {/* Magic link form */}
          {magicLinkMode && (
            <>
              {magicSent ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-violet-900/40 flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-7 h-7 text-violet-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Check your email!</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    A login link has been sent to{' '}
                    <span className="text-violet-400">{magicEmail}</span>. The link expires in 15
                    minutes.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMagicSent(false);
                      setMagicEmail('');
                    }}
                    className="text-sm text-gray-500 hover:text-gray-300 underline"
                  >
                    Send to a different address
                  </button>
                </div>
              ) : (
                <>
                  {magicError && (
                    <Alert variant="error" dismissible className="mb-6">
                      {magicError}
                    </Alert>
                  )}
                  <p className="text-sm text-gray-400 mb-5">
                    Enter your email and we will send you a one-click sign-in link. No password
                    needed.
                  </p>
                  <form onSubmit={(e) => void handleMagicLink(e)} className="space-y-5">
                    <Input
                      type="email"
                      label="Email"
                      placeholder="you@company.com"
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                    <Button
                      type="submit"
                      fullWidth
                      isLoading={magicLoading}
                      className="bg-violet-600 hover:bg-violet-500"
                    >
                      Send Magic Link
                    </Button>
                  </form>
                </>
              )}
            </>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              {"Don't have an account?"}{' '}
              <Link to="/register" className="text-blue-400 hover:text-blue-300">
                Sign up
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-gray-400 hover:text-white text-sm">
            {'← Back to home'}
          </Link>
        </div>
      </div>
    </div>
  );
}
