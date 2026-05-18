#!/usr/bin/env node
/* eslint-disable */
/**
 * build-tracker-db.js
 *
 * Generates tracker-db.sqlite for the Android asset bundle.
 * Output: app/src/main/assets/tracker-db.sqlite
 *
 * Sources:
 *   1. AnkrShield IOC list (packages/android-monitor)
 *   2. Curated tracking domains (advertising, analytics, fingerprinting,
 *      social widgets, stalkerware C2 infrastructure)
 *
 * Run: node build-tracker-db.js
 * Requires: better-sqlite3  (npm i -D better-sqlite3)
 */

const path = require('path');
const fs = require('fs');

// ── Check for better-sqlite3 ─────────────────────────────────────────────────
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  console.error('better-sqlite3 not found. Run: npm install -g better-sqlite3');
  process.exit(1);
}

const OUT = path.resolve(__dirname, 'app/src/main/assets/tracker-db.sqlite');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

const db = new Database(OUT);

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE trackers (
    domain      TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    vendor      TEXT,
    risk_level  INTEGER NOT NULL DEFAULT 1,
    added_date  TEXT NOT NULL
  );
  CREATE INDEX idx_domain ON trackers(domain);
`);

const insert = db.prepare(
  'INSERT OR IGNORE INTO trackers (domain, category, vendor, risk_level, added_date) VALUES (?, ?, ?, ?, ?)'
);

const today = new Date().toISOString().slice(0, 10);
let count = 0;

function add(domain, category, vendor, riskLevel = 1) {
  insert.run(domain.toLowerCase().trim(), category, vendor ?? null, riskLevel, today);
  count++;
}

// ── Bulk insert helper ────────────────────────────────────────────────────────
const bulkInsert = db.transaction((entries) => {
  for (const [domain, category, vendor, risk] of entries) {
    add(domain, category, vendor, risk);
  }
});

// ── 1. Advertising & tracking networks ───────────────────────────────────────
bulkInsert([
  // Google
  ['doubleclick.net', 'advertising', 'Google', 2],
  ['googlesyndication.com', 'advertising', 'Google', 2],
  ['googletagmanager.com', 'analytics', 'Google', 1],
  ['googletagservices.com', 'advertising', 'Google', 2],
  ['google-analytics.com', 'analytics', 'Google', 2],
  ['googleadservices.com', 'advertising', 'Google', 2],
  ['googlevideo.com', 'advertising', 'Google', 1],
  ['adservice.google.com', 'advertising', 'Google', 2],
  ['pagead2.googlesyndication.com', 'advertising', 'Google', 2],
  // Facebook / Meta
  ['facebook.com', 'social', 'Meta', 2],
  ['graph.facebook.com', 'social', 'Meta', 3],
  ['connect.facebook.net', 'social', 'Meta', 2],
  ['fbcdn.net', 'social', 'Meta', 1],
  ['fbsbx.com', 'social', 'Meta', 2],
  ['instagram.com', 'social', 'Meta', 2],
  ['pixel.facebook.com', 'advertising', 'Meta', 3],
  ['an.facebook.com', 'advertising', 'Meta', 3],
  ['atdmt.com', 'advertising', 'Meta', 3],
  // Amazon
  ['ads.amazon.com', 'advertising', 'Amazon', 2],
  ['amazon-adsystem.com', 'advertising', 'Amazon', 2],
  ['adsystem.amazon.com', 'advertising', 'Amazon', 2],
  ['fls-na.amazon.com', 'fingerprinting', 'Amazon', 3],
  // Microsoft
  ['ads.microsoft.com', 'advertising', 'Microsoft', 2],
  ['bing.com', 'advertising', 'Microsoft', 1],
  ['bat.bing.com', 'advertising', 'Microsoft', 2],
  ['c.msn.com', 'advertising', 'Microsoft', 2],
  ['scorecardresearch.com', 'analytics', 'Comscore', 2],
  // Twitter / X
  ['ads-twitter.com', 'advertising', 'Twitter/X', 2],
  ['t.co', 'social', 'Twitter/X', 1],
  ['syndication.twitter.com', 'social', 'Twitter/X', 2],
  // TikTok / ByteDance
  ['tiktokcdn.com', 'social', 'ByteDance', 2],
  ['musical.ly', 'social', 'ByteDance', 2],
  ['bytedance.com', 'analytics', 'ByteDance', 3],
  ['byteoversea.com', 'analytics', 'ByteDance', 3],
  ['tiktokv.com', 'analytics', 'ByteDance', 3],
  // Advertising networks
  ['criteo.com', 'advertising', 'Criteo', 2],
  ['criteo.net', 'advertising', 'Criteo', 2],
  ['pubmatic.com', 'advertising', 'PubMatic', 2],
  ['rubiconproject.com', 'advertising', 'Magnite', 2],
  ['openx.net', 'advertising', 'OpenX', 2],
  ['openx.com', 'advertising', 'OpenX', 2],
  ['appnexus.com', 'advertising', 'Xandr', 2],
  ['adnxs.com', 'advertising', 'Xandr', 2],
  ['liveramp.com', 'data_broker', 'LiveRamp', 3],
  ['liveramp.net', 'data_broker', 'LiveRamp', 3],
  ['adroll.com', 'advertising', 'AdRoll', 2],
  ['mopub.com', 'advertising', 'Twitter/X', 2],
  ['moatads.com', 'advertising', 'Oracle', 2],
  ['adform.net', 'advertising', 'Adform', 2],
  ['smartadserver.com', 'advertising', 'Equativ', 2],
  ['outbrain.com', 'advertising', 'Outbrain', 2],
  ['taboola.com', 'advertising', 'Taboola', 2],
  ['spotxchange.com', 'advertising', 'Magnite', 2],
  ['conversantmedia.com', 'advertising', 'Conversant', 2],
  ['oath.com', 'advertising', 'Verizon', 2],
  ['yahoo.com', 'advertising', 'Yahoo', 1],
  ['yimg.com', 'advertising', 'Yahoo', 1],
  ['media.net', 'advertising', 'Media.net', 2],
  ['tradedesk.net', 'advertising', 'TradeDesk', 2],
  ['thetradedesk.com', 'advertising', 'TradeDesk', 2],
  ['sharethrough.com', 'advertising', 'Sharethrough', 2],
  ['triplelift.com', 'advertising', 'TripleLift', 2],
  // Analytics
  ['hotjar.com', 'analytics', 'Hotjar', 2],
  ['mouseflow.com', 'analytics', 'Mouseflow', 2],
  ['mixpanel.com', 'analytics', 'Mixpanel', 2],
  ['segment.com', 'analytics', 'Segment', 2],
  ['segment.io', 'analytics', 'Segment', 2],
  ['amplitude.com', 'analytics', 'Amplitude', 2],
  ['appsflyer.com', 'analytics', 'AppsFlyer', 2],
  ['branch.io', 'analytics', 'Branch', 2],
  ['adjust.com', 'analytics', 'Adjust', 2],
  ['kochava.com', 'analytics', 'Kochava', 2],
  ['singular.net', 'analytics', 'Singular', 2],
  ['moengage.com', 'analytics', 'MoEngage', 2],
  ['clevertap.com', 'analytics', 'CleverTap', 2],
  ['localytics.com', 'analytics', 'Localytics', 2],
  ['keen.io', 'analytics', 'Keen', 1],
  ['fullstory.com', 'analytics', 'FullStory', 3],
  ['logrocket.com', 'analytics', 'LogRocket', 3],
  ['clarity.ms', 'analytics', 'Microsoft', 2],
  ['nr-data.net', 'analytics', 'NewRelic', 1],
  ['newrelic.com', 'analytics', 'NewRelic', 1],
  ['bugsnag.com', 'analytics', 'Bugsnag', 1],
  ['sentry.io', 'analytics', 'Sentry', 1],
  ['datadog-browser-agent.com', 'analytics', 'DataDog', 1],
  // Fingerprinting
  ['fingerprintjs.com', 'fingerprinting', 'FingerprintJS', 3],
  ['fpjs.io', 'fingerprinting', 'FingerprintJS', 3],
  ['device.fingerprint.com', 'fingerprinting', 'Unknown', 4],
  ['iovation.com', 'fingerprinting', 'TransUnion', 3],
  ['threatmetrix.com', 'fingerprinting', 'LexisNexis', 3],
  ['signifyd.com', 'fingerprinting', 'Signifyd', 2],
  ['maxmind.com', 'fingerprinting', 'MaxMind', 2],
]);

// ── 2. Stalkerware / Spyware C2 infrastructure ────────────────────────────────
bulkInsert([
  // FlexiSpy
  ['api.flexispy.com', 'stalkerware', 'FlexiSpy', 4],
  ['flexispy.com', 'stalkerware', 'FlexiSpy', 4],
  ['upload.flexispy.com', 'stalkerware', 'FlexiSpy', 4],
  // mSpy
  ['mspy.com', 'stalkerware', 'mSpy', 4],
  ['api.mspy.com', 'stalkerware', 'mSpy', 4],
  ['upload.mspy.com', 'stalkerware', 'mSpy', 4],
  // TheTruthSpy
  ['thetruthspy.com', 'stalkerware', 'TheTruthSpy', 4],
  ['tracking.thetruthspy.com', 'stalkerware', 'TheTruthSpy', 4],
  // Hoverwatch
  ['hoverwatch.com', 'stalkerware', 'Hoverwatch', 4],
  ['api.hoverwatch.com', 'stalkerware', 'Hoverwatch', 4],
  // Cocospy
  ['cocospy.com', 'stalkerware', 'Cocospy', 4],
  ['api.cocospy.com', 'stalkerware', 'Cocospy', 4],
  // Spyzie
  ['spyzie.com', 'stalkerware', 'Spyzie', 4],
  // iKeyMonitor
  ['ikeymonitor.com', 'stalkerware', 'iKeyMonitor', 4],
  // Clevguard/KidsGuard
  ['clevguard.com', 'stalkerware', 'ClevGuard', 4],
  ['kidsguard.com', 'stalkerware', 'ClevGuard', 4],
  // SpyHuman
  ['spyhuman.com', 'stalkerware', 'SpyHuman', 4],
  // General stalkerware patterns
  ['track.family', 'stalkerware', 'Unknown', 4],
  ['sms-tracker.com', 'stalkerware', 'Unknown', 4],
  ['phone-tracker.org', 'stalkerware', 'Unknown', 4],
  // Pegasus infrastructure (known from Citizen Lab research)
  ['pki.infostrategist.com', 'apt', 'NSO Group', 4],
  ['stablebit.org', 'apt', 'NSO Group', 4],
  ['smsverify33.com', 'apt', 'NSO Group', 4],
  ['opendatasurvey.net', 'apt', 'NSO Group', 4],
  ['onlinenewspost.org', 'apt', 'NSO Group', 4],
  ['geographyandhistory.com', 'apt', 'NSO Group', 4],
]);

// ── 3. Data brokers ───────────────────────────────────────────────────────────
bulkInsert([
  ['acxiom.com', 'data_broker', 'Acxiom', 3],
  ['datalogix.com', 'data_broker', 'Oracle', 3],
  ['epsilon.com', 'data_broker', 'Epsilon', 3],
  ['experian.com', 'data_broker', 'Experian', 2],
  ['equifax.com', 'data_broker', 'Equifax', 2],
  ['transunion.com', 'data_broker', 'TransUnion', 2],
  ['oracle.com', 'data_broker', 'Oracle', 2],
  ['bluekai.com', 'data_broker', 'Oracle', 3],
  ['addthis.com', 'data_broker', 'Oracle', 3],
  ['lotame.com', 'data_broker', 'Lotame', 3],
  ['kruxdigital.com', 'data_broker', 'Salesforce', 3],
]);

// ── 4. Push notification / tracking SDKs ─────────────────────────────────────
bulkInsert([
  ['onesignal.com', 'sdk', 'OneSignal', 1],
  ['pusher.com', 'sdk', 'Pusher', 1],
  ['firebase.google.com', 'analytics', 'Google', 2],
  ['firebaseio.com', 'analytics', 'Google', 2],
  ['fcm.googleapis.com', 'analytics', 'Google', 2],
  ['crashlytics.com', 'analytics', 'Google', 1],
  ['app-measurement.com', 'analytics', 'Google', 2],
]);

db.close();
console.log(`✓ tracker-db.sqlite built: ${count} domains → ${OUT}`);
