package com.ankr.shield;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * FinancialApps — curated India banking / UPI / payment packages (ASCT-T2.4).
 *
 * Intelligent mode auto-excludes these from DNS interception so they play
 * normal (banking apps self-disable when they detect a VPN). Only apps
 * actually installed are seeded. Wrong/renamed package names are harmless —
 * they simply never intersect with the installed list.
 *
 * The witness stays honest: a bypassed app is UNWITNESSED, never "safe"
 * (ASCT-003) — the report card must say "excluded — not observed".
 */
final class FinancialApps {

    private FinancialApps() {}

    static final Set<String> CURATED = new HashSet<>(Arrays.asList(
        // UPI / wallets
        "com.phonepe.app",
        "com.google.android.apps.nbu.paisa.user",   // Google Pay
        "net.one97.paytm",
        "in.org.npci.upiapp",                       // BHIM
        "com.dreamplug.androidapp",                 // CRED
        "com.mobikwik_new",
        "com.freecharge.android",
        "in.amazon.mShop.android.shopping",         // Amazon (Pay)
        // Banks
        "com.sbi.lotusintouch",                     // YONO SBI
        "com.sbi.SBAnywhere",                       // SBI Anywhere
        "com.snapwork.hdfc",                        // HDFC MobileBanking
        "net.hdfcbank.hdfcmobilenetbanking",
        "com.csam.icici.bank.imobile",              // ICICI iMobile
        "com.icicibank.pockets",
        "com.axis.mobile",
        "com.bhim.axisbank",
        "com.kotak.mahindra.kotak811",
        "com.msf.kbank.mobile",                     // Kotak
        "com.bankofbaroda.mconnect",
        "com.infrasofttech.CentralBank",
        "com.canarabank.mobility",
        "com.fss.pnbpsp",                           // PNB
        "com.pnb.one",
        "com.idfcfirstbank.optimus",
        "com.YesBank",
        "com.indusind.indusmobile",
        "src.com.idbi",                             // IDBI Go
        "com.fedmobile",                            // Federal Bank
        // Government identity/finance
        "in.gov.uidai.mAadhaar"
    ));

    // Terminal / developer apps: connectivity-critical and prone to breaking
    // under DNS interception (custom resolvers, TCP DNS). Auto-bypassed in
    // Intelligent mode so a developer's shell (e.g. Claude Code in Termux)
    // never loses the network. The fail-open DNS path protects everyone else.
    static final Set<String> DEV_TOOLS = new HashSet<>(Arrays.asList(
        "com.termux",
        "com.termux.api",
        "com.termux.boot",
        "com.server.auditor.ssh.client",  // Termius
        "org.connectbot",
        "com.google.android.apps.cloudconsole"
    ));

    /** Curated (banking ∪ dev-tools) ∩ installed — the Intelligent-mode auto-bypass seed. */
    static Set<String> installedFinancial(Context ctx) {
        Set<String> found = new HashSet<>();
        try {
            PackageManager pm = ctx.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(0);
            for (ApplicationInfo app : apps) {
                if (CURATED.contains(app.packageName) || DEV_TOOLS.contains(app.packageName)) {
                    found.add(app.packageName);
                }
            }
        } catch (Exception ignored) {}
        return found;
    }
}
