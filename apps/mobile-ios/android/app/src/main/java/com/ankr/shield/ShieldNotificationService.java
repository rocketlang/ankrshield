package com.ankr.shield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Persistent foreground notification service.
 * Shows "xShield active — N threats blocked today" in notification tray.
 * Android 14 (API 34) requires the dataSync FGS type (declared in the manifest and
 * passed to startForeground) or the call throws and crashes the app.
 */
public class ShieldNotificationService extends Service {
    public static final String CHANNEL_ID = "xshield_protection";
    public static final int NOTIFICATION_ID = 1001;
    private static final String PREFS = "AnkrShieldPrefs";
    private static final String TAG = "ShieldNotification";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int blocked = 0;
        int riskScore = -1;
        if (intent != null) {
            blocked = intent.getIntExtra("blocked_today", 0);
            riskScore = intent.getIntExtra("risk_score", -1);
        } else {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            blocked = prefs.getInt("blocked_today", 0);
            riskScore = prefs.getInt("riskScore", -1);
        }

        String title = "xShield is protecting you";
        String text = blocked > 0
            ? blocked + " threats blocked today"
            : "Monitoring for threats";
        if (riskScore >= 0) {
            text += " · Risk score: " + riskScore;
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed (" + e.getClass().getSimpleName() + "): " + e.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "xShield Protection",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows xShield protection status");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }
}
