/**
 * Sidebar Component
 * Side navigation with menu items
 */

import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Smartphone,
  BarChart3,
  Shield,
  Settings,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    label: 'Devices',
    path: '/devices',
    icon: <Smartphone className="w-5 h-5" />,
  },
  {
    label: 'Analytics',
    path: '/analytics',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    label: 'Policies',
    path: '/policies',
    icon: <Shield className="w-5 h-5" />,
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: <Settings className="w-5 h-5" />,
  },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 min-h-screen">
      <nav className="p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
