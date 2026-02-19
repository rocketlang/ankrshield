/**
 * Register Page — wired to ANKR SSO (port 4260)
 *
 * Flow: email + password → POST /auth/register → OTP sent to email
 *       user enters OTP  → POST /auth/otp/verify → JWT issued → dashboard
 */

import { Shield } from 'lucide-react';
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { sso } from '../lib/ssoClient';
import { useAuthStore } from '../stores/authStore';

type Step = 'form' | 'verify';

export default function Register() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devPreview, setDevPreview] = useState<string | null>(null);

  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  // Step 1 — create account → SSO sends OTP to email
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      return setError('Please fill in all fields');
    }
    if (password.length < 8) {
      return setError('Password must be at least 8 characters');
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError('Please enter a valid email address');
    }

    setLoading(true);
    try {
      const res = await sso.register(email, password, name);
      if (res.devOtpPreview) {
        setDevPreview(res.devOtpPreview);
        console.log('[dev] OTP preview:', res.devOtpPreview);
      }
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — verify email OTP → get JWT → go to dashboard
  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!otpCode || otpCode.length !== 6) {
      return setError('Enter the 6-digit code from your email');
    }

    setLoading(true);
    try {
      const tokens = await sso.verifyOtp(email, otpCode);

      login(
        tokens.accessToken,
        {
          id: tokens.user.id,
          email: tokens.user.email,
          name: tokens.user.name,
          tier: tokens.user.role === 'admin' ? 'enterprise' : 'free',
          role: tokens.user.role,
        },
        tokens.refreshToken
      );

      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Shield className="w-12 h-12 text-blue-400" />
            <span className="text-3xl font-bold text-white">xShield</span>
          </div>
          <p className="text-gray-400">
            {step === 'form' ? 'Create your account' : 'Verify your email'}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl border border-gray-700">
          {error && (
            <Alert variant="error" dismissible className="mb-6">
              {error}
            </Alert>
          )}

          {/* Dev OTP preview */}
          {devPreview && (
            <div className="mb-4 p-3 bg-yellow-900/40 border border-yellow-700 rounded text-yellow-300 text-xs">
              <span className="font-semibold">Dev mode:</span>{' '}
              <a href={devPreview} target="_blank" rel="noreferrer" className="underline">
                Preview OTP email
              </a>
            </div>
          )}

          {step === 'form' ? (
            <form onSubmit={handleRegister} className="space-y-6">
              <Input
                type="text"
                label="Name"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
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
                autoComplete="new-password"
                helperText="At least 8 characters"
              />
              <Input
                type="password"
                label="Confirm Password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <Button type="submit" fullWidth isLoading={loading}>
                Create Account
              </Button>

              {/* OAuth shortcuts */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-800 text-gray-400">or sign up with</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={sso.oauthUrl('google')}
                  className="flex items-center justify-center gap-2 py-2 px-3 border border-gray-600 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  Google
                </a>
                <a
                  href={sso.oauthUrl('github')}
                  className="flex items-center justify-center gap-2 py-2 px-3 border border-gray-600 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                  GitHub
                </a>
              </div>
            </form>
          ) : (
            /* Step 2 — OTP verification */
            <form onSubmit={handleVerify} className="space-y-6">
              <div className="text-center text-sm text-gray-400 mb-2">
                A 6-digit code was sent to <span className="text-white font-medium">{email}</span>
              </div>
              <Input
                type="text"
                label="Verification Code"
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoComplete="one-time-code"
                inputMode="numeric"
              />
              <Button type="submit" fullWidth isLoading={loading}>
                Verify & Enter Dashboard
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setError('');
                  setOtpCode('');
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Back to registration
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 hover:text-blue-300">
                Sign in
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
