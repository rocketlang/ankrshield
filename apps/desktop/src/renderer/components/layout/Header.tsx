/**
 * Header Component
 * Top header with protection status and actions
 */

import { useProtectionStatus } from '../../stores/appStore';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';

export function Header() {
  const protectionEnabled = useProtectionStatus();
  const theme = useTheme();
  const setTheme = useSettingsStore((state) => state.setTheme);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
      {/* Protection Status */}
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            protectionEnabled ? 'bg-ankr-green' : 'bg-gray-500'
          }`}
        />
        <span className="text-sm font-medium">
          {protectionEnabled ? 'Protection Active' : 'Protection Inactive'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-700 transition"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Quick Action: Pause Protection */}
        <button
          onClick={async () => {
            try {
              await window.electronAPI.toggleProtection(!protectionEnabled);
            } catch (error) {
              console.error('Failed to toggle protection:', error);
            }
          }}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            protectionEnabled
              ? 'bg-ankr-orange hover:bg-opacity-90'
              : 'bg-ankr-green hover:bg-opacity-90'
          }`}
        >
          {protectionEnabled ? 'Pause Protection' : 'Resume Protection'}
        </button>
      </div>
    </header>
  );
}
