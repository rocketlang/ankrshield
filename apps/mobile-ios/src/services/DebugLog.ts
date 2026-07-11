/**
 * DebugLog — a tiny in-app log buffer so a tester can SEE what failed on the
 * device without adb/logcat. Captures three things:
 *   1. Explicit DebugLog.log(tag, msg) calls (e.g. native "Enable" failures)
 *   2. console.error / console.warn (patched once, still forwarded to the console)
 *   3. Uncaught JS errors via the global ErrorUtils handler
 *
 * Native (Java) crashes cannot be caught here — but once the foreground-service
 * crash is fixed, the remaining failures are JS-visible promise rejections, which
 * this DOES capture. Reachable from Settings → "Diagnostic Log".
 */

export interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  tag: string;
  msg: string;
}

const MAX_ENTRIES = 300;
const buffer: LogEntry[] = [];
const subscribers = new Set<(_entries: LogEntry[]) => void>();

function emit() {
  const snapshot = buffer.slice();
  subscribers.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (_e) {
      // a bad subscriber must never break logging
    }
  });
}

function push(level: LogEntry['level'], tag: string, msg: string) {
  buffer.unshift({ ts: Date.now(), level, tag, msg });
  if (buffer.length > MAX_ENTRIES) {
    buffer.length = MAX_ENTRIES;
  }
  emit();
}

/** Normalise any thrown value / arg list into a readable string. */
function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) {
        return a.message || a.name || 'Error';
      }
      if (typeof a === 'string') {
        return a;
      }
      try {
        return JSON.stringify(a);
      } catch (_e) {
        return String(a);
      }
    })
    .join(' ');
}

export const DebugLog = {
  log(tag: string, ...args: unknown[]) {
    push('info', tag, stringify(args));
  },
  warn(tag: string, ...args: unknown[]) {
    push('warn', tag, stringify(args));
  },
  error(tag: string, ...args: unknown[]) {
    push('error', tag, stringify(args));
  },
  getAll(): LogEntry[] {
    return buffer.slice();
  },
  clear() {
    buffer.length = 0;
    emit();
  },
  subscribe(fn: (entries: LogEntry[]) => void): () => void {
    subscribers.add(fn);
    fn(buffer.slice());
    return () => subscribers.delete(fn);
  },
  /** Flatten the buffer to shareable plain text (newest first). */
  toText(): string {
    if (buffer.length === 0) {
      return 'AnkrShield diagnostic log — empty.';
    }
    return buffer
      .map((e) => {
        const t = new Date(e.ts).toISOString().replace('T', ' ').slice(0, 19);
        return `${t}  [${e.level.toUpperCase()}] ${e.tag}: ${e.msg}`;
      })
      .join('\n');
  },
};

let installed = false;

/**
 * Patch console.error/warn and the global JS error handler exactly once.
 * Call from App bootstrap. Idempotent.
 */
export function installDebugLog() {
  if (installed) {
    return;
  }
  installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    push('error', 'console', stringify(args));
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    push('warn', 'console', stringify(args));
    origWarn(...args);
  };

  // Uncaught JS errors (RN exposes a global ErrorUtils).
  const g = global as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };
  if (g.ErrorUtils?.setGlobalHandler && g.ErrorUtils.getGlobalHandler) {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((e: unknown, isFatal?: boolean) => {
      const err = e as Error;
      push('error', isFatal ? 'FATAL' : 'uncaught', err?.message || String(e));
      if (typeof prev === 'function') {
        prev(e, isFatal);
      }
    });
  }

  push('info', 'DebugLog', 'diagnostic logging started');
}
