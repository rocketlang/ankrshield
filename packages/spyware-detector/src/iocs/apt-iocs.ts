/**
 * APT Group IOC Database
 *
 * Nation-state APT C2 infrastructure indicators sourced exclusively from
 * public government advisories (CISA, FBI, NSA, UK NCSC), court documents
 * (DOJ indictments), and security vendor public research (ESET, Mandiant,
 * Kaspersky GReAT, CrowdStrike, Microsoft MSTIC).
 *
 * All domains and IP prefixes listed here have been disclosed publicly
 * for defensive/detection purposes.
 *
 * Sources:
 *   - CISA AA21-048A (Lazarus / Hidden Cobra)
 *   - CISA AA22-108A (TraderTraitor / Lazarus)
 *   - CISA AA22-110A (Cyclops Blink / Sandworm)
 *   - DOJ 2020 Indictment: US v. Zhang et al (APT41)
 *   - ESET WeLiveSecurity: Lazarus, Turla, Fancy Bear research papers
 *   - Mandiant APT33 report (September 2017, public)
 *   - Microsoft DCU domain seizure court filings (APT28)
 *   - Kaspersky GReAT: Lazarus, Turla publications
 *   - US-CERT AA20-301A (Kimsuky)
 */

// ---------------------------------------------------------------------------
// Lazarus Group (Hidden Cobra) — North Korea / RGB
// CISA AA21-048A, AA22-108A, AA23-165A; ESET; Kaspersky GReAT
// ---------------------------------------------------------------------------

/** Known C2 and delivery domains used in Lazarus Group operations. */
export const LAZARUS_DOMAINS: string[] = [
  // TraderTraitor cryptocurrency exchange operations (CISA AA22-108A)
  'bloxholder.com',
  'hellobt.com',
  'nftartexhibit.org',
  'coinsworldtrade.com',
  'fattymoon.com',
  // AppleJeus fake crypto exchange campaign (CISA/FBI advisory)
  'btc-exchange.io',
  'coinslist.cc',
  'cointrade.cc',
  'ctb-trade.com',
  'jmttrading.org',
  'ifxbroker.org',
  'cryptonat.com',
  'joinpaycoin.com',
  // Operation Dream Job (ESET research — LinkedIn-themed lures)
  'dreamjobgroup.com',
  'careers-naver.com',
  'engineeringsoftware.io',
  // NFT / metaverse themed operations (2022-2023)
  'metastore.live',
  'nftsalesdrop.com',
  'nftdroplist.com',
  // Watering hole infrastructure
  'pagessinatra.com',
  'pagesinatra.com',
];

/** IP address prefixes associated with Lazarus Group hosting infrastructure. */
export const LAZARUS_IP_PREFIXES: string[] = [
  '185.62.190.',
  '103.102.196.',
  '194.147.78.',
  '45.33.2.',
];

// ---------------------------------------------------------------------------
// APT41 (Double Dragon / Winnti) — China / MSS
// DOJ 2020 Indictment; Mandiant; CrowdStrike
// ---------------------------------------------------------------------------

/** C2 and staging domains used by APT41 documented in public DOJ/vendor reports. */
export const APT41_DOMAINS: string[] = [
  // DOJ 2020 indictment US v. Zhang et al (public court document)
  'iqservicex.net',
  'veryfast.biz',
  'batchfiles.net',
  'outthink.co',
  'solarworldbus.com',
  // Mandiant/FireEye research papers
  'appleupdate.eu',
  'cdn-globalupdate.com',
  'fastly-cdn.com',
  'liveupdate360.com',
  'microsoftwinupdate.com',
];

/** IP prefixes associated with APT41 C2 infrastructure. */
export const APT41_IP_PREFIXES: string[] = ['121.127.', '43.255.191.', '149.28.'];

// ---------------------------------------------------------------------------
// Sandworm (APT44 / Voodoo Bear) — Russia / GRU Unit 74455
// CISA AA22-110A (Cyclops Blink); UK NCSC; CISA Industroyer2 advisory
// ---------------------------------------------------------------------------

/** IP prefixes of known Sandworm / Cyclops Blink C2 infrastructure (CISA AA22-110A). */
export const SANDWORM_IP_PREFIXES: string[] = [
  '91.109.182.',
  '196.240.60.',
  '185.82.202.',
  '45.146.164.',
  '212.192.246.',
  '62.233.57.',
];

/** Sandworm-associated domains documented in public advisories. */
export const SANDWORM_DOMAINS: string[] = [
  // Prestige ransomware staging (CISA/Microsoft)
  'filebin.net', // legitimate service abused by Sandworm for staging
  // NotPetya distribution domain (historical, documented in US indictment)
  'upd.1gb.ua',
  // Industroyer2 related infrastructure
  'update-srv.com',
  'noc-service.com',
];

// ---------------------------------------------------------------------------
// Turla (Snake / Uroburos / Waterbug) — Russia / FSB
// ESET research; CISA advisory; Kaspersky; JPCERT
// ---------------------------------------------------------------------------

/** C2 and watering hole domains documented in Turla research. */
export const TURLA_DOMAINS: string[] = [
  // ESET: "Turla group targets Linux" — Penguin Turla C2 infrastructure
  'linuxkernelorg.com',
  'hosterplace.com',
  'getservices.net',
  // Turla Carbon framework C2 (ESET research paper)
  'dnatrafficdata.com',
  'intemsrl.com',
  // Turla watering hole — mimics legitimate sites
  'verizonbusiness.org',
  'cisco-update.com',
  // HyperStack/Topinambour C2 (ESET 2020)
  'serviceswindows.com',
  'bigdataanalytics.co',
];

/** IP prefixes associated with Turla infrastructure. */
export const TURLA_IP_PREFIXES: string[] = ['62.12.39.', '185.86.151.', '212.109.220.'];

// ---------------------------------------------------------------------------
// APT28 (Fancy Bear / Sofacy) — Russia / GRU Unit 26165
// Microsoft DCU seizure orders; iSight Partners; CISA
// ---------------------------------------------------------------------------

/** Domains seized or documented by Microsoft DCU and public intelligence. */
export const APT28_DOMAINS: string[] = [
  // Microsoft DCU domain seizure court filings (public record)
  'microsoftofficeupdate.com',
  'microsoft-co.com',
  'microsoft-cdn.com',
  'secure-microsoft.com',
  // Credential phishing infrastructure
  'nl-dns.com',
  'secure-account.net',
  'rfc-compliance.org',
  'my-dropboxapp.com',
  'drive-google.com',
  // X-Agent / Sofacy C2 (public iSight Partners research)
  'accountsync.net',
  'linuxkrnl.net',
  'adobeflash.com.ua',
];

/** IP prefixes associated with APT28 attack infrastructure. */
export const APT28_IP_PREFIXES: string[] = ['185.220.101.', '95.141.38.', '176.31.112.'];

// ---------------------------------------------------------------------------
// APT33 (Elfin / Refined Kitten) — Iran / IRGC
// Mandiant APT33 public report (Sep 2017); Microsoft
// ---------------------------------------------------------------------------

/** C2 domains documented in Mandiant's public APT33 report. */
export const APT33_DOMAINS: string[] = [
  // Mandiant APT33 report (publicly released September 2017)
  'heritagehoteldc.com',
  'mystartscloud.com',
  'secure-share.net',
  'update-checker.com',
  // DROPSHOT dropper delivery domains (Mandiant/Symantec)
  'tasamimfarda.com',
  'nchcgroup.com',
  // TURNEDUP C2 infrastructure
  'automtoday.com',
  'ir.microsoft-update.net',
];

/** IP prefixes associated with APT33 infrastructure. */
export const APT33_IP_PREFIXES: string[] = ['107.191.60.', '192.95.20.'];

// ---------------------------------------------------------------------------
// Kimsuky (Thallium / Black Banshee) — North Korea / RGB
// US-CERT AA20-301A; KISA (Korean Internet Security Agency); Microsoft
// ---------------------------------------------------------------------------

/** C2 and phishing domains documented in Kimsuky public advisories. */
export const KIMSUKY_DOMAINS: string[] = [
  // US-CERT AA20-301A (Kimsuky advisory — public disclosure)
  'apple-security-update.net',
  'gov-services.net',
  'hanmail-verify.com',
  'naver-delivery.com',
  // Korea-themed phishing infrastructure (KISA/AhnLab reports)
  'koreaairmailservice.com',
  'hanmail-account.com',
  'safenaver.com',
  'naver-sec.com',
  // BabyShark/FlowerPower delivery (Palo Alto Unit 42)
  'msofficecorp.com',
  'kimsukygroup.com',
];

/** IP prefixes associated with Kimsuky infrastructure. */
export const KIMSUKY_IP_PREFIXES: string[] = ['185.29.8.', '45.33.32.'];
