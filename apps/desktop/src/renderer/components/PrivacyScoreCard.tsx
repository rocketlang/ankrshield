/**
 * Privacy Score Card Component
 */

interface PrivacyScoreCardProps {
  score: {
    totalScore: number;
    level: string;
    networkScore: number;
    dnsScore: number;
    appScore: number;
    trend?: {
      direction: string;
      change: number;
    };
  };
}

export function PrivacyScoreCard({ score }: PrivacyScoreCardProps) {
  const getScoreColor = (scoreValue: number) => {
    if (scoreValue <= 30) return '#4CAF50'; // Green - Excellent
    if (scoreValue <= 60) return '#FFC107'; // Yellow - Good
    if (scoreValue <= 80) return '#FF9800'; // Orange - Poor
    return '#F44336'; // Red - Critical
  };

  const getTrendIcon = () => {
    if (!score.trend) return null;
    if (score.trend.direction === 'improving') return '↓'; // Lower score = better
    if (score.trend.direction === 'worsening') return '↑'; // Higher score = worse
    return '→';
  };

  return (
    <div className="privacy-score-card">
      <div className="score-main">
        <div className="score-value" style={{ color: getScoreColor(score.totalScore) }}>
          {score.totalScore}
          {score.trend && (
            <span className="score-trend">
              {getTrendIcon()} {Math.abs(score.trend.change)}
            </span>
          )}
        </div>
        <div className="score-label">Privacy Score</div>
        <div className="score-level" style={{ color: getScoreColor(score.totalScore) }}>
          {score.level}
        </div>
      </div>

      <div className="score-breakdown">
        <div className="score-component">
          <div className="component-label">Network</div>
          <div className="component-value" style={{ color: getScoreColor(score.networkScore) }}>
            {score.networkScore}
          </div>
        </div>
        <div className="score-component">
          <div className="component-label">DNS</div>
          <div className="component-value" style={{ color: getScoreColor(score.dnsScore) }}>
            {score.dnsScore}
          </div>
        </div>
        <div className="score-component">
          <div className="component-label">Apps</div>
          <div className="component-value" style={{ color: getScoreColor(score.appScore) }}>
            {score.appScore}
          </div>
        </div>
      </div>
    </div>
  );
}
