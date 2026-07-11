package com.ankr.shield;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Allowlist — domains that must NEVER be NXDOMAIN'd, even if the tracker DB flags
 * them. Two layers:
 *
 *   CURATED  — first-party domains of essential services (AI assistants) and the
 *              auth providers their login flows depend on. These are functional,
 *              not tracking; blocking them breaks the app (why Claude / ChatGPT /
 *              Perplexity appeared to "have no internet" under the shield).
 *   USER     — domains the user tapped "always allow" on from the Live DNS feed
 *              (persisted in ShieldPrefs, so a fix survives app upgrades).
 *
 * Matching is suffix-based: an entry "anthropic.com" allows "anthropic.com" and
 * any "*.anthropic.com" subdomain, but never a lookalike like "notanthropic.com".
 *
 * IMPORTANT: this is a FUNCTIONAL allowlist, not a blanket tracker bypass. We do
 * NOT list shared analytics/ad CDNs here — those stay blockable. We only protect a
 * service's own domains + auth, so tracker blocking elsewhere is unaffected.
 */
final class Allowlist {

    private Allowlist() {}

    /** First-party essential domains — never blocked. Suffix match. */
    static final Set<String> CURATED = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        // ── AI assistants (first-party app + CDN domains) ──
        "anthropic.com",            // Claude API
        "claude.ai",                // Claude web/app
        "claudeusercontent.com",    // Claude uploaded-content CDN
        "openai.com",               // OpenAI API/auth
        "chatgpt.com",              // ChatGPT web/app
        "oaistatic.com",            // ChatGPT static assets
        "oaiusercontent.com",       // ChatGPT user content
        "sora.com",
        "perplexity.ai",            // Perplexity
        "pplx.ai",
        "gemini.google.com",        // Google Gemini
        "aistudio.google.com",
        "makersuite.google.com",
        "generativelanguage.googleapis.com",
        "copilot.microsoft.com",    // Microsoft Copilot
        "mistral.ai",
        "chat.mistral.ai",
        "grok.com",
        "x.ai",
        "poe.com",
        // ── Auth providers — a blocked login endpoint = "can't sign in" ──
        "auth0.com",                // ChatGPT and many apps sign in via Auth0
        "okta.com",
        "oktacdn.com",
        "accounts.google.com",
        "login.microsoftonline.com",
        "appleid.apple.com",
        "cloudflareaccess.com"
    )));

    /**
     * True when `domain` equals or is a subdomain of any suffix in `suffixes`.
     * Case-insensitive; a leading dot on the query is tolerated.
     */
    static boolean suffixMatch(String domain, Set<String> suffixes) {
        if (domain == null || domain.isEmpty() || suffixes.isEmpty()) return false;
        String d = domain.toLowerCase();
        if (d.endsWith(".")) d = d.substring(0, d.length() - 1);
        for (String suffix : suffixes) {
            if (suffix == null || suffix.isEmpty()) continue;
            String s = suffix.toLowerCase();
            if (d.equals(s) || d.endsWith("." + s)) return true;
        }
        return false;
    }

    /** True when the domain is on the built-in essential (curated) allowlist. */
    static boolean isCurated(String domain) {
        return suffixMatch(domain, CURATED);
    }
}
