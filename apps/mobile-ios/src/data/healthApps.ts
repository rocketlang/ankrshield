/**
 * Health, fitness & wearable-companion apps.
 *
 * The privacy thesis at its sharpest (Samsung/wearable wedge, 2026-07-10): a
 * fitness app needs your heart rate TO SHOW YOU your heart rate — it does NOT
 * need to send it to an ad network or data broker. Any tracker contact from one
 * of these apps is "beyond minimum required scope" in the most visceral way.
 *
 * A Galaxy Watch (and most wearables) syncs THROUGH its phone companion app, so
 * these companion apps' network flows are already attributed by AnkrShield's
 * per-app DNS witness — this registry just lets us surface them as the
 * health-privacy story. No new plumbing; framing + labelling over shipped data.
 */

export type HealthKind = 'wearable' | 'fitness' | 'health';

export interface HealthApp {
  name: string;
  kind: HealthKind;
}

// package name → { display name, kind }
export const HEALTH_APPS: Record<string, HealthApp> = {
  // Wearable companion apps (the watch/band syncs through these)
  'com.sec.android.app.shealth': { name: 'Samsung Health', kind: 'wearable' },
  'com.samsung.android.app.watchmanager': { name: 'Galaxy Wearable', kind: 'wearable' },
  'com.samsung.android.wearable.shealth': { name: 'Samsung Health (Watch)', kind: 'wearable' },
  'com.google.android.apps.fitness': { name: 'Google Fit', kind: 'wearable' },
  'com.google.android.wearable.app': { name: 'Wear OS', kind: 'wearable' },
  'com.fitbit.FitbitMobile': { name: 'Fitbit', kind: 'wearable' },
  'com.garmin.android.apps.connectmobile': { name: 'Garmin Connect', kind: 'wearable' },
  'com.huami.watch.hmwatchmanager': { name: 'Amazfit / Zepp', kind: 'wearable' },
  'com.huami.midong': { name: 'Zepp Life (Mi Fit)', kind: 'wearable' },
  'com.xiaomi.wearable': { name: 'Mi Fitness (Xiaomi Wear)', kind: 'wearable' },
  'com.crrepa.band.dafit': { name: 'Da Fit', kind: 'wearable' },
  'com.szabh.smable3': { name: 'Noise Buds/Watch (NoiseFit)', kind: 'wearable' },
  'com.noisefit': { name: 'NoiseFit', kind: 'wearable' },
  'com.boat.crest': { name: 'boAt Crest', kind: 'wearable' },
  'com.realme.link': { name: 'realme Link', kind: 'wearable' },
  'com.oplus.wearable': { name: 'OnePlus/OPPO Health', kind: 'wearable' },
  'com.wearible.fireboltt': { name: 'Fire-Boltt', kind: 'wearable' },

  // Fitness / activity apps
  'com.strava': { name: 'Strava', kind: 'fitness' },
  'com.myfitnesspal.android': { name: 'MyFitnessPal', kind: 'fitness' },
  'com.fitnesskeeper.runkeeper.pro': { name: 'Runkeeper', kind: 'fitness' },
  'je.fit': { name: 'JEFIT', kind: 'fitness' },
  'com.google.android.apps.healthdata': { name: 'Health Connect', kind: 'health' },
  'cc.pacer.androidapp': { name: 'Pacer', kind: 'fitness' },
  'com.cult.fitso': { name: 'cult.fit', kind: 'fitness' },
  'com.healthifyme.basic': { name: 'HealthifyMe', kind: 'health' },

  // Health / medical
  'com.practo.fabric': { name: 'Practo', kind: 'health' },
  'com.apollo.android': { name: 'Apollo 24|7', kind: 'health' },
  'com.onemg.consumer': { name: '1mg', kind: 'health' },
  'com.pharmeasy': { name: 'PharmEasy', kind: 'health' },
};

/** Match a verdict package (may be a comma-joined shared-UID set) to a health app. */
export function matchHealthApp(packageName: string): HealthApp | null {
  for (const pkg of packageName.split(',')) {
    const hit = HEALTH_APPS[pkg.trim()];
    if (hit) {
      return hit;
    }
  }
  return null;
}

export const KIND_META: Record<HealthKind, { label: string; icon: string }> = {
  wearable: { label: 'Wearable', icon: '⌚' },
  fitness: { label: 'Fitness', icon: '🏃' },
  health: { label: 'Health', icon: '❤️' },
};
