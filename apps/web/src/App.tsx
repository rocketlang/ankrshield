/**
 * Main App Component with React Router
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';

import ProtectedRoute from './components/ProtectedRoute';
import { useTokenRefresh } from './hooks/useTokenRefresh';
// Pages
import Analytics from './pages/Analytics';
import ApiKeys from './pages/ApiKeys';
import CommandCenter from './pages/CommandCenter';
import Dashboard from './pages/Dashboard';
import Developers from './pages/Developers';
import Devices from './pages/Devices';
import EvidenceReport from './pages/EvidenceReport';
import Landing from './pages/Landing';
import LiveThreats from './pages/LiveThreats';
import Login from './pages/Login';
import MdmAdmin from './pages/MdmAdmin';
import Onboarding from './pages/Onboarding';
import Policies from './pages/Policies';
import Pricing from './pages/Pricing';
import Register from './pages/Register';
import Settings from './pages/Settings';
import SupplyChain from './pages/SupplyChain';
import VerifyMagicLink from './pages/VerifyMagicLink';
import WatchDetail from './pages/WatchDetail';

function AppRoutes() {
  useTokenRefresh();
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/live" element={<LiveThreats />} />
      <Route path="/evidence" element={<EvidenceReport />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/verify" element={<VerifyMagicLink />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/developers" element={<Developers />} />
      <Route path="/onboarding" element={<Onboarding />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/devices"
        element={
          <ProtectedRoute>
            <Devices />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/policies"
        element={
          <ProtectedRoute>
            <Policies />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/command-center"
        element={
          <ProtectedRoute>
            <CommandCenter />
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-keys"
        element={
          <ProtectedRoute>
            <ApiKeys />
          </ProtectedRoute>
        }
      />
      <Route
        path="/supply-chain"
        element={
          <ProtectedRoute>
            <SupplyChain />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mdm"
        element={
          <ProtectedRoute>
            <MdmAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/watch/:watchId"
        element={
          <ProtectedRoute>
            <WatchDetail />
          </ProtectedRoute>
        }
      />

      {/* 404 Not Found */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-400">Page not found</p>
        <a href="/" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
          Go back home
        </a>
      </div>
    </div>
  );
}

export default App;
