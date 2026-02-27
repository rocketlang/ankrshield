package com.ankr.shield;

import android.annotation.TargetApi;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

@TargetApi(Build.VERSION_CODES.N)
public class QuickShieldTile extends TileService {
    private static final String PREFS = "AnkrShieldPrefs";
    private static final String KEY_PROTECTION = "protectionActive";
    private static final String KEY_SCORE = "riskScore";

    @Override
    public void onStartListening() {
        super.onStartListening();
        updateTile();
    }

    @Override
    public void onClick() {
        super.onClick();
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean active = prefs.getBoolean(KEY_PROTECTION, false);
        prefs.edit().putBoolean(KEY_PROTECTION, !active).apply();
        updateTile();
    }

    private void updateTile() {
        Tile tile = getQsTile();
        if (tile == null) return;
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean active = prefs.getBoolean(KEY_PROTECTION, false);
        int score = prefs.getInt(KEY_SCORE, -1);

        tile.setState(active ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.setLabel("xShield");
        String sub = active ? (score >= 0 ? "Risk: " + score : "Protected") : "Tap to enable";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.setSubtitle(sub);
        }
        tile.updateTile();
    }
}
