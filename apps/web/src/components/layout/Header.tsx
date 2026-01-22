/**
 * Header Component
 * Top navigation bar with logo, user menu, and logout
 */

import { Shield, User, LogOut, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore, useUser } from '../../stores/authStore';

export default function Header() {
  const user = useUser();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center space-x-2">
          <Shield className="w-8 h-8 text-blue-400" />
          <span className="text-xl font-bold text-white">ankrshield</span>
        </Link>

        {/* User Menu */}
        <div className="flex items-center space-x-4">
          {user && (
            <>
              <div className="flex items-center space-x-2 text-gray-300">
                <User className="w-5 h-5" />
                <span>{user.name || user.email}</span>
                <span className="text-xs bg-blue-600 px-2 py-1 rounded">
                  {user.tier}
                </span>
              </div>

              <Link
                to="/settings"
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </Link>

              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
