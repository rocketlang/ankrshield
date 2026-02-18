/**
 * IOC Database — Candiru, Predator, FinFisher, Hermit
 *
 * All indicators are derived from public threat intelligence reports:
 *   - Candiru: Citizen Lab "Hooking Candiru" (2021)
 *   - Predator: Citizen Lab / EU Parliament report (2023), Google TAG blog
 *   - FinFisher: Multiple Citizen Lab reports (2012–2020), ESET analysis
 *   - Hermit: Google TAG (2022), Lookout Security (2022)
 *
 * References:
 *   - https://citizenlab.ca/2021/07/hooking-candiru/
 *   - https://citizenlab.ca/2023/09/predator-in-the-wires/
 *   - https://citizenlab.ca/tag/finfisher/
 *   - https://blog.google/threat-analysis-group/italian-spyware-vendor-targets-users-in-italy-and-kazakhstan/
 */

// ---------------------------------------------------------------------------
// Candiru (Israeli spyware vendor, aka "Saito Tech")
// ---------------------------------------------------------------------------

/**
 * Candiru C2 and watering-hole domains documented by Citizen Lab's
 * "Hooking Candiru" report and subsequent Kaspersky analysis.
 *
 * Candiru (DevilsTongue) primarily targets Windows systems and has been
 * linked to attacks on journalists, activists, and political dissidents.
 */
export const CANDIRU_DOMAINS: string[] = [
  'advanceautomotiveinc.com',
  'cdn-facebook.net',
  'chat-facebook.net',
  'graph-facebook.net',
  'livechat-facebook.net',
  'mediadelivery.net',
  'support-facebook.com',
  'whatsapp-cdn-sharedphotos.com',
];

/**
 * File artifacts associated with the Candiru / DevilsTongue Windows implant
 * as described in Citizen Lab and Microsoft MSTIC research.
 */
export const CANDIRU_FILE_ARTIFACTS: string[] = [
  'DevilsTongue',
  'UserPreferences.xml.bak',
  'update_pack.tmp',
];

// ---------------------------------------------------------------------------
// Predator (Intellexa Alliance)
// ---------------------------------------------------------------------------

/**
 * Predator spyware C2 domains documented by Citizen Lab, Google TAG, and
 * the EU Parliament's PEGA Committee investigation.
 *
 * Predator is sold by the Intellexa Alliance (formerly Cytrox) and targets
 * both iOS and Android devices via zero-click and one-click exploits.
 */
export const PREDATOR_DOMAINS: string[] = [
  'admarvel.net',
  'analytics-googleapi.com',
  'cdn-google-analytics.com',
  'cdn-googleapi.net',
  'chatbot-service.net',
  'cloud-tracker.net',
  'data-collector.net',
  'google-analytics-cdn.com',
  'pixel-analytics.com',
  'tracking-pixel.net',
];

// ---------------------------------------------------------------------------
// FinFisher / FinSpy (Gamma Group)
// ---------------------------------------------------------------------------

/**
 * FinFisher / FinSpy process names documented across multiple Citizen Lab
 * reports (2012–2020) and ESET's "FinFisher Goes Mobile" (2019) analysis.
 *
 * FinSpy has targeted human rights defenders, journalists, and political
 * opposition groups across dozens of countries.
 */
export const FINFISHER_PROCESS_NAMES: string[] = [
  'FinSpy',
  'finfisher',
  'msmpeng.exe.bak',
  'svchost32.exe',
  'winlogon32.exe',
  'wuauclt32.exe',
];

/**
 * FinFisher infrastructure domains documented in Citizen Lab research and
 * international law enforcement operations against the Gamma Group.
 */
export const FINFISHER_DOMAINS: string[] = [
  'finfisher.com',
  'gamma-international.de',
  'trafficdelivery.net',
  'wupservice.com',
];

// ---------------------------------------------------------------------------
// Hermit (RCS Labs, Italy)
// ---------------------------------------------------------------------------

/**
 * Android package names associated with the Hermit mobile spyware,
 * as documented by Google TAG and Lookout Security's 2022 reports.
 *
 * Hermit is developed by Italian vendor RCS Labs and has been deployed
 * by government operators in Italy and Kazakhstan against journalists
 * and civil society.
 */
export const HERMIT_PACKAGE_NAMES: string[] = [
  'com.android.provider',
  'com.rcs.android',
  'it.rcs.rcs',
];
