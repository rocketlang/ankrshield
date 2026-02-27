/**
 * RiskGauge — Standalone semicircular SVG gauge for risk scores 0-100.
 *
 * SVG maths:
 *   viewBox = "0 0 200 110"
 *   center   = (100, 100)   radius = 80
 *   Arc runs from 180° (left) → 0° (right) — a perfect semicircle on top.
 *   Track path : M 20 100  A 80 80 0 0 1 180 100
 *   Filled arc uses strokeDasharray / strokeDashoffset on the same path.
 *   Half-circumference = π × 80 ≈ 251.33
 */

interface RiskGaugeProps {
  score: number;
  label?: string;
  size?: number;
}

function getGaugeColor(score: number): string {
  if (score <= 29) return '#34d399'; // emerald-400 — green
  if (score <= 59) return '#fbbf24'; // yellow-400
  if (score <= 79) return '#fb923c'; // orange-400
  return '#f87171';                  // red-400
}

function getTextColor(score: number): string {
  if (score <= 29) return '#6ee7b7'; // emerald-300
  if (score <= 59) return '#fde68a'; // yellow-200
  if (score <= 79) return '#fed7aa'; // orange-200
  return '#fca5a5';                  // red-300
}

export default function RiskGauge({
  score,
  label = 'Risk Posture Score',
  size = 200,
}: RiskGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Semicircle geometry
  const cx = 100;
  const cy = 100;
  const r = 80;
  const halfCircumference = Math.PI * r; // ≈ 251.33

  // How much of the arc to fill
  const filled = (clampedScore / 100) * halfCircumference;

  // Arc path: left endpoint (20, 100) → right endpoint (180, 100) going upward
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const strokeColor = getGaugeColor(clampedScore);
  const textColor = getTextColor(clampedScore);

  // Compute needle angle: 180° when score=0, 0° when score=100
  // In SVG coords: starting from left (π radians), rotating counter-clockwise by fraction
  const needleAngleDeg = 180 - (clampedScore / 100) * 180; // 0° = right, grows CCW
  const needleAngleRad = (needleAngleDeg * Math.PI) / 180;
  const needleLen = 65;
  const nx = cx + needleLen * Math.cos(Math.PI - needleAngleRad);
  const ny = cy - needleLen * Math.sin(Math.PI - needleAngleRad);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 200 110"
        width={size}
        height={size * 0.55}
        aria-label={`Risk score: ${clampedScore} out of 100`}
        role="img"
        className="overflow-visible"
      >
        {/* ---- gradient def ---- */}
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="40%" stopColor="#fbbf24" />
            <stop offset="70%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#f87171" />
          </linearGradient>
        </defs>

        {/* ---- background track ---- */}
        <path
          d={arcPath}
          fill="none"
          stroke="#1f2937"   /* gray-800 */
          strokeWidth={12}
          strokeLinecap="round"
        />

        {/* ---- filled progress arc ---- */}
        <path
          d={arcPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${halfCircumference}`}
          strokeDashoffset={0}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />

        {/* ---- needle ---- */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="#e5e7eb"   /* gray-200 */
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* needle pivot */}
        <circle cx={cx} cy={cy} r={5} fill="#6b7280" />

        {/* ---- score text ---- */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="auto"
          fontSize={28}
          fontWeight={900}
          fill={textColor}
          fontFamily="inherit"
        >
          {clampedScore}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          dominantBaseline="auto"
          fontSize={11}
          fill="#6b7280"   /* gray-500 */
          fontFamily="inherit"
        >
          / 100
        </text>
      </svg>

      {/* ---- label ---- */}
      <p className="text-xs text-gray-500 tracking-wide">{label}</p>
    </div>
  );
}
