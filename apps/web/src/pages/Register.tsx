/**
 * Register Page — wired directly to xShield API (/auth/register)
 *
 * Password strength is computed locally (no round-trip).
 * Registration returns a JWT immediately — no OTP step.
 */

import { Shield } from 'lucide-react';
import { useState, useEffect, useRef, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { apiClient, type AuthUser } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';

// ── Local password strength ───────────────────────────────────────────────────

interface PasswordStrength {
  score: number; // 0–4
  label: string;
  acceptable: boolean;
  feedback: string[];
  crackTime: string;
}

function calcPasswordStrength(pw: string): PasswordStrength {
  if (!pw) {
    return {
      score: 0,
      label: 'very_weak',
      acceptable: false,
      feedback: ['Password is required'],
      crackTime: 'instant',
    };
  }

  let score = 0;
  const feedback: string[] = [];

  if (pw.length >= 8) score++;
  else feedback.push('Use at least 8 characters');

  if (/[A-Z]/.test(pw)) score++;
  else feedback.push('Add uppercase letters');

  if (/[0-9]/.test(pw)) score++;
  else feedback.push('Add numbers');

  if (/[^A-Za-z0-9]/.test(pw)) score++;
  else feedback.push('Add special characters (!@#$…)');

  // Bonus: longer passwords
  if (pw.length >= 14) score = Math.min(score + 1, 4);

  const labels = ['very_weak', 'weak', 'fair', 'strong', 'very_strong'];
  const crackTimes = ['instant', 'minutes', 'hours', 'days', 'years+'];

  return {
    score,
    label: labels[score],
    acceptable: score >= 2,
    feedback: feedback.length ? feedback : ['Strong password!'],
    crackTime: crackTimes[score],
  };
}

// ── Strength bar config ───────────────────────────────────────────────────────

const STRENGTH_CONFIG = [
  { label: 'Very Weak', color: 'bg-red-500', textColor: 'text-red-400', bars: 1 },
  { label: 'Weak', color: 'bg-orange-500', textColor: 'text-orange-400', bars: 2 },
  { label: 'Fair', color: 'bg-yellow-500', textColor: 'text-yellow-400', bars: 3 },
  { label: 'Strong', color: 'bg-green-500', textColor: 'text-green-400', bars: 4 },
  { label: 'Very Strong', color: 'bg-emerald-400', textColor: 'text-emerald-400', bars: 5 },
] as const;

function PasswordStrengthMeter({ strength }: { strength: PasswordStrength }) {
  const cfg = STRENGTH_CONFIG[Math.min(strength.score, 4)];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i < cfg.bars ? cfg.color : 'bg-gray-600'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${cfg.textColor}`}>{cfg.label}</span>
        <span className="text-gray-500">crack time: {strength.crackTime}</span>
      </div>
      {strength.feedback.length > 0 && strength.feedback[0] !== 'Strong password!' && (
        <ul className="space-y-0.5">
          {strength.feedback.map((f, i) => (
            <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
              <span className="text-yellow-500 mt-0.5 shrink-0">›</span>
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [strength, setStrength] = useState<PasswordStrength | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);

  // Live password strength — debounced 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!password) {
      setStrength(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setStrength(calcPasswordStrength(password));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [password]);

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

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      return setError('Please fill in all fields');
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError('Please enter a valid email address');
    }
    if (strength && !strength.acceptable) {
      return setError(
        `Password too weak — ${strength.feedback[0] ?? 'choose a stronger password'}`
      );
    }

    setLoading(true);
    try {
      const { token, user } = await apiClient.register(email, password, name);
      storeAndGo(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
          <p className="text-gray-400">Create your account</p>
        </div>

        {/* Form card */}
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl border border-gray-700">
          {error && (
            <Alert variant="error" dismissible className="mb-6">
              {error}
            </Alert>
          )}

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

            {/* Password + live strength meter */}
            <div>
              <Input
                type="password"
                label="Password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {strength && <PasswordStrengthMeter strength={strength} />}
            </div>

            <Input
              type="password"
              label="Confirm Password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />

            <Button
              type="submit"
              fullWidth
              isLoading={loading}
              disabled={loading || (strength !== null && !strength.acceptable)}
            >
              Create Account
            </Button>
          </form>

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
