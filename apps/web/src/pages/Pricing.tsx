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

// ─── India tiers ─────────────────────────────────────────────────────────────
const indiaTiers = [
  {
    name: 'Starter',
    price: '₹7,999',
    period: '/mo',
    usd: '~$95',
    description: 'For Indian SMEs and startup security teams.',
    features: [
      '500 risk scans / month',
      'UPI / NEFT / Razorpay',
      'GST-compliant invoice (18% extra)',
      'India threat intel (UPI, TAFCOP)',
      'DPDP Act 2023 flag',
      'Email + WhatsApp alerts',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '₹35,000',
    period: '/mo',
    usd: '~$416',
    description: 'Full threat intelligence for Indian enterprise security teams.',
    features: [
      'Unlimited scans',
      'STIX 2.1 + TAXII 2.1 export',
      'xshield-active defense',
      'AI threat narrative (Claude)',
      'CERT-In incident format export',
      'DPDP Act compliance reports',
      'GST invoice + TDS support',
      '50 watched domains',
    ],
    cta: 'Go Pro',
    ctaHref: '/register',
    highlight: true,
    badgeLabel: 'Most Popular',
    badgeColor: 'cyan',
  },
  {
    name: 'Government',
    price: '₹50,000',
    period: '/mo',
    usd: '~$595',
    description: 'For port authorities, PSUs, and Ministry departments.',
    features: [
      'Everything in Pro',
      'GeM portal compatible',
      'Government eProcurement docs',
      'CERT-In structured reporting',
      'Ministry / NIC domain coverage',
      'Dedicated onboarding engineer',
      'SLA: 4-hour response',
      'On-premise deployment option',
    ],
    cta: 'Contact Us',
    ctaHref: 'mailto:gov@xshieldai.com',
    highlight: false,
    badgeLabel: '🇮🇳 GOV',
    badgeColor: 'amber',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    usd: '',
    description: 'For MSSPs, large corporates, and white-label deployments.',
    features: [
      'White-label deployment',
      'Multi-tenant TAXII server',
      'On-premise or private cloud',
      'SSO / SAML',
      'Custom SLA',
      'Unlimited domains + users',
    ],
    cta: 'Talk to Sales',
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

        {/* Competitive comparison callout */}
        <div className="mt-10 inline-block rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-5 text-left max-w-2xl w-full">
          <p className="text-sm text-white/50 leading-relaxed">
            <span className="text-red-400 font-semibold">Recorded Future: $50,000/yr.</span>
            {'  '}
            <span className="text-amber-400 font-semibold">DomainTools: $22,000/yr.</span>
            {'  '}
            <span className="text-orange-400 font-semibold">CrowdStrike Intel: $30,000/yr.</span>
            <br />
            <span className="text-cyan-300 font-bold text-base">xShieldAI Pro: $499/mo.</span>{' '}
            <span className="text-white/70">Same intelligence layer. Active defense included.</span>
          </p>
        </div>
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
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-black">{tier.price}</span>
                {tier.period && <span className="text-white/40 mb-1.5 text-lg">{tier.period}</span>}
              </div>
              <p className="text-xs text-white/25 mb-3">+ applicable taxes</p>

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
              <br />
              <span className="text-white/80">
                No SOAR required. No integration team. Ship in 5 minutes.
              </span>
            </p>
          </div>
        </div>

        {/* FAQ link back ───────────────────────────────────────────────────── */}
        <div className="mt-8 text-center">
          <Link to="/#faq" className="text-sm text-cyan-400 hover:text-cyan-300 transition">
            Common questions →
          </Link>
        </div>
      </section>

      {/* India Pricing ───────────────────────────────────────────────────────── */}
      <section id="india" className="max-w-7xl mx-auto px-6 pb-24">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-300 text-xs font-bold uppercase tracking-widest mb-6">
            🇮🇳 India Pricing — INR
          </div>
          <h2 className="text-4xl font-black tracking-tight">Built for India. Priced for India.</h2>
          <p className="mt-4 text-white/50 max-w-xl mx-auto text-base">
            INR pricing with GST-compliant invoices, UPI / NEFT / Razorpay payments, CERT-In
            integration, and DPDP Act 2023 reporting built in.
          </p>
          {/* Exchange rate note */}
          <p className="mt-3 text-xs text-white/30">
            Exchange rate: ₹84 = $1 · USD prices shown for reference · INR price is final
          </p>
        </div>

        {/* India tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {indiaTiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-2xl border p-8 transition ${
                tier.highlight
                  ? 'border-orange-500/50 bg-orange-500/[0.05] shadow-[0_0_40px_-8px_rgba(249,115,22,0.2)]'
                  : tier.name === 'Government'
                    ? 'border-amber-500/30 bg-amber-500/[0.03] hover:border-amber-500/50'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20'
              }`}
            >
              {tier.badgeLabel && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <Badge color={tier.badgeColor ?? 'amber'}>{tier.badgeLabel}</Badge>
                </div>
              )}

              <p className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">
                {tier.name}
              </p>

              <div className="mb-1">
                <span className="text-4xl font-black">{tier.price}</span>
                {tier.period && <span className="text-white/40 text-lg">{tier.period}</span>}
              </div>
              {tier.usd && <p className="text-xs text-white/30">{tier.usd} / month</p>}
              <p className="text-xs text-white/25 mb-3">+ GST (18%) extra</p>

              <p className="text-sm text-white/50 mb-8 leading-relaxed">{tier.description}</p>

              <ul className="space-y-3 flex-1 mb-8">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-white/70">
                    <Check className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>

              <a
                href={tier.ctaHref}
                className={`block text-center py-3 px-6 rounded-xl font-bold text-sm transition ${
                  tier.highlight
                    ? 'bg-orange-500 hover:bg-orange-400 text-black'
                    : tier.name === 'Government'
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                      : 'bg-white/[0.07] hover:bg-white/[0.12] text-white border border-white/10'
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Payment methods */}
        <div className="mt-12 rounded-2xl border border-white/8 bg-white/[0.02] p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                Payment Methods
              </p>
              <div className="space-y-2 text-sm text-white/60">
                <p>✓ UPI (GPay, PhonePe, Paytm)</p>
                <p>✓ NEFT / RTGS / IMPS</p>
                <p>✓ Razorpay (cards, netbanking)</p>
                <p>✓ Government eProcurement (PFMS)</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                Compliance
              </p>
              <div className="space-y-2 text-sm text-white/60">
                <p>✓ GST (18%) extra · IGST / CGST+SGST</p>
                <p>✓ TDS deduction supported (194J)</p>
                <p>✓ GeM portal compatible (Govt tier)</p>
                <p>✓ Startup India discount available</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                India-Specific Features
              </p>
              <div className="space-y-2 text-sm text-white/60">
                <p>✓ UPI / NPCI / BHIM fraud detection</p>
                <p>✓ TAFCOP / Sanchar phone fraud</p>
                <p>✓ CERT-In incident format export</p>
                <p>✓ DPDP Act 2023 reportable flags</p>
              </div>
            </div>
          </div>
        </div>

        {/* Government callout */}
        <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="text-sm font-bold text-amber-300 mb-1">
              🏛️ Port Trusts · PSUs · Ministry Departments
            </p>
            <p className="text-white/60 text-sm max-w-xl">
              Kandla Port scored 100/100 CRITICAL in our April 2026 scan. Every Indian port
              authority domain had no SPF or DMARC. Government tier includes CERT-In integration,
              GeM procurement docs, and a dedicated onboarding engineer.
            </p>
          </div>
          <a
            href="mailto:gov@xshieldai.com"
            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl text-sm transition whitespace-nowrap"
          >
            Talk to Government Team →
          </a>
        </div>
      </section>

      {/* Enterprise / On-premise ─────────────────────────────────────────────── */}
      <section id="enterprise" className="max-w-5xl mx-auto px-6 pb-24">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-bold uppercase tracking-widest mb-6">
            Enterprise / On-Premise
          </div>
          <h2 className="text-4xl font-black tracking-tight">
            Your infrastructure. Your data. Your control.
          </h2>
          <p className="mt-4 text-white/50 max-w-xl mx-auto text-base">
            For large enterprises, conglomerates, and MSSPs that cannot send threat intelligence to
            an external SaaS. Deploy xShieldAI inside your own cloud or data centre.
          </p>
        </div>

        {/* Pricing timeline */}
        <div className="space-y-4 mb-10">
          {/* Year 1 — big number, clear */}
          <div className="rounded-2xl border border-purple-500/40 bg-purple-500/[0.06] p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-2">
                  Year 1 — Setup + Deployment + First Year Support
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-white">₹10,00,000</span>
                  <span className="text-white/40 text-lg">one-time</span>
                </div>
                <p className="text-xs text-white/25 mt-1">+ GST (18%) extra · ~$11,900 USD</p>
              </div>
              <a
                href="mailto:enterprise@xshieldai.com"
                className="shrink-0 bg-purple-500 hover:bg-purple-400 text-white font-bold px-6 py-3 rounded-xl text-sm transition"
              >
                Request Proposal →
              </a>
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
              {[
                'Full stack deployed in your cloud / data centre',
                'Docker / Kubernetes — your infrastructure, your data',
                'All domains configured at setup (unlimited)',
                'OTX + Shodan + HIBP intelligence keys wired',
                'STIX 2.1 / TAXII 2.1 export included',
                'CERT-In incident export format',
                'Onboarding engineer — on-site or remote',
                '12-month support SLA (4-hour response)',
              ].map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                  <Check className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Arrow connector */}
          <div className="text-center text-white/20 text-sm py-1">↓ then every year after</div>

          {/* Year 2+ */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                  Year 2 onwards — Annual Support + Intelligence
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-white">₹5,00,000</span>
                  <span className="text-white/40 text-lg">/year</span>
                </div>
                <p className="text-xs text-white/25 mt-1">+ GST (18%) extra · ~$5,950 USD</p>
              </div>
              <a
                href="mailto:enterprise@xshieldai.com"
                className="shrink-0 bg-white/[0.07] hover:bg-white/[0.12] text-white font-bold px-6 py-3 rounded-xl text-sm transition border border-white/10"
              >
                Talk to Us
              </a>
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
              {[
                'Platform updates + new threat modules',
                '4-hour support SLA, business hours',
                'Quarterly private threat brief (board-ready)',
                'New domain onboarding as you acquire',
                'STIX bundle quarterly refresh',
                'DPDP Act compliance updates',
                'Annual security review call',
                '₹0 per additional domain — unlimited',
              ].map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                  <Check className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* vs SaaS comparison */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4 text-center">
            On-Premise vs SaaS — 3-Year Cost
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">On-Premise</p>
              <p className="text-xl font-black text-purple-300">₹10L + ₹5L + ₹5L</p>
              <p className="text-xs text-white/30 mt-1">= ₹20L over 3 years</p>
              <p className="text-xs text-white/20">data stays in your network</p>
            </div>
            <div className="flex items-center justify-center text-white/20 text-2xl font-light">
              vs
            </div>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
                SaaS (Govt tier)
              </p>
              <p className="text-xl font-black text-amber-300">₹50K × 36 months</p>
              <p className="text-xs text-white/30 mt-1">= ₹18L over 3 years</p>
              <p className="text-xs text-white/20">hosted by xShieldAI</p>
            </div>
          </div>
          <p className="text-center text-xs text-white/25 mt-6">
            All prices + GST (18%) · INR invoicing · TDS 194J supported · GeM portal compatible
          </p>
        </div>

        {/* Conglomerate callout */}
        <div className="mt-8 rounded-2xl border border-purple-500/20 bg-purple-500/[0.03] p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="text-sm font-bold text-purple-300 mb-1">
              Large conglomerates · Banks · Defence · Critical infrastructure
            </p>
            <p className="text-white/60 text-sm max-w-xl">
              If your group operates 10+ domains and cannot route threat intelligence through an
              external SaaS — this is the deployment for you. Your CISO gets full control. We
              provide the intelligence layer and the expertise.
            </p>
          </div>
          <a
            href="mailto:enterprise@xshieldai.com"
            className="shrink-0 bg-purple-500 hover:bg-purple-400 text-white font-bold px-6 py-3 rounded-xl text-sm transition whitespace-nowrap"
          >
            Request a Demo →
          </a>
        </div>
      </section>

      {/* Footer ──────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/20">
        &copy; {new Date().getFullYear()} xShield AI. All rights reserved.
      </footer>
    </div>
  );
}
