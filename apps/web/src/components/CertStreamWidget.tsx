/**
 * CertStreamWidget — Real-time Certificate Transparency Monitor (X8)
 *
 * Connects via Server-Sent Events to GET /risk/cert-stream?domain=
 * Displays new SSL certs issued for a domain and its lookalikes.
 * Highlights typosquat certs in red — early warning for phishing campaigns.
 */
import { AlertTriangle, Clock, ExternalLink, Radio, Shield } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CertRecord {
  commonName: string;
  issuer?: string;
  notBefore?: string;
  isTyposquat?: boolean;
  riskScore?: number;
}

interface CertStreamWidgetProps {
  domain: string;
  maxItems?: number;
  apiBase?: string;
  className?: string;
}

export default function CertStreamWidget({
  domain,
  maxItems = 20,
  apiBase,
  className = '',
}: CertStreamWidgetProps) {
  const [certs, setCerts] = useState<CertRecord[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [totalSeen, setTotalSeen] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!domain) return;
    const base = apiBase ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4250';
    const url = `${base}/risk/cert-stream?domain=${encodeURIComponent(domain)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => setConnected(true));
    es.addEventListener('cert', (e: MessageEvent) => {
      try {
        const cert: CertRecord = JSON.parse(e.data as string);
        setCerts((prev) => [cert, ...prev].slice(0, maxItems));
        setLastUpdate(new Date());
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('heartbeat', (e: MessageEvent) => {
      setLastUpdate(new Date());
      try {
        const hb = JSON.parse(e.data as string) as { total?: number };
        if (hb.total !== undefined) setTotalSeen(hb.total);
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [domain, maxItems, apiBase]);

  const typosquatCount = certs.filter((c) => c.isTyposquat).length;

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400 shrink-0" />
          <h3 className="text-sm font-semibold text-white">CT Monitor</h3>
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}
          />
          {connected && (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <Radio className="w-2.5 h-2.5" /> LIVE
            </span>
          )}
        </div>
        {lastUpdate && (
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        Certificates for <span className="text-violet-400 font-mono">{domain}</span> and lookalikes
        {totalSeen > 0 && <span className="ml-2 text-gray-600">· {totalSeen} seen</span>}
      </p>
      {typosquatCount > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-red-950/40 border border-red-800/60">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-xs text-red-300">
            {typosquatCount} typosquat cert{typosquatCount !== 1 ? 's' : ''} — possible phishing
            prep
          </span>
        </div>
      )}
      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {certs.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-xs">
            {connected
              ? 'Monitoring active — no new certificates yet'
              : 'Connecting to CT log stream…'}
          </div>
        ) : (
          certs.map((cert, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg text-xs border-l-2 ${cert.isTyposquat ? 'bg-red-950/20 border-red-500' : 'bg-gray-800/50 border-gray-700'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono font-medium truncate ${cert.isTyposquat ? 'text-red-300' : 'text-gray-200'}`}
                  title={cert.commonName}
                >
                  {cert.commonName}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {cert.isTyposquat && (
                    <span className="bg-red-900/80 text-red-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                      TYPOSQUAT
                    </span>
                  )}
                  {cert.riskScore != null && cert.riskScore > 0 && (
                    <span
                      className={`px-1 py-0.5 rounded text-[9px] font-medium ${cert.riskScore >= 70 ? 'bg-red-900/60 text-red-300' : cert.riskScore >= 40 ? 'bg-yellow-900/60 text-yellow-300' : 'bg-gray-700 text-gray-400'}`}
                    >
                      {cert.riskScore}
                    </span>
                  )}
                </div>
              </div>
              {(cert.issuer || cert.notBefore) && (
                <div className="flex items-center justify-between mt-0.5">
                  {cert.issuer && (
                    <span className="text-gray-500 text-[10px] truncate">{cert.issuer}</span>
                  )}
                  {cert.notBefore && (
                    <span className="text-gray-600 text-[10px] shrink-0 ml-2">
                      {new Date(cert.notBefore).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-800 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          via{' '}
          <a
            href="https://crt.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400"
          >
            crt.sh
          </a>
        </span>
        <a
          href={`https://crt.sh/?q=%.${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-400"
        >
          Full CT log <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}
