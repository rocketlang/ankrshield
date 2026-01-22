/**
 * Landing Page - Public homepage
 */

import { Link } from 'react-router-dom';
import { Shield, Lock, Eye, Zap } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-8 h-8 text-blue-400" />
            <span className="text-2xl font-bold">ankrshield</span>
          </div>
          <div className="space-x-4">
            <Link
              to="/login"
              className="px-4 py-2 text-gray-300 hover:text-white transition"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Your Personal Shield for the AI Era
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8">
            Complete privacy protection against AI agents, trackers, and surveillance.
            Take control of your digital footprint.
          </p>
          <Link
            to="/register"
            className="inline-block px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition transform hover:scale-105"
          >
            Start Protecting Your Privacy
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-20 max-w-6xl mx-auto">
          <FeatureCard
            icon={<Lock className="w-12 h-12 text-blue-400" />}
            title="AI Agent Control"
            description="Monitor and control what AI tools can access on your device"
          />
          <FeatureCard
            icon={<Eye className="w-12 h-12 text-purple-400" />}
            title="Tracker Blocking"
            description="Block over 1M+ known trackers and advertising domains"
          />
          <FeatureCard
            icon={<Zap className="w-12 h-12 text-green-400" />}
            title="Real-time Monitoring"
            description="See every network request in real-time with detailed analytics"
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-20 text-center text-gray-400">
        <p>&copy; 2026 ankrshield. Your Privacy, Your Control.</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700 hover:border-blue-500 transition">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}
