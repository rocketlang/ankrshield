/**
 * AnkrShield — Conference Tracker Demo
 *
 * "The Whole Room Is Being Tracked"
 *
 * Demo Mode  (?room= absent): client-side simulation, runs anywhere.
 * Live Mode  (?room=XXXX):    connects to real SSE session stream.
 *                             Multiple phones → aggregate on one screen.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4250';

// ─── Data ──────────────────────────────────────────────────────────────────────

const TRACKERS = [
  { domain: 'google-analytics.com', company: 'Google', cat: 'Analytics', risk: 'high' as const },
  { domain: 'doubleclick.net', company: 'Google', cat: 'Advertising', risk: 'critical' as const },
  { domain: 'connect.facebook.net', company: 'Meta', cat: 'Social', risk: 'high' as const },
  { domain: 'graph.facebook.com', company: 'Meta', cat: 'Social', risk: 'high' as const },
  { domain: 'amazon-adsystem.com', company: 'Amazon', cat: 'Advertising', risk: 'high' as const },
  {
    domain: 'ads.samsungads.com',
    company: 'Samsung',
    cat: 'Advertising',
    risk: 'critical' as const,
  },
  { domain: 'pixel.twitter.com', company: 'X Corp', cat: 'Social', risk: 'medium' as const },
  {
    domain: 'analytics.tiktok.com',
    company: 'TikTok',
    cat: 'Analytics',
    risk: 'critical' as const,
  },
  { domain: 'bat.bing.com', company: 'Microsoft', cat: 'Analytics', risk: 'medium' as const },
  {
    domain: 'scorecardresearch.com',
    company: 'Comscore',
    cat: 'Fingerprinting',
    risk: 'high' as const,
  },
  { domain: 'cdn.amplitude.com', company: 'Amplitude', cat: 'Analytics', risk: 'medium' as const },
  { domain: 'segment.io', company: 'Twilio', cat: 'Data Broker', risk: 'high' as const },
  { domain: 'mixpanel.com', company: 'Mixpanel', cat: 'Analytics', risk: 'medium' as const },
  { domain: 'hotjar.com', company: 'Hotjar', cat: 'Session Recording', risk: 'critical' as const },
  { domain: 'adnxs.com', company: 'AppNexus', cat: 'Advertising', risk: 'critical' as const },
  { domain: 'moatads.com', company: 'Oracle', cat: 'Advertising', risk: 'high' as const },
  { domain: 'criteo.com', company: 'Criteo', cat: 'Retargeting', risk: 'high' as const },
  { domain: 'ring.com', company: 'Amazon/Ring', cat: 'Surveillance', risk: 'critical' as const },
  {
    domain: 'device-metrics-us.amazon.com',
    company: 'Amazon',
    cat: 'Device Telemetry',
    risk: 'high' as const,
  },
  { domain: 'data.microsoft.com', company: 'Microsoft', cat: 'Telemetry', risk: 'medium' as const },
];

const DATA_TYPES = [
  'Location (GPS)',
  'Device ID (IDFA)',
  'Browsing history',
  'App usage patterns',
  'Purchase history',
  'Viewing habits',
  'Voice commands',
  'Contact list',
  'Search queries',
  'Biometrics',
];

interface Device {
  id: string;
  name: string;
  icon: string;
  type: string;
  baseTrackers: number;
  baseRisk: 'low' | 'medium' | 'high' | 'critical';
  apps: string[];
}

interface Scenario {
  id: string;
  name: string;
  icon: string;
  desc: string;
  devices: Device[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'living-room',
    name: 'Living Room',
    icon: '🏠',
    desc: 'Family evening',
    devices: [
      {
        id: 'd1',
        name: "Dad's iPhone",
        icon: '📱',
        type: 'phone',
        baseTrackers: 47,
        baseRisk: 'high',
        apps: ['Facebook', 'Instagram', 'Weather', 'News'],
      },
      {
        id: 'd2',
        name: "Mom's MacBook",
        icon: '💻',
        type: 'laptop',
        baseTrackers: 89,
        baseRisk: 'critical',
        apps: ['Chrome', 'Spotify', 'Gmail', 'Shopping'],
      },
      {
        id: 'd3',
        name: 'Samsung TV',
        icon: '📺',
        type: 'tv',
        baseTrackers: 67,
        baseRisk: 'critical',
        apps: ['YouTube', 'Netflix', 'Smart TV OS'],
      },
      {
        id: 'd4',
        name: 'Xbox Series X',
        icon: '🎮',
        type: 'gaming',
        baseTrackers: 34,
        baseRisk: 'medium',
        apps: ['Xbox Live', 'Game Telemetry'],
      },
      {
        id: 'd5',
        name: 'Amazon Alexa',
        icon: '🔊',
        type: 'iot',
        baseTrackers: 23,
        baseRisk: 'high',
        apps: ['Voice Assistant', 'Skills'],
      },
      {
        id: 'd6',
        name: "Kid's Apple Watch",
        icon: '⌚',
        type: 'wearable',
        baseTrackers: 19,
        baseRisk: 'medium',
        apps: ['Health', 'Apps'],
      },
      {
        id: 'd7',
        name: 'Robot Vacuum',
        icon: '🤖',
        type: 'iot',
        baseTrackers: 12,
        baseRisk: 'low',
        apps: ['Mapping', 'App Control'],
      },
      {
        id: 'd8',
        name: 'Ring Doorbell',
        icon: '📹',
        type: 'iot',
        baseTrackers: 28,
        baseRisk: 'high',
        apps: ['Cloud Storage', 'Analytics'],
      },
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming Session',
    icon: '🎮',
    desc: 'Late night gaming',
    devices: [
      {
        id: 'd1',
        name: 'Gaming PC',
        icon: '🖥️',
        type: 'laptop',
        baseTrackers: 156,
        baseRisk: 'critical',
        apps: ['Steam', 'Discord', 'Twitch', 'Chrome'],
      },
      {
        id: 'd2',
        name: 'PlayStation 5',
        icon: '🎮',
        type: 'gaming',
        baseTrackers: 189,
        baseRisk: 'critical',
        apps: ['PSN', 'Game Telemetry', 'Streaming'],
      },
      {
        id: 'd3',
        name: 'Gaming Phone',
        icon: '📱',
        type: 'phone',
        baseTrackers: 67,
        baseRisk: 'high',
        apps: ['Mobile Games', 'Chat Apps'],
      },
      {
        id: 'd4',
        name: 'Streaming Webcam',
        icon: '📹',
        type: 'iot',
        baseTrackers: 11,
        baseRisk: 'medium',
        apps: ['OBS', 'Twitch Client'],
      },
    ],
  },
  {
    id: 'smart-home',
    name: 'Smart Home',
    icon: '🏡',
    desc: '15 IoT devices 😱',
    devices: [
      {
        id: 'd1',
        name: 'Smart Fridge',
        icon: '🧊',
        type: 'iot',
        baseTrackers: 34,
        baseRisk: 'medium',
        apps: ['Samsung SmartThings', 'Food App'],
      },
      {
        id: 'd2',
        name: 'Smart Thermostat',
        icon: '🌡️',
        type: 'iot',
        baseTrackers: 28,
        baseRisk: 'high',
        apps: ['Nest', 'Google Home'],
      },
      {
        id: 'd3',
        name: 'Smart Lights (12)',
        icon: '💡',
        type: 'iot',
        baseTrackers: 67,
        baseRisk: 'medium',
        apps: ['Philips Hue', 'Alexa'],
      },
      {
        id: 'd4',
        name: 'Smart Lock',
        icon: '🔐',
        type: 'iot',
        baseTrackers: 23,
        baseRisk: 'critical',
        apps: ['August', 'Ring'],
      },
      {
        id: 'd5',
        name: 'Security Cameras (4)',
        icon: '📹',
        type: 'iot',
        baseTrackers: 89,
        baseRisk: 'critical',
        apps: ['Ring', 'Arlo', 'Cloud'],
      },
      {
        id: 'd6',
        name: 'Smart Speakers (3)',
        icon: '🔊',
        type: 'iot',
        baseTrackers: 56,
        baseRisk: 'high',
        apps: ['Alexa', 'Google Home'],
      },
      {
        id: 'd7',
        name: 'Phone',
        icon: '📱',
        type: 'phone',
        baseTrackers: 78,
        baseRisk: 'critical',
        apps: ['Facebook', 'Maps', 'Shopping'],
      },
      {
        id: 'd8',
        name: 'Laptop',
        icon: '💻',
        type: 'laptop',
        baseTrackers: 95,
        baseRisk: 'critical',
        apps: ['Chrome', 'Gmail', 'Slack'],
      },
    ],
  },
  {
    id: 'office',
    name: 'Home Office',
    icon: '🏢',
    desc: 'Working from home',
    devices: [
      {
        id: 'd1',
        name: 'Work MacBook',
        icon: '💻',
        type: 'laptop',
        baseTrackers: 112,
        baseRisk: 'critical',
        apps: ['Zoom', 'Slack', 'Chrome', 'Outlook'],
      },
      {
        id: 'd2',
        name: 'Personal Phone',
        icon: '📱',
        type: 'phone',
        baseTrackers: 58,
        baseRisk: 'high',
        apps: ['WhatsApp', 'LinkedIn', 'Banking'],
      },
      {
        id: 'd3',
        name: 'iPad',
        icon: '📟',
        type: 'tablet',
        baseTrackers: 43,
        baseRisk: 'high',
        apps: ['News', 'YouTube', 'Shopping'],
      },
      {
        id: 'd4',
        name: 'Smart Speaker',
        icon: '🔊',
        type: 'iot',
        baseTrackers: 23,
        baseRisk: 'medium',
        apps: ['Alexa', 'Calendar'],
      },
      {
        id: 'd5',
        name: 'Smart TV',
        icon: '📺',
        type: 'tv',
        baseTrackers: 67,
        baseRisk: 'critical',
        apps: ['YouTube', 'Prime Video'],
      },
    ],
  },
  {
    id: 'hotel',
    name: 'Hotel Room',
    icon: '🏨',
    desc: 'Business trip',
    devices: [
      {
        id: 'd1',
        name: 'Your Phone',
        icon: '📱',
        type: 'phone',
        baseTrackers: 63,
        baseRisk: 'high',
        apps: ['Maps', 'Booking', 'LinkedIn', 'Uber'],
      },
      {
        id: 'd2',
        name: 'Hotel TV',
        icon: '📺',
        type: 'tv',
        baseTrackers: 45,
        baseRisk: 'critical',
        apps: ['Cast', 'Hotel System', 'Chromecast'],
      },
      {
        id: 'd3',
        name: 'Hotel Room System',
        icon: '🏨',
        type: 'iot',
        baseTrackers: 18,
        baseRisk: 'medium',
        apps: ['Building Management', 'Occupancy'],
      },
    ],
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────────

interface TrackerEvent {
  id: string;
  ts: number;
  deviceId: string;
  deviceName: string;
  deviceIcon: string;
  tracker: (typeof TRACKERS)[0];
  dataType: string;
  blocked: boolean;
}

interface DeviceState {
  device: Device;
  trackerCount: number;
  lastHit: number;
  pulsing: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function riskColor(risk: string) {
  if (risk === 'critical')
    return {
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/50',
      dot: 'bg-red-500',
    };
  if (risk === 'high')
    return {
      text: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/50',
      dot: 'bg-orange-500',
    };
  if (risk === 'medium')
    return {
      text: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/40',
      dot: 'bg-yellow-400',
    };
  return {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    dot: 'bg-emerald-500',
  };
}

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

function fmtNum(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

// ─── Counter (animated number) ─────────────────────────────────────────────────

function Counter({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    const diff = value - prev.current;
    const steps = Math.min(Math.abs(diff), 8);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setDisplay(Math.round(prev.current + (diff * i) / steps));
      if (i >= steps) {
        clearInterval(t);
        prev.current = value;
      }
    }, 40);
    return () => clearInterval(t);
  }, [value]);
  return <span className={className}>{fmtNum(display)}</span>;
}

// ─── Device Card ────────────────────────────────────────────────────────────────

function DeviceCard({ ds, showBlocked }: { ds: DeviceState; showBlocked: boolean }) {
  const { device, trackerCount, pulsing } = ds;
  const rc = riskColor(device.baseRisk);
  const displayCount = showBlocked ? Math.round(trackerCount * 0.11) : trackerCount;

  return (
    <div
      className={`relative rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all duration-300 ${rc.border} ${rc.bg} ${
        pulsing ? 'scale-105 shadow-lg shadow-red-900/30' : ''
      }`}
    >
      {/* Pulse ring on new event */}
      {pulsing && (
        <div className="absolute inset-0 rounded-2xl border-2 border-red-500 animate-ping opacity-30" />
      )}

      <span className="text-4xl">{device.icon}</span>
      <span className="text-xs text-gray-300 font-medium text-center leading-tight">
        {device.name}
      </span>

      {/* Tracker count */}
      <div
        className={`text-2xl font-black font-mono ${showBlocked ? 'text-emerald-400' : rc.text}`}
      >
        {displayCount}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest -mt-1">
        {showBlocked ? 'active' : 'trackers'}
      </div>

      {/* Risk dot */}
      <div className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${showBlocked ? 'bg-emerald-500' : rc.dot}`} />
        <span
          className={`text-[10px] font-bold uppercase ${showBlocked ? 'text-emerald-400' : rc.text}`}
        >
          {showBlocked ? 'protected' : device.baseRisk}
        </span>
      </div>
    </div>
  );
}

// ─── Activity Row ────────────────────────────────────────────────────────────────

function ActivityRow({ ev }: { ev: TrackerEvent }) {
  const rc = riskColor(ev.tracker.risk);
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border ${
        ev.blocked ? 'border-emerald-900/30 bg-emerald-950/20' : `${rc.border} ${rc.bg}`
      } animate-[slideIn_0.25s_ease-out]`}
    >
      <span className="flex-shrink-0 text-base">{ev.deviceIcon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-gray-300 font-mono truncate block">{ev.tracker.domain}</span>
        <span className="text-gray-600">
          {ev.tracker.cat} · {ev.dataType}
        </span>
      </div>
      <div className="flex-shrink-0 text-right">
        {ev.blocked ? (
          <span className="text-emerald-400 font-bold">🛡 BLOCKED</span>
        ) : (
          <span className={`font-bold ${rc.text}`}>⚠ SENT</span>
        )}
      </div>
    </div>
  );
}

// ─── Live Room Session Types ────────────────────────────────────────────────────

interface SessionStats {
  code: string;
  label: string;
  totalDevices: number;
  totalEvents: number;
  totalBlocked: number;
  blockedPct: number;
  uniqueCompanies: number;
  totalBytes: number;
  topTrackers: { tracker: string; count: number }[];
}

interface SessionEvent {
  id: string;
  ts: number;
  deviceId: string;
  deviceName: string;
  tracker: string;
  company: string;
  category: string;
  dataType: string;
  blocked: boolean;
  bytes: number;
}

// ─── Live Room Hook ─────────────────────────────────────────────────────────────

function useLiveRoom(code: string | null) {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [liveEvents, setLiveEvents] = useState<SessionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!code) return;

    // Initial stats fetch
    fetch(`${API_BASE}/session/${code}/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d as SessionStats))
      .catch(() => setError('Room not found'));

    // SSE stream
    const es = new EventSource(`${API_BASE}/session/${code}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      setError('Stream disconnected — retrying…');
    };

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as {
          type: string;
          event?: SessionEvent;
          events?: SessionEvent[];
          stats?: Partial<SessionStats>;
          totalDevices?: number;
        };
        if (msg.type === 'catchup') {
          if (msg.events) setLiveEvents(msg.events.slice(-40));
          if (msg.stats)
            setStats((prev) => (prev ? { ...prev, ...msg.stats } : (msg.stats as SessionStats)));
        } else if (msg.type === 'tracker_event' && msg.event) {
          setLiveEvents((prev) => [msg.event!, ...prev].slice(0, 40));
          setStats((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              totalEvents: prev.totalEvents + 1,
              totalBlocked: msg.event!.blocked ? prev.totalBlocked + 1 : prev.totalBlocked,
              blockedPct: Math.round(
                ((msg.event!.blocked ? prev.totalBlocked + 1 : prev.totalBlocked) /
                  (prev.totalEvents + 1)) *
                  100
              ),
              totalBytes: prev.totalBytes + (msg.event!.bytes ?? 5000),
            };
          });
        } else if (msg.type === 'device_joined') {
          setStats((prev) =>
            prev ? { ...prev, totalDevices: msg.totalDevices ?? prev.totalDevices } : prev
          );
        }
      } catch {
        /* ignore parse errors */
      }
    };

    // Poll stats every 10s as fallback
    const poll = setInterval(() => {
      fetch(`${API_BASE}/session/${code}/stats`)
        .then((r) => r.json())
        .then((d) => setStats(d as SessionStats))
        .catch(() => {});
    }, 10000);

    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [code]);

  return { stats, liveEvents, connected, error };
}

// ─── Create Room Modal ──────────────────────────────────────────────────────────

function CreateRoomModal({
  onCreated,
  onClose,
}: {
  onCreated: (code: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function create() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || undefined }),
      });
      if (!res.ok) throw new Error('Failed');
      const d = (await res.json()) as { code: string };
      onCreated(d.code);
    } catch {
      setErr('Could not create room — is the API running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-xl font-bold">🎤 Create Conference Room</h2>
        <p className="text-sm text-gray-400">
          Share the room code with attendees. Their phones appear live on this screen.
        </p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Room label (e.g. DevConf 2026)"
          className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 rounded-lg hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={loading}
            className="flex-1 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-500 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Live Activity Row (for real SSE events) ───────────────────────────────────

function LiveActivityRow({ ev }: { ev: SessionEvent }) {
  const rc = riskColor(ev.blocked ? 'low' : 'high');
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border ${
        ev.blocked ? 'border-emerald-900/30 bg-emerald-950/20' : `${rc.border} ${rc.bg}`
      } animate-[slideIn_0.25s_ease-out]`}
    >
      <span className="flex-shrink-0 text-base">📱</span>
      <div className="flex-1 min-w-0">
        <span className="text-gray-300 font-mono truncate block">{ev.tracker}</span>
        <span className="text-gray-600">
          {ev.category} · {ev.dataType}
        </span>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-gray-500 text-[10px] mb-0.5">{ev.deviceName}</div>
        {ev.blocked ? (
          <span className="text-emerald-400 font-bold">🛡 BLOCKED</span>
        ) : (
          <span className="text-orange-400 font-bold">⚠ SENT</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function LiveThreats() {
  // Check for ?room=CODE in URL
  const urlRoom = new URLSearchParams(window.location.search).get('room');
  const isLiveMode = !!urlRoom;

  const [scenarioId, setScenarioId] = useState('living-room');
  const [showBlocked, setShowBlocked] = useState(false);
  const [paused, setPaused] = useState(isLiveMode); // pause sim if live mode
  const [speed, setSpeed] = useState(1);
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [deviceStates, setDeviceStates] = useState<Map<string, DeviceState>>(new Map());
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [totalBlocked, setTotalBlocked] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [companies, setCompanies] = useState(new Set<string>());
  const [tick, setTick] = useState(0);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string | null>(urlRoom);

  // Live room hook
  const {
    stats: roomStats,
    liveEvents,
    connected: roomConnected,
    error: roomError,
  } = useLiveRoom(activeRoom);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const companiesRef = useRef(new Set<string>());

  // Initialize device states when scenario changes
  useEffect(() => {
    const initial = new Map<string, DeviceState>();
    for (const device of scenario.devices) {
      initial.set(device.id, {
        device,
        trackerCount: device.baseTrackers,
        lastHit: 0,
        pulsing: false,
      });
    }
    setDeviceStates(initial);
    setEvents([]);
    setTotalAttempts(0);
    setTotalBlocked(0);
    setTotalBytes(0);
    companiesRef.current = new Set();
    setCompanies(new Set());
    setTick(0);
  }, [scenarioId]);

  // Event generation loop
  const generateEvent = useCallback(() => {
    const devicesArr = scenario.devices;
    if (devicesArr.length === 0) return;
    const device = pick(devicesArr);
    const tracker = pick(TRACKERS);
    const dataType = pick(DATA_TYPES);
    const blocked = Math.random() < 0.89; // 89% blocked by AnkrShield
    const bytes = Math.floor(Math.random() * 50000) + 2000;

    const ev: TrackerEvent = {
      id: `${Date.now()}-${Math.random()}`,
      ts: Date.now(),
      deviceId: device.id,
      deviceName: device.name,
      deviceIcon: device.icon,
      tracker,
      dataType,
      blocked,
    };

    setEvents((prev) => [ev, ...prev].slice(0, 40));

    setDeviceStates((prev) => {
      const next = new Map(prev);
      const ds = next.get(device.id);
      if (ds) {
        next.set(device.id, {
          ...ds,
          trackerCount: ds.trackerCount + 1,
          lastHit: Date.now(),
          pulsing: true,
        });
        // Clear pulse after 600ms
        setTimeout(() => {
          setDeviceStates((p) => {
            const m = new Map(p);
            const d = m.get(device.id);
            if (d) m.set(device.id, { ...d, pulsing: false });
            return m;
          });
        }, 600);
      }
      return next;
    });

    setTotalAttempts((n) => n + 1);
    if (blocked) setTotalBlocked((n) => n + 1);
    setTotalBytes((n) => n + bytes);
    companiesRef.current.add(tracker.company);
    setCompanies(new Set(companiesRef.current));
    setTick((n) => n + 1);
  }, [scenario]);

  useEffect(() => {
    if (paused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const interval = Math.max(200, Math.round(800 / speed));
    timerRef.current = setInterval(generateEvent, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, speed, generateEvent]);

  const blockedPct = totalAttempts > 0 ? Math.round((totalBlocked / totalAttempts) * 100) : 0;
  const dsArr = Array.from(deviceStates.values());
  const totalTrackers = dsArr.reduce((s, ds) => s + ds.trackerCount, 0);

  // Display values — switch between live and demo mode
  const displayDevices = isLiveMode && roomStats ? roomStats.totalDevices : scenario.devices.length;
  const displayAttempts = isLiveMode && roomStats ? roomStats.totalEvents : totalAttempts;
  const displayBlockedPct = isLiveMode && roomStats ? roomStats.blockedPct : blockedPct;
  const displayBytes = isLiveMode && roomStats ? roomStats.totalBytes : totalBytes;
  const displayCompanies = isLiveMode && roomStats ? roomStats.uniqueCompanies : companies.size;
  const displayDataValue = (displayBytes / 1e9) * 47;

  return (
    <div className="min-h-screen bg-[#080c14] text-white font-sans antialiased">
      {/* Create Room Modal */}
      {showCreateRoom && (
        <CreateRoomModal
          onCreated={(code) => {
            setActiveRoom(code);
            window.history.pushState({}, '', `?room=${code}`);
            setShowCreateRoom(false);
          }}
          onClose={() => setShowCreateRoom(false)}
        />
      )}

      {/* ── Nav ── */}
      <nav className="border-b border-white/5 bg-[#080c14]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛡️</span>
            <span className="font-bold tracking-tight">AnkrShield</span>
            <span className="hidden sm:inline text-gray-600 text-sm">/ Live Tracker Demo</span>
          </div>

          {/* Scenario pills */}
          <div className="hidden md:flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenarioId(s.id)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  scenarioId === s.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {s.icon} {s.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Create Room button for organizers */}
            <button
              onClick={() => setShowCreateRoom(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
            >
              🎤 Create Room
            </button>
            {/* Live pulse */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {isLiveMode ? 'LIVE ROOM' : 'LIVE'}
            </div>
            <a href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← Home
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Live Room Banner ── */}
        {isLiveMode && (
          <div
            className={`flex flex-wrap items-center gap-4 px-5 py-3 rounded-xl border ${
              roomConnected
                ? 'border-green-500/40 bg-green-950/20'
                : 'border-yellow-500/40 bg-yellow-950/20'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${roomConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">
                Live Room:{' '}
                <span className="font-mono text-blue-300 tracking-widest text-base">
                  {activeRoom}
                </span>
                {roomStats?.label && (
                  <span className="ml-2 text-gray-400 font-normal text-xs">{roomStats.label}</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {roomConnected ? 'Streaming live tracker data' : 'Connecting…'}
                {roomError && <span className="text-yellow-400 ml-2">{roomError}</span>}
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="font-black text-white font-mono text-lg">
                  {roomStats?.totalDevices ?? 0}
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">devices</div>
              </div>
              <div className="text-center">
                <div className="font-black text-red-400 font-mono text-lg">
                  {(roomStats?.totalEvents ?? 0).toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">
                  tracker hits
                </div>
              </div>
              <div className="text-center">
                <div className="font-black text-emerald-400 font-mono text-lg">
                  {roomStats?.blockedPct ?? 0}%
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">blocked</div>
              </div>
            </div>
            <div className="text-xs text-gray-600">
              Share code: <span className="font-mono text-gray-300 font-bold">{activeRoom}</span>
              {' · '}
              <span className="text-gray-600">
                Phones join at{' '}
                <span className="text-blue-400">xshieldai.com/live?room={activeRoom}</span>
              </span>
            </div>
          </div>
        )}

        {/* ── Hero stat bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Devices', value: displayDevices, icon: '📱', color: 'text-blue-400' },
            {
              label: isLiveMode
                ? 'Tracker Hits'
                : showBlocked
                  ? 'Trackers Left'
                  : 'Tracker Attempts',
              value: isLiveMode
                ? displayAttempts
                : showBlocked
                  ? Math.round(totalTrackers * 0.11)
                  : totalAttempts,
              icon: '🎯',
              color: !isLiveMode && showBlocked ? 'text-emerald-400' : 'text-red-400',
            },
            {
              label: 'Blocked',
              value: displayBlockedPct,
              icon: '🛡',
              color: 'text-emerald-400',
              suffix: '%',
            },
            {
              label: 'Data Transmitted',
              value: fmtBytes(displayBytes),
              icon: '📊',
              color: 'text-orange-400',
              raw: true,
            },
            { label: 'Companies', value: displayCompanies, icon: '🏢', color: 'text-purple-400' },
            {
              label: 'Data Value',
              value: `$${displayDataValue.toFixed(2)}`,
              icon: '💰',
              color: 'text-yellow-400',
              raw: true,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 text-center"
            >
              <div className="text-lg mb-1">{stat.icon}</div>
              <div className={`text-xl font-black font-mono ${stat.color}`}>
                {stat.raw ? stat.value : <Counter value={stat.value as number} />}
                {stat.suffix}
              </div>
              <div className="text-[10px] text-gray-600 uppercase tracking-widest mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Before/After toggle + controls ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowBlocked(false)}
              className={`px-4 py-2 text-sm font-semibold transition ${!showBlocked ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              😨 Without AnkrShield
            </button>
            <button
              onClick={() => setShowBlocked(true)}
              className={`px-4 py-2 text-sm font-semibold transition ${showBlocked ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              😌 With AnkrShield
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setPaused((p) => !p)}
              className="px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:text-white transition"
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="px-2 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none"
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={5}>5×</option>
              <option value={10}>10×</option>
            </select>
          </div>
        </div>

        {/* ── Scenario selector (mobile) ── */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setScenarioId(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                scenarioId === s.id
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'text-gray-400 bg-gray-900 border-gray-700 hover:text-white'
              }`}
            >
              {s.icon} {s.name}
            </button>
          ))}
        </div>

        {/* ── Main content: device grid + activity feed ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Device grid */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg">
                {scenario.icon} {scenario.name}
              </h2>
              <span className="text-gray-600 text-sm">— {scenario.desc}</span>
              {!showBlocked && (
                <span className="ml-auto text-xs text-red-400 font-semibold animate-pulse">
                  ⚠ {dsArr.reduce((s, ds) => s + ds.trackerCount, 0).toLocaleString()} total tracker
                  hits
                </span>
              )}
            </div>

            <div
              className={`grid gap-3 ${
                dsArr.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
              {dsArr.map((ds) => (
                <DeviceCard key={ds.device.id} ds={ds} showBlocked={showBlocked} />
              ))}
            </div>

            {/* Before/After comparison card */}
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="rounded-xl border border-red-500/30 bg-red-950/10 p-4 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">
                  Without AnkrShield
                </div>
                <div className="text-3xl font-black text-red-400 font-mono">
                  {totalAttempts.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">tracking attempts</div>
                <div className="text-xs text-red-400 mt-2">0% blocked 😰</div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-4 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">
                  With AnkrShield
                </div>
                <div className="text-3xl font-black text-emerald-400 font-mono">
                  {Math.round(totalAttempts * 0.11).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">slipped through</div>
                <div className="text-xs text-emerald-400 mt-2">89% blocked 😊</div>
              </div>
            </div>
          </div>

          {/* Activity feed */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="font-bold text-sm uppercase tracking-widest text-gray-400">
                Live Tracking Activity
              </h2>
              <span className="ml-auto text-xs text-gray-700">
                {isLiveMode ? liveEvents.length : tick} events
              </span>
            </div>
            <div className="flex-1 space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {isLiveMode ? (
                liveEvents.length === 0 ? (
                  <div className="text-center text-gray-700 text-sm py-10">
                    {roomConnected
                      ? 'Waiting for devices to join and report events…'
                      : 'Connecting to live room…'}
                  </div>
                ) : (
                  liveEvents.map((ev) => <LiveActivityRow key={ev.id} ev={ev} />)
                )
              ) : events.length === 0 ? (
                <div className="text-center text-gray-700 text-sm py-10">Starting simulation…</div>
              ) : (
                events.map((ev) => <ActivityRow key={ev.id} ev={ev} />)
              )}
            </div>
          </div>
        </div>

        {/* ── Top Offenders ── */}
        {isLiveMode
          ? roomStats &&
            roomStats.topTrackers.length > 0 && (
              <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5">
                <h2 className="font-bold text-sm uppercase tracking-widest text-gray-400 mb-4">
                  🏆 Top Trackers (Live Room)
                </h2>
                <div className="flex flex-wrap gap-3">
                  {roomStats.topTrackers.map(({ tracker, count }) => (
                    <div
                      key={tracker}
                      className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                    >
                      <span className="text-sm font-semibold text-gray-200 font-mono">
                        {tracker}
                      </span>
                      <span className="text-xs text-red-400 font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          : companies.size > 0 && (
              <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5">
                <h2 className="font-bold text-sm uppercase tracking-widest text-gray-400 mb-4">
                  🏆 Top Tracker Companies
                </h2>
                <div className="flex flex-wrap gap-3">
                  {Array.from(companies).map((company) => {
                    const companyEvents = events.filter((e) => e.tracker.company === company);
                    return (
                      <div
                        key={company}
                        className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-gray-200">{company}</span>
                        <span className="text-xs text-red-400 font-mono">
                          {companyEvents.length}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

        {/* ── Conference join / CTA strip ── */}
        <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-1">
                😱 This is happening to YOUR phone right now.
              </h2>
              <p className="text-gray-400 text-sm">
                AnkrShield blocks 89% of these tracking attempts — silently, in real time. Free for
                individuals. Works on Android today.
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                <a
                  href="/ankrshield.apk"
                  download
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition"
                >
                  📥 Download Android App
                </a>
                <a
                  href="/register"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition"
                >
                  🛡 Start Free Protection
                </a>
              </div>
            </div>
            {/* QR placeholder — real QR from /register once Sprint 3 is done */}
            <div className="flex-shrink-0 w-28 h-28 bg-white rounded-xl flex items-center justify-center text-gray-900 text-xs font-bold text-center p-2">
              <div>
                <div className="text-3xl mb-1">📱</div>
                Scan to protect
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-700">
          <span>AnkrShield · Live Tracker Demo · Scenarios simulated for illustration</span>
          <span>
            Real protection available now ·{' '}
            <a href="/pricing" className="text-blue-600 hover:text-blue-400">
              See plans →
            </a>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
