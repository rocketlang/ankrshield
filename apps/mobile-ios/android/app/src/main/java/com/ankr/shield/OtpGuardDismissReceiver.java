package com.ankr.shield;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Dismisses the OTP Guard CRITICAL notification when user taps "I'm Safe".
 */
public class OtpGuardDismissReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        NotificationManager nm = (NotificationManager)
            ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NotificationChannels.NOTIF_ID_OTP_GUARD);
    }
}
