package com.ankr.shield;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.AsyncTask;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * ThreatReporter — records threat actions locally and reports them to the AnkrShield
 * backend for global threat intelligence.
 *
 * Flow:
 *   1. Threat detected → scanHistory already has it in WhatsAppGuardService
 *   2. User or auto-action taken (delete / flag) → recordAction() called
 *   3. Action stored in SharedPreferences (survives app kill)
 *   4. reportToServer() called async — sends to /api/threats/report
 *   5. Server aggregates: if multiple devices see same hash/pattern → global block list updated
 *
 * Privacy: file contents are never sent. Only metadata:
 *   { fileName, verdict, reason, actionTaken, ts, appVersion, deviceRegion }
 */
public class ThreatReporter {

    private static final String TAG = "ThreatReporter";
    private static final String PREFS = "ankr_threats";
    private static final String KEY_LOG = "threat_log";
    private static final int MAX_LOCAL = 500;
    private static final String SERVER = "https://api.xshieldai.com/api/threats/report";

    public static final String ACTION_DELETED  = "deleted";
    public static final String ACTION_KEPT     = "kept";
    public static final String ACTION_FLAGGED  = "flagged";

    /** Record a threat action locally, then fire-and-forget to server. */
    public static void record(Context ctx, WhatsAppGuardService.ScanEntry entry,
                              String actionTaken) {
        try {
            JSONObject event = new JSONObject();
            event.put("fileName", entry.fileName);
            event.put("verdict", entry.verdict);
            event.put("reason", entry.reason);
            event.put("actionTaken", actionTaken);
            event.put("fileSizeBytes", entry.fileSizeBytes);
            event.put("ts", entry.ts);

            // Persist locally
            appendLocal(ctx, event);

            // Async report to server
            reportAsync(event);

        } catch (Exception e) {
            Log.e(TAG, "record error", e);
        }
    }

    /** Overload for impersonation alerts. */
    public static void recordImpersonation(Context ctx,
                                           AnkrShieldAccessibilityService.ImpersonationAlert alert,
                                           String actionTaken) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "impersonation");
            event.put("suspectName", alert.suspectName);
            event.put("similarTo", alert.similarTo);
            event.put("similarityPct", alert.similarityPct);
            event.put("actionTaken", actionTaken);
            event.put("ts", alert.ts);

            appendLocal(ctx, event);
            reportAsync(event);
        } catch (Exception e) {
            Log.e(TAG, "recordImpersonation error", e);
        }
    }

    /** Returns all locally stored threat events as a JSONArray string. */
    public static String getLocalLog(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getString(KEY_LOG, "[]");
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private static void appendLocal(Context ctx, JSONObject event) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(prefs.getString(KEY_LOG, "[]"));
            arr.put(event);
            // Cap at MAX_LOCAL — drop oldest entries
            while (arr.length() > MAX_LOCAL) arr.remove(0);
            prefs.edit().putString(KEY_LOG, arr.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "appendLocal error", e);
        }
    }

    @SuppressWarnings("deprecation")
    private static void reportAsync(JSONObject event) {
        AsyncTask.execute(() -> {
            try {
                URL url = new URL(SERVER);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("X-Client", "ankrshield-android");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);

                byte[] body = event.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                }

                int code = conn.getResponseCode();
                Log.i(TAG, "Threat reported → HTTP " + code);
                conn.disconnect();
            } catch (Exception e) {
                // Network unavailable — entry is already saved locally, will retry next session
                Log.w(TAG, "Report failed (will retry): " + e.getMessage());
            }
        });
    }
}
