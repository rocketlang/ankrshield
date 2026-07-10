package com.ankr.shield;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;
import android.util.Log;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ScopeLedger — on-device scope-transparency ledger (ASCT-T2.1).
 *
 * Aggregated rollups only (app × domain), never a raw query log:
 *   scope_rollup(app, domain, category, vendor, risk, blocked, allowed, first_ts, last_ts)
 *
 * Privacy floor (ASCT-004): this file lives in the app's private dir, never
 * leaves the phone, is user-wipeable, and self-purges rows older than 30 days.
 *
 * Write path: the VPN packet thread calls record() which only touches an
 * in-memory map (cheap); a flusher thread persists batches every FLUSH_MS.
 * Reads flush first, so the UI always sees current counts.
 *
 * Compatibility notes (minSdk 23): no ConcurrentHashMap.computeIfAbsent
 * (API 24), no String.join (API 26), no SQLite UPSERT (needs 3.24 =
 * Android 11) — hence putIfAbsent, StringBuilder, and UPDATE-then-INSERT.
 */
final class ScopeLedger {

    private static final String TAG       = "ScopeLedger";
    private static final String DB_NAME   = "scope-ledger.sqlite";
    private static final long   FLUSH_MS  = 15_000;
    private static final long   RETAIN_MS = 30L * 24 * 3600 * 1000; // 30 days

    /** Tracker-db categories that mean "beyond minimum required scope" (ASCT-002). */
    static final Set<String> BEYOND_SCOPE_CATEGORIES = new HashSet<>(
        Arrays.asList("advertising", "analytics", "fingerprinting",
                      "data_broker", "social", "stalkerware", "apt", "sdk"));

    private static final class Pending {
        String category = "clean";
        String vendor   = "";
        int    risk     = 0;
        long   blocked  = 0;
        long   allowed  = 0;
        long   bg       = 0;   // beyond-scope contacts made while the screen was OFF (caught-in-act)
        long   firstTs  = 0;
        long   lastTs   = 0;
    }

    private SQLiteDatabase db;
    private final ConcurrentHashMap<String, Pending> pending = new ConcurrentHashMap<>();
    private Thread flusher;
    private volatile boolean open = false;

    void open(Context ctx) {
        try {
            File f = new File(ctx.getFilesDir(), DB_NAME);
            db = SQLiteDatabase.openOrCreateDatabase(f, null);
            db.execSQL("CREATE TABLE IF NOT EXISTS scope_rollup (" +
                       "app TEXT NOT NULL, domain TEXT NOT NULL," +
                       "category TEXT NOT NULL, vendor TEXT NOT NULL, risk INTEGER NOT NULL," +
                       "blocked INTEGER NOT NULL, allowed INTEGER NOT NULL," +
                       "first_ts INTEGER NOT NULL, last_ts INTEGER NOT NULL," +
                       "PRIMARY KEY (app, domain))");
            // Additive migration for the caught-in-act witness (older installs lack this column).
            // ALTER throws "duplicate column" on second run — that is the success path, so swallow it.
            try { db.execSQL("ALTER TABLE scope_rollup ADD COLUMN bg_hits INTEGER NOT NULL DEFAULT 0"); }
            catch (Exception ignored) { /* column already present */ }
            db.execSQL("DELETE FROM scope_rollup WHERE last_ts < " +
                       (System.currentTimeMillis() - RETAIN_MS));
            open = true;

            flusher = new Thread(() -> {
                while (open) {
                    try { Thread.sleep(FLUSH_MS); } catch (InterruptedException e) { break; }
                    flush();
                }
            }, "ankr-scope-flusher");
            flusher.setDaemon(true);
            flusher.start();
            Log.i(TAG, "scope ledger open: " + f.length() + " bytes");
        } catch (Exception e) {
            open = false;
            Log.w(TAG, "ledger open failed (witness continues without ledger): " + e.getMessage());
        }
    }

    /** Called from the packet loop — in-memory only, no I/O. */
    void record(String app, String domain, String category, String vendor, int risk, boolean blocked) {
        record(app, domain, category, vendor, risk, blocked, false);
    }

    /**
     * Background-aware record (caught-in-act witness). When {@code background} is true
     * AND the contact is beyond-scope (a real tracker category), it counts as a
     * "caught in the act" hit — an app phoning a tracker while the screen was OFF.
     * Foreground contacts and clean/quarantined events never increment bg.
     */
    void record(String app, String domain, String category, String vendor, int risk,
                boolean blocked, boolean background) {
        if (!open) return;
        String key = (app == null ? "" : app) + " " + domain;
        Pending p = pending.get(key);
        if (p == null) {
            Pending fresh = new Pending();
            p = pending.putIfAbsent(key, fresh);
            if (p == null) p = fresh;
        }
        long now = System.currentTimeMillis();
        synchronized (p) {
            if (p.firstTs == 0) p.firstTs = now;
            p.lastTs = now;
            if (blocked) p.blocked++; else p.allowed++;
            if (category != null && !category.isEmpty() && !"clean".equals(category)) {
                p.category = category;
            }
            if (vendor != null && !vendor.isEmpty()) p.vendor = vendor;
            if (risk > p.risk) p.risk = risk;
            if (background && category != null && BEYOND_SCOPE_CATEGORIES.contains(category)) {
                p.bg++;
            }
        }
    }

    synchronized void flush() {
        if (!open || pending.isEmpty()) return;
        Map<String, Pending> batch = new HashMap<>(pending);
        for (String k : batch.keySet()) pending.remove(k);
        try {
            db.beginTransaction();
            SQLiteStatement up = db.compileStatement(
                "UPDATE scope_rollup SET " +
                "blocked=blocked+?, allowed=allowed+?, bg_hits=bg_hits+?, " +
                "category=CASE WHEN ?!='clean' THEN ? ELSE category END, " +
                "vendor=CASE WHEN ?!='' THEN ? ELSE vendor END, " +
                "risk=MAX(risk,?), last_ts=? " +
                "WHERE app=? AND domain=?");
            SQLiteStatement ins = db.compileStatement(
                "INSERT INTO scope_rollup (app,domain,category,vendor,risk,blocked,allowed,bg_hits,first_ts,last_ts) " +
                "VALUES (?,?,?,?,?,?,?,?,?,?)");
            for (Map.Entry<String, Pending> e : batch.entrySet()) {
                String[] parts = e.getKey().split(" ", 2);
                String app    = parts[0];
                String domain = parts.length > 1 ? parts[1] : "";
                Pending p = e.getValue();
                synchronized (p) {
                    up.clearBindings();
                    up.bindLong(1, p.blocked);
                    up.bindLong(2, p.allowed);
                    up.bindLong(3, p.bg);
                    up.bindString(4, p.category);
                    up.bindString(5, p.category);
                    up.bindString(6, p.vendor);
                    up.bindString(7, p.vendor);
                    up.bindLong(8, p.risk);
                    up.bindLong(9, p.lastTs);
                    up.bindString(10, app);
                    up.bindString(11, domain);
                    if (up.executeUpdateDelete() == 0) {
                        ins.clearBindings();
                        ins.bindString(1, app);
                        ins.bindString(2, domain);
                        ins.bindString(3, p.category);
                        ins.bindString(4, p.vendor);
                        ins.bindLong(5, p.risk);
                        ins.bindLong(6, p.blocked);
                        ins.bindLong(7, p.allowed);
                        ins.bindLong(8, p.bg);
                        ins.bindLong(9, p.firstTs);
                        ins.bindLong(10, p.lastTs);
                        ins.executeInsert();
                    }
                }
            }
            db.setTransactionSuccessful();
        } catch (Exception e) {
            Log.w(TAG, "flush failed: " + e.getMessage());
        } finally {
            try { db.endTransaction(); } catch (Exception ignored) {}
        }
    }

    /** Per-app aggregates for the verdict layer. Flushes first — reads are current. */
    List<Map<String, Object>> summary() {
        if (!open) return new ArrayList<>();
        flush();
        return querySummary(db);
    }

    /** Domain-level receipts for one app — the citations behind a verdict. */
    List<Map<String, Object>> detail(String app) {
        if (!open) return new ArrayList<>();
        flush();
        return queryDetail(db, app);
    }

    /** Read-only access for the UI when the VPN service is not running. */
    static List<Map<String, Object>> readSummary(Context ctx) {
        SQLiteDatabase ro = openReadOnly(ctx);
        if (ro == null) return new ArrayList<>();
        try { return querySummary(ro); } finally { ro.close(); }
    }

    static List<Map<String, Object>> readDetail(Context ctx, String app) {
        SQLiteDatabase ro = openReadOnly(ctx);
        if (ro == null) return new ArrayList<>();
        try { return queryDetail(ro, app); } finally { ro.close(); }
    }

    /** Caught-in-act: apps that contacted a tracker while the screen was OFF. Flushes first. */
    List<Map<String, Object>> caughtInAct() {
        if (!open) return new ArrayList<>();
        flush();
        return queryCaught(db);
    }

    /** Read-only caught-in-act for the UI when the VPN service is not running. */
    static List<Map<String, Object>> readCaughtInAct(Context ctx) {
        SQLiteDatabase ro = openReadOnly(ctx);
        if (ro == null) return new ArrayList<>();
        try { return queryCaught(ro); } finally { ro.close(); }
    }

    private static SQLiteDatabase openReadOnly(Context ctx) {
        try {
            File f = new File(ctx.getFilesDir(), DB_NAME);
            if (!f.exists()) return null;
            return SQLiteDatabase.openDatabase(f.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
        } catch (Exception e) {
            return null;
        }
    }

    private static List<Map<String, Object>> querySummary(SQLiteDatabase db) {
        List<Map<String, Object>> out = new ArrayList<>();
        String beyond = beyondScopeSqlList();
        try (Cursor c = db.rawQuery(
                "SELECT app, " +
                "SUM(blocked+allowed) AS contacts, " +
                "SUM(CASE WHEN category IN (" + beyond + ") THEN blocked+allowed ELSE 0 END) AS beyond, " +
                "SUM(CASE WHEN category IN (" + beyond + ") THEN blocked ELSE 0 END) AS beyond_blocked, " +
                "COUNT(DISTINCT CASE WHEN vendor!='' THEN vendor END) AS vendors, " +
                "MAX(risk) AS max_risk, MIN(first_ts) AS first_ts, MAX(last_ts) AS last_ts, " +
                "COUNT(DISTINCT domain) AS domains " +  // = number of receipt rows for this app
                "FROM scope_rollup GROUP BY app ORDER BY beyond DESC", null)) {
            while (c.moveToNext()) {
                Map<String, Object> row = new HashMap<>();
                row.put("app",           c.getString(0));
                row.put("contacts",      c.getLong(1));
                row.put("beyondScope",   c.getLong(2));
                row.put("beyondBlocked", c.getLong(3));
                row.put("vendorCount",   c.getLong(4));
                row.put("maxRisk",       c.getLong(5));
                row.put("firstTs",       c.getLong(6));
                row.put("lastTs",        c.getLong(7));
                row.put("receiptCount",  c.getLong(8));
                out.add(row);
            }
        } catch (Exception e) {
            Log.w(TAG, "summary failed: " + e.getMessage());
        }
        return out;
    }

    private static List<Map<String, Object>> queryDetail(SQLiteDatabase db, String app) {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Cursor c = db.rawQuery(
                "SELECT domain, category, vendor, risk, blocked, allowed, first_ts, last_ts " +
                "FROM scope_rollup WHERE app = ? ORDER BY (blocked+allowed) DESC LIMIT 500",
                new String[]{ app == null ? "" : app })) {
            while (c.moveToNext()) {
                Map<String, Object> row = new HashMap<>();
                row.put("domain",   c.getString(0));
                row.put("category", c.getString(1));
                row.put("vendor",   c.getString(2));
                row.put("risk",     c.getLong(3));
                row.put("blocked",  c.getLong(4));
                row.put("allowed",  c.getLong(5));
                row.put("firstTs",  c.getLong(6));
                row.put("lastTs",   c.getLong(7));
                out.add(row);
            }
        } catch (Exception e) {
            Log.w(TAG, "detail failed: " + e.getMessage());
        }
        return out;
    }

    private static List<Map<String, Object>> queryCaught(SQLiteDatabase db) {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Cursor c = db.rawQuery(
                "SELECT app, " +
                "SUM(bg_hits) AS bg, " +                                   // background tracker contacts
                "COUNT(DISTINCT CASE WHEN vendor!='' THEN vendor END) AS vendors, " +
                "COUNT(DISTINCT domain) AS domains, " +                    // distinct tracker endpoints (receipts)
                "MAX(risk) AS max_risk, MAX(last_ts) AS last_ts " +
                "FROM scope_rollup WHERE bg_hits > 0 GROUP BY app " +
                "ORDER BY bg DESC", null)) {
            while (c.moveToNext()) {
                Map<String, Object> row = new HashMap<>();
                row.put("app",          c.getString(0));
                row.put("bgHits",       c.getLong(1));
                row.put("vendorCount",  c.getLong(2));
                row.put("receiptCount", c.getLong(3));
                row.put("maxRisk",      c.getLong(4));
                row.put("lastTs",       c.getLong(5));
                out.add(row);
            }
        } catch (Exception e) {
            Log.w(TAG, "caught summary failed: " + e.getMessage());
        }
        return out;
    }

    private static String beyondScopeSqlList() {
        StringBuilder sb = new StringBuilder();
        for (String cat : BEYOND_SCOPE_CATEGORIES) {
            if (sb.length() > 0) sb.append("','");
            sb.append(cat);
        }
        return "'" + sb + "'";
    }

    void clear() {
        if (!open) return;
        pending.clear();
        try { db.execSQL("DELETE FROM scope_rollup"); } catch (Exception ignored) {}
    }

    /** Wipe when the VPN service is not running — delete the file outright. */
    static void deleteFile(Context ctx) {
        try {
            File f = new File(ctx.getFilesDir(), DB_NAME);
            if (f.exists()) SQLiteDatabase.deleteDatabase(f);
        } catch (Exception ignored) {}
    }

    void close() {
        open = false;
        if (flusher != null) { flusher.interrupt(); flusher = null; }
        try { flush(); } catch (Exception ignored) {}
        try { if (db != null) db.close(); } catch (Exception ignored) {}
        db = null;
    }
}
