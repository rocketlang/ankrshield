/**
 * timeoutSignal — Hermes-safe fetch timeout.
 *
 * React Native's Hermes engine has NO AbortSignal.timeout(); calling it throws,
 * which silently killed every fetch that used it (IOC sync, link scan, phone
 * risk). This AbortController-based equivalent works in Hermes.
 */
export function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
