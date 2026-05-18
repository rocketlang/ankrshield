package com.ankr.shield;

import android.net.Uri;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;

/**
 * UpiGuardModule — validates UPI payment URIs and detects fraud patterns.
 *
 * UPI URI format: upi://pay?pa=VPA&pn=Name&am=Amount&cu=INR&tn=Note&mc=MCC
 *
 * JS API:
 *   NativeModules.UpiGuard.analyzeUri(uriString)  → Promise<UpiAnalysis>
 *   NativeModules.UpiGuard.getCheckHistory()       → Promise<UpiCheckEntry[]>
 *   NativeModules.UpiGuard.clearHistory()          → Promise<boolean>
 *
 * UpiAnalysis: {
 *   vpa, payeeName, amount, currency, note,
 *   riskLevel: 'safe' | 'caution' | 'high' | 'critical',
 *   flags: string[],   // detected risk signals
 *   knownHandle: boolean,
 * }
 */
public class UpiGuardModule extends ReactContextBaseJavaModule {

    // Legitimate UPI handles (PSP handles assigned by NPCI)
    private static final Set<String> KNOWN_HANDLES = new HashSet<>(Arrays.asList(
        "paytm", "axl", "okhdfcbank", "okhdfc", "oksbi", "okaxis",
        "ybl", "ibl", "upi", "naviaxis", "kotak", "barodampay",
        "rbl", "jiomoney", "apl", "freecharge", "indus", "airtel",
        "pockets", "rapl", "waaxis", "sliceaxis", "timecosmos",
        "hdfcbank", "sbi", "icici", "axis", "pnb", "uco", "bob",
        "cnrb", "ucobank", "centralbank", "indianbank", "iob",
        "idbi", "kvb", "jsb", "lici", "mahb", "scb",
        "superyes", "yesbankltd", "pingpay", "mbk", "dl"
    ));

    // VPA pattern: localpart@handle (both parts required)
    private static final Pattern VPA_PATTERN =
        Pattern.compile("^[a-zA-Z0-9._\\-+]+@[a-zA-Z]+$");

    // Suspicious VPA patterns (all-numeric before @, random hex, etc.)
    private static final Pattern SUSPICIOUS_VPA_PREFIX =
        Pattern.compile("^[0-9a-f]{8,}@");   // looks like a random hex prefix

    // Large amount threshold (₹ — flag amounts > 1 lakh for individual transfers)
    private static final double HIGH_AMOUNT_INR = 100_000.0;
    private static final double EXTREME_AMOUNT_INR = 500_000.0;

    // Check history (ring buffer, last 50)
    public static final List<WritableMap> checkHistory = new CopyOnWriteArrayList<>();

    // A12 — SIM swap UPI block: set to true by SimSwapModule for 10 min after swap detection
    private static volatile boolean simSwapBlockActive = false;

    public static void setSimSwapBlock(boolean active) {
        simSwapBlockActive = active;
    }

    public static boolean isSimSwapBlockActive() {
        return simSwapBlockActive;
    }

    public UpiGuardModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);
    }

    @NonNull
    @Override
    public String getName() { return "UpiGuard"; }

    @ReactMethod
    public void analyzeUri(String uriString, Promise promise) {
        try {
            WritableMap result = Arguments.createMap();
            WritableArray flags = Arguments.createArray();

            // A12 — SIM swap block: reject all UPI transactions for 10 min post-swap
            if (simSwapBlockActive) {
                flags.pushString("SIM swap detected — UPI blocked for 10 min as a safety measure");
                result.putString("riskLevel", "critical");
                result.putBoolean("simSwapBlock", true);
                result.putArray("flags", flags);
                result.putString("vpa", "");
                result.putString("payeeName", "");
                result.putString("amount", "");
                result.putBoolean("isUpiUri", false);
                promise.resolve(result);
                return;
            }

            // ── Parse URI ────────────────────────────────────────────────────
            String vpa      = "";
            String payeeName = "";
            String amount   = "";
            String currency = "INR";
            String note     = "";
            String mc       = "";  // merchant category code

            // Handle both upi:// and https:// UPI deep links
            String normalised = uriString.trim();
            if (normalised.startsWith("https://") || normalised.startsWith("http://")) {
                // Some apps use https://upi.handle.app/pay?... — strip to query params
                // or just treat the whole thing as a link (not a UPI URI)
                result.putBoolean("isUpiUri", false);
                result.putString("riskLevel", "caution");
                flags.pushString("Not a standard upi:// URI — verify manually");
                result.putArray("flags", flags);
                result.putString("vpa", "");
                result.putString("payeeName", "");
                result.putString("amount", "");
                result.putString("currency", "INR");
                result.putString("note", "");
                result.putBoolean("knownHandle", false);
                promise.resolve(result);
                return;
            }

            if (!normalised.startsWith("upi://")) {
                normalised = "upi://" + normalised.replaceFirst("^upi:", "");
            }

            try {
                Uri uri = Uri.parse(normalised);
                vpa       = nullToEmpty(uri.getQueryParameter("pa"));
                payeeName = nullToEmpty(uri.getQueryParameter("pn"));
                amount    = nullToEmpty(uri.getQueryParameter("am"));
                currency  = nullToEmpty(uri.getQueryParameter("cu"));
                note      = nullToEmpty(uri.getQueryParameter("tn"));
                mc        = nullToEmpty(uri.getQueryParameter("mc"));
                if (currency.isEmpty()) currency = "INR";
            } catch (Exception e) {
                flags.pushString("Could not parse UPI URI — may be malformed");
            }

            result.putBoolean("isUpiUri", true);
            result.putString("vpa", vpa);
            result.putString("payeeName", payeeName);
            result.putString("amount", amount);
            result.putString("currency", currency);
            result.putString("note", note);

            // ── VPA validation ───────────────────────────────────────────────
            boolean knownHandle = false;
            if (vpa.isEmpty()) {
                flags.pushString("No payee VPA (pa=) in URI — payment destination missing");
            } else if (!VPA_PATTERN.matcher(vpa).matches()) {
                flags.pushString("VPA format invalid: '" + vpa + "' — does not match expected format");
            } else {
                String handle = vpa.substring(vpa.indexOf('@') + 1).toLowerCase();
                knownHandle = KNOWN_HANDLES.contains(handle);
                if (!knownHandle) {
                    flags.pushString("Unknown UPI handle: @" + handle + " — not a registered PSP");
                }
                if (SUSPICIOUS_VPA_PREFIX.matcher(vpa.toLowerCase()).find()) {
                    flags.pushString("VPA prefix looks randomly generated — possible fraud VPA");
                }
                // Impersonation check: VPA that LOOKS like a bank but is on wrong handle
                String vpaLower = vpa.toLowerCase();
                if ((vpaLower.contains("sbi") || vpaLower.contains("hdfc") ||
                     vpaLower.contains("icici") || vpaLower.contains("paytm") ||
                     vpaLower.contains("phonepe") || vpaLower.contains("gpay")) &&
                    !knownHandle) {
                    flags.pushString("VPA mentions a bank/wallet name on an unofficial handle — possible impersonation");
                }
            }
            result.putBoolean("knownHandle", knownHandle);

            // ── Amount validation ────────────────────────────────────────────
            if (!amount.isEmpty()) {
                try {
                    double amt = Double.parseDouble(amount);
                    if (amt == 0.0) {
                        flags.pushString("Amount is ₹0 — possibly a verification scam or QR test");
                    } else if (amt > EXTREME_AMOUNT_INR) {
                        flags.pushString(String.format(
                            "Extremely large amount: ₹%.0f — verify carefully before paying", amt));
                    } else if (amt > HIGH_AMOUNT_INR) {
                        flags.pushString(String.format(
                            "Large amount: ₹%.0f — confirm payee identity before proceeding", amt));
                    }
                } catch (NumberFormatException ignored) {
                    flags.pushString("Amount is not a valid number: '" + amount + "'");
                }
            }

            // ── Merchant code check ──────────────────────────────────────────
            // mc=0000 or unusual codes on personal VPAs are suspicious
            if (!mc.isEmpty() && !vpa.isEmpty()) {
                if (mc.equals("0000") || mc.equals("9999")) {
                    flags.pushString("Suspicious merchant code (mc=" + mc + ") for a personal VPA");
                }
            }

            // ── Note field check ─────────────────────────────────────────────
            if (!note.isEmpty()) {
                String noteLower = note.toLowerCase();
                if (noteLower.contains("kyc") || noteLower.contains("verify") ||
                    noteLower.contains("refund") || noteLower.contains("cashback") ||
                    noteLower.contains("prize") || noteLower.contains("lottery") ||
                    noteLower.contains("reward") || noteLower.contains("winnings")) {
                    flags.pushString("Transaction note '" + note + "' matches common scam scripts");
                }
            }

            // ── Non-INR currency ─────────────────────────────────────────────
            if (!currency.isEmpty() && !currency.equalsIgnoreCase("INR")) {
                flags.pushString("Non-INR currency (" + currency + ") — UPI only supports INR");
            }

            // ── Risk scoring ─────────────────────────────────────────────────
            int flagCount = flags.size();
            boolean hasCritical = checkForCritical(flags);
            String riskLevel = hasCritical || flagCount >= 3 ? "critical"
                             : flagCount == 2               ? "high"
                             : flagCount == 1               ? "caution"
                             : "safe";
            result.putString("riskLevel", riskLevel);
            result.putArray("flags", flags);

            // ── History ──────────────────────────────────────────────────────
            WritableMap historyEntry = Arguments.createMap();
            historyEntry.putString("vpa", vpa);
            historyEntry.putString("payeeName", payeeName);
            historyEntry.putString("amount", amount);
            historyEntry.putString("riskLevel", riskLevel);
            historyEntry.putDouble("ts", System.currentTimeMillis());
            checkHistory.add(0, historyEntry);
            if (checkHistory.size() > 50) checkHistory.remove(checkHistory.size() - 1);

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("UPI_ANALYZE_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getCheckHistory(Promise promise) {
        WritableArray arr = Arguments.createArray();
        for (WritableMap entry : checkHistory) arr.pushMap(entry);
        promise.resolve(arr);
    }

    @ReactMethod
    public void clearHistory(Promise promise) {
        checkHistory.clear();
        promise.resolve(true);
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static boolean checkForCritical(WritableArray flags) {
        // A flag is "critical" if it mentions impersonation, VPA format invalid, or missing VPA
        for (int i = 0; i < flags.size(); i++) {
            String f = flags.getString(i).toLowerCase();
            if (f.contains("impersonation") || f.contains("format invalid") ||
                f.contains("missing") || f.contains("fraud vpa")) {
                return true;
            }
        }
        return false;
    }
}
