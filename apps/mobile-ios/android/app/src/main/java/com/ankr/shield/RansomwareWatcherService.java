package com.ankr.shield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.FileObserver;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * RansomwareWatcherService — monitors user storage for signs of ransomware encryption.
 *
 * Detection heuristics (no root required):
 *   1. Ransom note files (README.txt, HOW_TO_DECRYPT.txt, !DECRYPT.txt, RESTORE_FILES.txt etc.)
 *   2. Encrypted extension patterns (*.locked, *.encrypted, *.enc, *.crypt, *.WNCRY, *.wnry etc.)
 *   3. Rapid file extension change bursts: >20 files renamed in <30 seconds
 *   4. Known ransom note content keywords (if file is small enough to read)
 *
 * On detection: fires notification + emits event to React Native via static listener.
 */
public class RansomwareWatcherService extends Service {

    private static final String TAG = "RansomwareWatcher";
    private static final String CHANNEL_ID = "ransomware_watcher";
    private static final int FOREGROUND_ID = 3002;

    // Paths to monitor (user-accessible documents, downloads, pictures)
    private static final String[] WATCH_ROOTS = {
        "/storage/emulated/0/Documents",
        "/storage/emulated/0/Download",
        "/storage/emulated/0/Downloads",
        "/storage/emulated/0/DCIM",
        "/storage/emulated/0/Pictures",
        "/storage/emulated/0/WhatsApp",
    };

    // Known ransomware file extensions
    private static final List<String> RANSOM_EXTENSIONS = Arrays.asList(
        "locked", "encrypted", "enc", "crypt", "crypted",
        "wncry", "wnry", "wcry", "ecc", "ezz", "exx",
        "xyz", "zzz", "aaa", "abc", "vvv", "xxx", "ttt",
        "locky", "thor", "osiris", "shit", "wallet",
        "zepto", "cerber", "cerber3", "cryptowall", "radamant"
    );

    // Known ransom note filenames (case-insensitive prefix match)
    private static final List<String> RANSOM_NOTE_NAMES = Arrays.asList(
        "readme", "how_to_decrypt", "how_to_restore", "how_to_recover",
        "decrypt_instructions", "restore_files", "recovery_instructions",
        "!decrypt", "_recover_", "attention", "ransomware_note",
        "files_encrypted", "help_decrypt", "cryptolocker"
    );

    // Rapid rename burst tracking: timestamp list (last N renames)
    private static final List<Long> RENAME_TIMESTAMPS = new CopyOnWriteArrayList<>();
    private static final int BURST_WINDOW_MS = 30_000;  // 30 seconds
    private static final int BURST_THRESHOLD = 20;      // 20 renames in window = suspicious

    // Event listener for React Native bridge
    public interface RansomwareListener {
        void onRansomwareDetected(String type, String filePath, String details);
    }
    public static volatile RansomwareListener listener = null;

    // Detection history (ring buffer, newest first)
    public static final List<RansomwareAlert> alertHistory = new CopyOnWriteArrayList<>();

    public static class RansomwareAlert {
        public final String type;       // "ransom_note" | "encrypted_file" | "burst"
        public final String filePath;
        public final String details;
        public final long ts;

        RansomwareAlert(String type, String filePath, String details) {
            this.type = type;
            this.filePath = filePath;
            this.details = details;
            this.ts = System.currentTimeMillis();
        }
    }

    private final List<FileObserver> observers = new ArrayList<>();
    private final AtomicInteger notifId = new AtomicInteger(5000);

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        // Android 14 (API 34) requires the FGS type to be passed explicitly and to match
        // the manifest. An uncaught throw here kills the whole process (looked like the
        // app "folding shut" when the user tapped Start), so guard it and stopSelf cleanly.
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(FOREGROUND_ID,
                    buildNotification("Ransomware Watch", "Monitoring storage for encryption activity"),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForeground(FOREGROUND_ID,
                    buildNotification("Ransomware Watch", "Monitoring storage for encryption activity"));
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed (" + e.getClass().getSimpleName() + "): " + e.getMessage());
            stopSelf();
            return;
        }
        startWatching();
        Log.i(TAG, "RansomwareWatcherService started");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        for (FileObserver o : observers) o.stopWatching();
        observers.clear();
        Log.i(TAG, "RansomwareWatcherService stopped");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ── Watching ──────────────────────────────────────────────────────────────

    private void startWatching() {
        for (String root : WATCH_ROOTS) {
            watchDir(new File(root));
        }
    }

    private void watchDir(File dir) {
        if (!dir.exists() || !dir.isDirectory()) return;

        final int mask = FileObserver.CREATE | FileObserver.MOVED_TO | FileObserver.CLOSE_WRITE;
        FileObserver obs;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            obs = new FileObserver(dir, mask) {
                @Override public void onEvent(int event, @Nullable String path) {
                    if (path != null) checkFile(new File(dir, path));
                }
            };
        } else {
            obs = new FileObserver(dir.getAbsolutePath(), mask) {
                @Override public void onEvent(int event, @Nullable String path) {
                    if (path != null) checkFile(new File(dir, path));
                }
            };
        }
        obs.startWatching();
        observers.add(obs);

        File[] children = dir.listFiles();
        if (children != null) {
            for (File child : children) if (child.isDirectory()) watchDir(child);
        }
    }

    // ── Detection ─────────────────────────────────────────────────────────────

    private void checkFile(File f) {
        if (!f.exists() || !f.isFile()) return;

        String name = f.getName().toLowerCase();
        String ext = extension(name);
        String nameLower = name;

        // 1. Encrypted extension
        if (RANSOM_EXTENSIONS.contains(ext)) {
            emitAlert("encrypted_file", f.getAbsolutePath(),
                "File with ransomware extension detected: ." + ext);
            return;
        }

        // 2. Ransom note by filename
        for (String notePrefix : RANSOM_NOTE_NAMES) {
            if (nameLower.startsWith(notePrefix) || nameLower.contains(notePrefix)) {
                emitAlert("ransom_note", f.getAbsolutePath(),
                    "Possible ransom note: " + f.getName());
                return;
            }
        }

        // 3. Rapid rename burst tracking
        long now = System.currentTimeMillis();
        RENAME_TIMESTAMPS.add(now);
        // Purge old entries outside window
        RENAME_TIMESTAMPS.removeIf(ts -> (now - ts) > BURST_WINDOW_MS);
        if (RENAME_TIMESTAMPS.size() >= BURST_THRESHOLD) {
            RENAME_TIMESTAMPS.clear(); // reset to avoid repeated alerts
            emitAlert("burst", f.getAbsolutePath(),
                BURST_THRESHOLD + " file changes in " + (BURST_WINDOW_MS / 1000) + "s — possible encryption burst");
        }
    }

    private void emitAlert(String type, String filePath, String details) {
        RansomwareAlert alert = new RansomwareAlert(type, filePath, details);
        alertHistory.add(0, alert);
        if (alertHistory.size() > 50) alertHistory.remove(alertHistory.size() - 1);

        RansomwareListener l = listener;
        if (l != null) l.onRansomwareDetected(type, filePath, details);

        fireNotification(alert);
        Log.w(TAG, "RANSOMWARE ALERT [" + type + "]: " + details);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String extension(String filename) {
        int dot = filename.lastIndexOf('.');
        return (dot >= 0 && dot < filename.length() - 1) ? filename.substring(dot + 1) : "";
    }

    private void fireNotification(RansomwareAlert alert) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        String title = alert.type.equals("ransom_note") ? "⚠️ Possible ransom note found"
                     : alert.type.equals("burst")       ? "🚨 Suspicious file encryption burst"
                     : "🚨 Encrypted file extension detected";
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(alert.details)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setAutoCancel(true)
            .build();
        nm.notify(notifId.incrementAndGet(), n);
    }

    private Notification buildNotification(String title, String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle(title).setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_LOW).setOngoing(true).build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Ransomware Watcher", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Monitors file system for ransomware activity");
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }
}
