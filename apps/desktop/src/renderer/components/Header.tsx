/**
 * Header Component
 */

import { useState, useEffect } from 'react';

export function Header() {
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [, setLoading] = useState(true);

  useEffect(() => {
    loadProtectionStatus();

    // Check protection status every 10 seconds
    const interval = setInterval(loadProtectionStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadProtectionStatus() {
    try {
      const response = await window.electronAPI.network.isProtectionEnabled();
      if (response.success && typeof response.data === 'boolean') {
        setProtectionEnabled(response.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading protection status:', error);
      setLoading(false);
    }
  }

  const handleToggleProtection = async () => {
    try {
      const newState = !protectionEnabled;
      const response = await window.electronAPI.network.toggleProtection(newState);

      if (response.success) {
        setProtectionEnabled(newState);
      }
    } catch (error) {
      console.error('Error toggling protection:', error);
    }
  };

  return (
    <header className="header">
      <div className="logo">
        <span className="logo-icon">🛡️</span>
        <span className="logo-text">ankrshield</span>
      </div>

      <div className="header-actions">
        <div className="status">
          <span className={`status-indicator ${protectionEnabled ? 'active' : 'inactive'}`}></span>
          <span className="status-text">{protectionEnabled ? 'Protected' : 'Unprotected'}</span>
        </div>

        <button
          className={`toggle-button ${protectionEnabled ? 'enabled' : 'disabled'}`}
          onClick={handleToggleProtection}
        >
          {protectionEnabled ? 'Disable Protection' : 'Enable Protection'}
        </button>
      </div>
    </header>
  );
}
