/**
 * Settings Component
 */

import { useState, useEffect } from 'react';

interface SettingsProps {
  onClose?: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const [dnsProtection, setDnsProtection] = useState(true);
  const [networkProtection, setNetworkProtection] = useState(true);
  const [autoStart, setAutoStart] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const [dnsResponse, networkResponse, versionResponse] = await Promise.all([
        window.electronAPI.dns.isProtectionEnabled(),
        window.electronAPI.network.isProtectionEnabled(),
        window.electronAPI.app.getVersion(),
      ]);

      if (dnsResponse.success && typeof dnsResponse.data === 'boolean') {
        setDnsProtection(dnsResponse.data);
      }

      if (networkResponse.success && typeof networkResponse.data === 'boolean') {
        setNetworkProtection(networkResponse.data);
      }

      if (versionResponse.success && typeof versionResponse.data === 'string') {
        setAppVersion(versionResponse.data);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  }

  async function handleDnsToggle() {
    try {
      const newState = !dnsProtection;
      const response = await window.electronAPI.dns.toggleProtection(newState);

      if (response.success) {
        setDnsProtection(newState);
      }
    } catch (error) {
      console.error('Error toggling DNS protection:', error);
    }
  }

  async function handleNetworkToggle() {
    try {
      const newState = !networkProtection;
      const response = await window.electronAPI.network.toggleProtection(newState);

      if (response.success) {
        setNetworkProtection(newState);
      }
    } catch (error) {
      console.error('Error toggling network protection:', error);
    }
  }

  if (loading) {
    return (
      <div className="settings">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>Settings</h2>
        {onClose && (
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <h3>Protection</h3>

          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">DNS Protection</div>
              <div className="setting-description">
                Block tracking domains and malicious sites at DNS level
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={dnsProtection}
                onChange={handleDnsToggle}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">Network Protection</div>
              <div className="setting-description">
                Monitor and block trackers at the network level
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={networkProtection}
                onChange={handleNetworkToggle}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h3>General</h3>

          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">Start on Login</div>
              <div className="setting-description">
                Automatically start ankrshield when you log in
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={() => setAutoStart(!autoStart)}
                disabled
              />
              <span className="toggle-slider"></span>
            </label>
            <small className="setting-note">Coming soon</small>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">Notifications</div>
              <div className="setting-description">
                Show notifications when threats are blocked
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications}
                onChange={() => setNotifications(!notifications)}
                disabled
              />
              <span className="toggle-slider"></span>
            </label>
            <small className="setting-note">Coming soon</small>
          </div>
        </section>

        <section className="settings-section">
          <h3>About</h3>

          <div className="about-info">
            <div className="about-item">
              <span className="about-label">Version:</span>
              <span className="about-value">{appVersion || '1.0.0'}</span>
            </div>
            <div className="about-item">
              <span className="about-label">License:</span>
              <span className="about-value">GPL v3 (Free Tier)</span>
            </div>
            <div className="about-item">
              <span className="about-label">Database:</span>
              <span className="about-value">230,771 trackers</span>
            </div>
          </div>

          <div className="settings-actions">
            <button className="secondary-button" disabled>
              Check for Updates
            </button>
            <button className="secondary-button" disabled>
              View Documentation
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
