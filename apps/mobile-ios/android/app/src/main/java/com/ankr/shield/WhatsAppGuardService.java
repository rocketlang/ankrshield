package com.ankr.shield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.FileObserver;
import android.os.IBinder;
import android.util.Log;

import java.util.concurrent.atomic.AtomicInteger;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * WhatsAppGuardService — watches WhatsApp media folders for suspicious attachments.
 *
 * Scans every newly received file for:
 *   - APK files (disguised or real) — instant malware risk
 *   - MIME type / file extension mismatch (file claims to be .jpg but is .apk)
 *   - Known dangerous file types (.exe, .dex, .so, .sh, .bat)
 *   - Suspiciously large "images" (> 8MB — could be a crafted exploit)
 *
 * Nothing is read from WhatsApp messages. Only files saved to the filesystem
 * are analysed. Results are stored in a ring buffer and emitted to React Native
 * via the static listener registered by WhatsAppGuardModule.
 */
public class WhatsAppGuardService extends Service {

    private static final String TAG = "WhatsAppGuard";
    private static final String CHANNEL_ID = "whatsapp_guard";
    private static final int FOREGROUND_ID = 3001;

    // WhatsApp stores received media in these paths (covers legacy + scoped storage)
    private static final String[] WATCH_PATHS = {
        "/storage/emulated/0/WhatsApp/Media",
        "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media",
        "/storage/emulated/0/WhatsApp Business/Media",
        "/storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media",
    };

    // Dangerous extensions — any file with these extensions is immediately flagged
    private static final List<String> DANGEROUS_EXTENSIONS = Arrays.asList(
        "apk", "dex", "jar", "so", "exe", "bat", "sh", "cmd",
        "vbs", "ps1", "msi", "dmg", "ipa", "xapk"
    );

    // Magic bytes (first bytes of file) for common formats
    // Used to detect extension spoofing
    private static final byte[] MAGIC_APK  = { 0x50, 0x4B, 0x03, 0x04 }; // ZIP / APK / JAR
    private static final byte[] MAGIC_DEX  = { 0x64, 0x65, 0x78, 0x0A }; // Dalvik .dex
    private static final byte[] MAGIC_ELF  = { 0x7F, 0x45, 0x4C, 0x46 }; // ELF (.so)
    private static final byte[] MAGIC_PE   = { 0x4D, 0x5A };              // Windows PE .exe
    private static final byte[] MAGIC_SH   = { 0x23, 0x21 };              // Shell script #!

    // Incrementing notification IDs so each threat gets its own dismissible notification
    private static final AtomicInteger notifIdCounter = new AtomicInteger(4000);

    // Scan history — capped at 200 entries, newest first
    public static final List<ScanEntry> scanHistory =
        new CopyOnWriteArrayList<>();

    // Event listener interface (called by WhatsAppGuardModule)
    public interface GuardListener {
        void onFileScanned(ScanEntry entry);
    }
    public static volatile GuardListener listener = null;

    public static class ScanEntry {
        public final String fileName;
        public final String filePath;
        public final String verdict;   // "clean" | "suspicious" | "dangerous"
        public final String reason;
        public final long ts;
        public final long fileSizeBytes;

        public ScanEntry(String fileName, String filePath, String verdict,
                         String reason, long fileSizeBytes) {
            this.fileName = fileName;
            this.filePath = filePath;
            this.verdict = verdict;
            this.reason = reason;
            this.ts = System.currentTimeMillis();
            this.fileSizeBytes = fileSizeBytes;
        }

        public JSONObject toJson() {
            try {
                JSONObject o = new JSONObject();
                o.put("fileName", fileName);
                o.put("filePath", filePath);
                o.put("verdict", verdict);
                o.put("reason", reason);
                o.put("ts", ts);
                o.put("fileSizeBytes", fileSizeBytes);
                return o;
            } catch (Exception e) {
                return new JSONObject();
            }
        }
    }

    private final List<FileObserver> observers = new ArrayList<>();

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(FOREGROUND_ID, buildForegroundNotification());
        startWatching();
        Log.i(TAG, "WhatsAppGuardService started");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        for (FileObserver o : observers) o.stopWatching();
        observers.clear();
        Log.i(TAG, "WhatsAppGuardService stopped");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ── File watching ────────────────────────────────────────────────────────

    private void startWatching() {
        for (String root : WATCH_PATHS) {
            watchRecursive(new File(root));
        }
    }

    private void watchRecursive(File dir) {
        if (!dir.exists() || !dir.isDirectory()) return;

        FileObserver obs = new FileObserver(dir.getAbsolutePath(),
                FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO) {
            @Override
            public void onEvent(int event, @Nullable String path) {
                if (path == null) return;
                File f = new File(dir, path);
                if (!f.exists() || !f.isFile()) return;
                scanFile(f);
            }
        };
        obs.startWatching();
        observers.add(obs);

        // Recurse into subdirectories
        File[] children = dir.listFiles();
        if (children != null) {
            for (File child : children) {
                if (child.isDirectory()) watchRecursive(child);
            }
        }
    }

    // ── Scanning ─────────────────────────────────────────────────────────────

    private void scanFile(File f) {
        String name = f.getName();
        String ext = extension(name).toLowerCase();
        long size = f.length();

        // 1. Outright dangerous extension
        if (DANGEROUS_EXTENSIONS.contains(ext)) {
            emit(new ScanEntry(name, f.getAbsolutePath(), "dangerous",
                "Dangerous file type received: ." + ext + " files can install malware", size));
            return;
        }

        // 2. Read magic bytes
        byte[] magic = readMagic(f, 8);
        if (magic == null) return; // can't read — skip

        // 3. APK / JAR disguised as something else
        if (startsWith(magic, MAGIC_APK)) {
            String mimeExt = ext.isEmpty() ? "unknown" : ext;
            emit(new ScanEntry(name, f.getAbsolutePath(), "dangerous",
                "File appears to be an APK/ZIP but has ." + mimeExt + " extension — possible malware", size));
            return;
        }

        // 4. DEX bytecode (raw Android executable)
        if (startsWith(magic, MAGIC_DEX)) {
            emit(new ScanEntry(name, f.getAbsolutePath(), "dangerous",
                "File contains Dalvik bytecode (.dex) — executable code disguised as attachment", size));
            return;
        }

        // 5. ELF binary (.so native library)
        if (startsWith(magic, MAGIC_ELF)) {
            emit(new ScanEntry(name, f.getAbsolutePath(), "suspicious",
                "File is a native Linux binary (.so/ELF) sent as attachment — unusual", size));
            return;
        }

        // 6. Windows PE executable
        if (startsWith(magic, MAGIC_PE)) {
            emit(new ScanEntry(name, f.getAbsolutePath(), "suspicious",
                "File is a Windows executable (.exe) sent as attachment", size));
            return;
        }

        // 7. Shell script
        if (startsWith(magic, MAGIC_SH)) {
            emit(new ScanEntry(name, f.getAbsolutePath(), "suspicious",
                "File appears to be a shell script sent as attachment", size));
            return;
        }

        // 8. Suspiciously large image (> 12 MB) — potential exploit payload
        if ((ext.equals("jpg") || ext.equals("jpeg") || ext.equals("png") || ext.equals("webp"))
                && size > 12 * 1024 * 1024) {
            emit(new ScanEntry(name, f.getAbsolutePath(), "suspicious",
                "Image file is unusually large (" + (size / 1024 / 1024) + " MB) — possible exploit payload", size));
            return;
        }

        // Clean — record but don't alert
        ScanEntry entry = new ScanEntry(name, f.getAbsolutePath(), "clean", "", size);
        addToHistory(entry);
        if (listener != null) listener.onFileScanned(entry);
    }

    private void emit(ScanEntry entry) {
        addToHistory(entry);
        if (listener != null) listener.onFileScanned(entry);

        if (!entry.verdict.equals("clean")) {
            sendThreatNotification(entry);
        }
    }

    private void addToHistory(ScanEntry entry) {
        scanHistory.add(0, entry);
        if (scanHistory.size() > 200) {
            scanHistory.remove(scanHistory.size() - 1);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return (dot >= 0 && dot < name.length() - 1) ? name.substring(dot + 1) : "";
    }

    @Nullable
    private static byte[] readMagic(File f, int n) {
        try (FileInputStream fis = new FileInputStream(f)) {
            byte[] buf = new byte[n];
            int read = fis.read(buf);
            return read > 0 ? buf : null;
        } catch (IOException e) {
            return null;
        }
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        if (data.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private void sendThreatNotification(ScanEntry entry) {
        // Respect user's notification preference
        android.content.SharedPreferences prefs =
            getSharedPreferences("ankr_guard", android.content.Context.MODE_PRIVATE);
        if (!prefs.getBoolean("notifications_enabled", true)) return;

        NotificationManager nm =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        int notifId = notifIdCounter.incrementAndGet();

        String title = entry.verdict.equals("dangerous")
            ? "🚨 Dangerous file in WhatsApp"
            : "⚠️ Suspicious file in WhatsApp";

        // "Delete Now" action — fires ThreatActionReceiver directly, no app open needed
        Intent deleteIntent = new Intent(this, ThreatActionReceiver.class);
        deleteIntent.setAction(ThreatActionReceiver.ACTION_DELETE);
        deleteIntent.putExtra(ThreatActionReceiver.EXTRA_FILE_PATH, entry.filePath);
        deleteIntent.putExtra(ThreatActionReceiver.EXTRA_NOTIF_ID, notifId);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent deletePi = PendingIntent.getBroadcast(this, notifId, deleteIntent, flags);

        // Tap notification → open AnkrShield (best-effort)
        Intent openApp = getPackageManager()
            .getLaunchIntentForPackage(getPackageName());
        PendingIntent openPi = openApp != null
            ? PendingIntent.getActivity(this, 0, openApp, flags)
            : null;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(entry.fileName + " — tap to review")
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(entry.fileName + "\n\n" + entry.reason))
            .setPriority(entry.verdict.equals("dangerous")
                ? NotificationCompat.PRIORITY_MAX
                : NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(false)
            .addAction(android.R.drawable.ic_menu_delete, "Delete Now", deletePi);

        if (openPi != null) builder.setContentIntent(openPi);

        nm.notify(notifId, builder.build());
    }

    /** Called from WhatsAppGuardModule / ThreatActionReceiver — removes a threat file from storage. */
    public static boolean deleteThreatFile(String path) {
        if (path == null) return false;
        File f = new File(path);
        return f.exists() && f.delete();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "WhatsApp Guard", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Alerts when suspicious files are received via WhatsApp");
            NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildForegroundNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_upload)
            .setContentTitle("WhatsApp Guard Active")
            .setContentText("Scanning received files for threats")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build();
    }
}
