/**
 * PermissionState — honest per-tile readiness for the Protection Tools grid.
 *
 * Every Protection Tool declares a dependency (`Dep`). This service reads the
 * REAL live state of that dependency from the native modules that already
 * expose it — never a guess. A tile badge is only ever green ("On") when the
 * underlying capability is genuinely active on the device.
 *
 * Three honest states:
 *   active  — the dependency is verified ON (VPN running, accessibility service
 *             live, device-admin active, baseline snapshot taken, SMS granted).
 *   off     — the tile needs an OS permission/toggle that is NOT yet enabled.
 *   ready   — no special permission needed; the tool works on tap (input-based
 *             scanners, or PackageManager reads that Android grants at install).
 *
 * FP-018 (compute/quote/null): the badge is COMPUTED from a live native probe,
 * never asserted. If a probe throws, we fail to `false` (shown as "off"), never
 * to a false "on".
 */
import { NativeModules } from 'react-native';

const { DnsVpn, WhatsAppGuard, AntiTheft, RansomwareWatcher, OtpGuard, PermissionWatcher } =
  NativeModules as Record<string, { [k: string]: (..._args: any[]) => Promise<any> } | undefined>;

/** What a tile depends on. `none` = works with no permission. */
export type Dep =
  | 'none'
  | 'vpn' // DNS shield running (tracker/DNS-layer tiles)
  | 'accessibility' // AnkrShield accessibility service live (WhatsApp/attachment scan)
  | 'admin' // device-admin active (anti-theft lock/wipe)
  | 'ransomware' // ransomware file-watcher service running
  | 'sms' // RECEIVE_SMS granted (auto SMS fraud scan; paste still works without)
  | 'snapshot'; // permission baseline captured (perm-change diff)

export type TileState = 'active' | 'off' | 'ready';

/** Live boolean per dependency. `none` is always true (nothing to grant). */
export type PermissionSnapshot = Record<Dep, boolean>;

async function probe(fn?: (..._args: any[]) => Promise<any>): Promise<boolean> {
  if (typeof fn !== 'function') {
    return false;
  }
  try {
    return !!(await fn());
  } catch (_e) {
    // Native probe unavailable / threw → treat as not-active. Never a false green.
    return false;
  }
}

/** Read every dependency's live state in parallel. Safe on iOS (modules absent → false). */
export async function readPermissionState(): Promise<PermissionSnapshot> {
  const [vpn, accessibility, admin, ransomware, sms, snapshot] = await Promise.all([
    probe(DnsVpn?.isRunning),
    probe(WhatsAppGuard?.isRunning),
    probe(AntiTheft?.isDeviceAdminActive),
    probe(RansomwareWatcher?.isRunning),
    probe(OtpGuard?.hasPermission),
    probe(PermissionWatcher?.hasSnapshot),
  ]);
  return { none: true, vpn, accessibility, admin, ransomware, sms, snapshot };
}

/** Compute a tile's badge state from its declared dependency + the live snapshot. */
export function tileState(dep: Dep, snap: PermissionSnapshot): TileState {
  if (dep === 'none') {
    return 'ready';
  }
  return snap[dep] ? 'active' : 'off';
}

/** Short human label + what turns it on (used in the badge + tooltip line). */
export const DEP_LABEL: Record<Dep, string> = {
  none: 'Ready',
  vpn: 'DNS shield',
  accessibility: 'Accessibility',
  admin: 'Device admin',
  ransomware: 'File watcher',
  sms: 'SMS access',
  snapshot: 'Baseline',
};

/** Default snapshot before the first probe returns (everything off but `none`). */
export const EMPTY_SNAPSHOT: PermissionSnapshot = {
  none: true,
  vpn: false,
  accessibility: false,
  admin: false,
  ransomware: false,
  sms: false,
  snapshot: false,
};
