/**
 * Login Page — wired directly to xShield API (/auth/login)
 */

import { Shield } from 'lucide-react';
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { apiClient, type AuthUser } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          {error && (
            <Alert variant="error" dismissible className="mb-6">
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
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

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-400 hover:text-blue-300">
                Sign up
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-gray-400 hover:text-white text-sm">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
