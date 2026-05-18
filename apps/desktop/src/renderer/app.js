/**
 * Renderer Application
 * Simple vanilla JS app for ankrshield desktop
 */

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('ankrshield renderer starting...');

  // Check if electronAPI is available
  if (!window.electronAPI) {
    console.error('electronAPI not available');
    showError('Failed to load application');
    return;
  }

  // Initialize app
  await initApp();
});

/**
 * Initialize application
 */
async function initApp() {
  try {
    // Load initial data
    const score = await window.electronAPI.getPrivacyScore();
    const networkStats = await window.electronAPI.getNetworkStats();
    const dnsStats = await window.electronAPI.getDNSStats();
    const trackerStats = await window.electronAPI.getTrackerStats();

    // Render UI
    renderApp(score, networkStats, dnsStats, trackerStats);

    // Setup auto-refresh
    setInterval(async () => {
      const newScore = await window.electronAPI.getPrivacyScore();
      updateScore(newScore);
    }, 30000); // Update every 30 seconds

    console.log('ankrshield renderer ready');
  } catch (error) {
    console.error('Error initializing app:', error);
    showError('Failed to load data');
  }
}

/**
 * Render main app UI
 */
function renderApp(score, networkStats, dnsStats, trackerStats) {
  const root = document.getElementById('root');

  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="logo">ankrshield</div>
        <div class="status">
          <span class="status-indicator"></span>
          <span>Protected</span>
        </div>
      </div>

      <div class="score-card" id="score-card">
        <div class="score-value">${score.totalScore}</div>
        <div class="score-label">Privacy Score</div>
        <div class="score-level">${score.level}</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${networkStats.blockedConnections}</div>
          <div class="stat-label">Trackers Blocked</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${networkStats.totalConnections}</div>
          <div class="stat-label">Total Connections</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${dnsStats.blockedQueries}</div>
          <div class="stat-label">DNS Queries Blocked</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${trackerStats.totalTrackers}</div>
          <div class="stat-label">Unique Trackers</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Update score display
 */
function updateScore(score) {
  const scoreCard = document.getElementById('score-card');
  if (scoreCard) {
    scoreCard.innerHTML = `
      <div class="score-value">${score.totalScore}</div>
      <div class="score-label">Privacy Score</div>
      <div class="score-level">${score.level}</div>
    `;
  }
}

/**
 * Show error message
 */
function showError(message) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="loading">
      Error: ${message}
    </div>
  `;
}
