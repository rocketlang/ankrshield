/**
 * Settings Page
 * User preferences and application settings
 */

import { useSettingsStore } from '../stores/settingsStore';

export function Settings() {
  const {
    theme,
    setTheme,
    compactMode,
    setCompactMode,
    showNotifications,
    setShowNotifications,
    autoStart,
    setAutoStart,
    privacyLevel,
    setPrivacyLevel,
    resetSettings,
  } = useSettingsStore();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Appearance */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Appearance</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="bg-gray-700 text-white rounded-lg px-4 py-2 w-full"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto (System)</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Compact Mode</span>
              <button
                onClick={() => setCompactMode(!compactMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  compactMode ? 'bg-ankr-green' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    compactMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Notifications</h2>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Show Notifications</span>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                showNotifications ? 'bg-ankr-green' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  showNotifications ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Privacy */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Privacy</h2>

          <div>
            <label className="block text-sm font-medium mb-2">
              Privacy Level: {privacyLevel}/10
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={privacyLevel}
              onChange={(e) => setPrivacyLevel(Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-ankr-green"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Minimal</span>
              <span>Balanced</span>
              <span>Maximum</span>
            </div>
          </div>
        </div>

        {/* System */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">System</h2>

          <div className="flex items-center justify-between">
            <div>
              <span className="block text-sm font-medium">Launch at Startup</span>
              <span className="text-xs text-gray-400">
                Start ankrshield when your computer starts
              </span>
            </div>
            <button
              onClick={() => setAutoStart(!autoStart)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                autoStart ? 'bg-ankr-green' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  autoStart ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Reset */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Reset</h2>
          <button
            onClick={() => {
              if (confirm('Reset all settings to defaults?')) {
                resetSettings();
              }
            }}
            className="px-4 py-2 bg-ankr-red text-white rounded-lg hover:opacity-90 transition"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
