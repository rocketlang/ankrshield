/**
 * xShield AI — Pricing Page
 * Four-tier pricing with dark theme matching Landing.tsx
 */

import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Inline Badge (same pattern as Landing.tsx) ─────────────────────────────
function Badge({ children, color = 'cyan' }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    cyan: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
    red: 'bg-red-500/15 border-red-500/40 text-red-300',
    purple: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
    amber: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    green: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest ${map[color] ?? map.cyan}`}
    >
      {children}
    </span>
  );
}

// ─── Tier data ────────────────────────────────────────────────────────────────
interface Tier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight: boolean;
  badgeLabel?: string;
  badgeColor?: string;
}

const tiers: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'Get started with domain risk intelligence at no cost.',
    features: [
      '10 risk reports / month',
      'No API key required',
      'Basic DNS audit',
      'Community support',
    ],
    cta: 'Get Started',
    ctaHref: '/register',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$99',
    period: '/mo',
    description: 'For teams that need regular domain monitoring.',
    features: [
      '500 reports / month',
      'API key access',
      'Webhook integrations',
      'Domain Watch (5 domains)',
      'Email alerts',
    ],
    cta: 'Start Trial',
    ctaHref: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$499',
    period: '/mo',
    description: 'Full-stack threat intelligence for security teams.',
    features: [
      'Unlimited reports',
      'API key access',
      'All integrations',
      'Slack / Jira / PagerDuty',
      '50 watched domains',
      'Remediation playbooks',
    ],
    cta: 'Go Pro',
    ctaHref: '/register',
    highlight: true,
    badgeLabel: 'Most Popular',
    badgeColor: 'cyan',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Tailored for large organisations and MSSPs.',
    features: [
      'White-label deployment',
      'SLA guarantee',
      'On-premise option',
      'SSO / SAML',
      'Unlimited domains',
      'Dedicated support engineer',
    ],
    cta: 'Contact Sales',
    ctaHref: 'mailto:sales@xshieldai.com',
    highlight: false,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Pricing() {
  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      {/* Nav bar ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-black tracking-tight">
            x<span className="text-cyan-400">Shield</span>
            <span className="text-white/40 font-light"> AI</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-white/60">
          <Link to="/" className="hover:text-white transition">
            Home
          </Link>
          <Link to="/live" className="hover:text-white transition">
            Live Threats
          </Link>
          <Link to="/login" className="hover:text-white transition">
            Login
          </Link>
          <Link
            to="/register"
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-4 py-2 rounded-lg transition"
          >
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero ────────────────────────────────────────────────────────────────── */}
      <section className="text-center py-20 px-6 max-w-4xl mx-auto">
        <Badge color="purple">Pricing</Badge>
        <h1 className="mt-6 text-5xl font-black tracking-tight leading-tight">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-white/50 max-w-xl mx-auto">
          API-first domain risk intelligence. No hidden fees, no per-seat madness. Scale from free
          to enterprise without changing your integration.
        </p>
      </section>

      {/* Tier cards ──────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-2xl border p-8 transition ${
                tier.highlight
                  ? 'border-cyan-500/50 bg-cyan-500/[0.05] shadow-[0_0_40px_-8px_rgba(6,182,212,0.25)]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20'
              }`}
            >
              {/* Most Popular badge */}
              {tier.badgeLabel && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <Badge color={tier.badgeColor ?? 'cyan'}>{tier.badgeLabel}</Badge>
                </div>
              )}

              {/* Tier name */}
              <p className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">
                {tier.name}
              </p>

              {/* Price */}
              <div className="flex items-end gap-1 mb-2">
                <span className="text-5xl font-black">{tier.price}</span>
                {tier.period && <span className="text-white/40 mb-1.5 text-lg">{tier.period}</span>}
              </div>

              {/* Description */}
              <p className="text-sm text-white/50 mb-8 leading-relaxed">{tier.description}</p>

              {/* Features */}
              <ul className="space-y-3 flex-1 mb-8">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-white/70">
                    <Check className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href={tier.ctaHref}
                className={`block text-center py-3 px-6 rounded-xl font-bold text-sm transition ${
                  tier.highlight
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-black'
                    : 'bg-white/[0.07] hover:bg-white/[0.12] text-white border border-white/10'
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Comparison note ─────────────────────────────────────────────────── */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-2xl px-8 py-5">
            <span className="text-2xl">💡</span>
            <p className="text-white/60 text-sm leading-relaxed">
              <span className="text-white font-semibold">
                350x cheaper than Constella ($315K/yr).
              </span>{' '}
              API-first from day one — drop in our SDK and go live in under 5 minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Footer ──────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/20">
        &copy; {new Date().getFullYear()} xShield AI. All rights reserved.
      </footer>
    </div>
  );
}
