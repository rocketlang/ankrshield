/**
 * Sidebar Component
 * Navigation sidebar with route links
 */

import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/devices', label: 'Devices', icon: '💻' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  return (
    <aside className="w-60 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🛡️</div>
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-ankr-green">Ankr</span>Shield
            </h1>
            <p className="text-xs text-gray-400">Privacy Protection</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-ankr-green text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`
                }
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <div className="text-xs text-gray-400 text-center">
          v0.1.0
        </div>
      </div>
    </aside>
  );
}
