package com.ankr.shield;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * ShieldStatusWidget — Android 2×1 home screen widget.
 *
 * Displays:
 *   • Privacy Score (large, colour-coded: green 80+, yellow 50–79, red <50)
 *   • "N threats blocked today" line
 *   • Tap opens MainActivity (HomeScreen)
 *
 * Data source: SharedPreferences key "xshield_widget_data"
 *   JSON: { "score": 87, "threatsBlocked": 47, "updatedAt": "ISO string" }
 *
 * Updated from JS via WidgetModule.updateWidget(score, threats).
 * Update interval: 30 minutes (set in shield_widget_info.xml).
 */
public class ShieldStatusWidget extends AppWidgetProvider {

    private static final String PREFS_NAME   = "xshield_widget_prefs";
    private static final String DATA_KEY     = "xshield_widget_data";

    // Colour thresholds
    private static final int COLOR_SAFE    = Color.parseColor("#22c55e"); // green
    private static final int COLOR_WARN    = Color.parseColor("#eab308"); // yellow
    private static final int COLOR_DANGER  = Color.parseColor("#ef4444"); // red

    // -----------------------------------------------------------------------
    // AppWidgetProvider callbacks
    // -----------------------------------------------------------------------

    @Override
    public void onUpdate(Context context,
                         AppWidgetManager appWidgetManager,
                         int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateWidget(context, appWidgetManager, id);
        }
    }

    @Override
    public void onEnabled(Context context) {
        // Called when the first widget instance is added to the home screen
        updateAllWidgets(context);
    }

    // -----------------------------------------------------------------------
    // Core update logic
    // -----------------------------------------------------------------------

    private static void updateWidget(Context context,
                                     AppWidgetManager manager,
                                     int widgetId) {
        // Read persisted data
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(DATA_KEY, null);

        int score         = 0;
        int threatsBlocked = 0;

        if (json != null) {
            try {
                JSONObject obj = new JSONObject(json);
                score          = obj.optInt("score", 0);
                threatsBlocked = obj.optInt("threatsBlocked", 0);
            } catch (JSONException ignored) { }
        }

        // Build RemoteViews
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout);

        // Score text + colour
        views.setTextViewText(R.id.widget_score, String.valueOf(score));
        int scoreColor = scoreToColor(score);
        views.setTextColor(R.id.widget_score, scoreColor);

        // Threats line
        String threatsLine = threatsBlocked + " threats blocked today";
        views.setTextViewText(R.id.widget_threats, threatsLine);

        // Tap action — open app
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, launchIntent, flags);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        manager.updateAppWidget(widgetId, views);
    }

    /**
     * Push updated data to all active widget instances.
     * Called from WidgetModule when React Native reports new score/threats.
     */
    public static void updateWidgetData(Context context, int score, int threatsBlocked) {
        // Persist to SharedPreferences
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        try {
            JSONObject obj = new JSONObject();
            obj.put("score", score);
            obj.put("threatsBlocked", threatsBlocked);
            obj.put("updatedAt", java.time.Instant.now().toString());
            prefs.edit().putString(DATA_KEY, obj.toString()).apply();
        } catch (JSONException e) {
            // Fallback: store raw values as separate keys
            prefs.edit()
                 .putInt("score_raw", score)
                 .putInt("threats_raw", threatsBlocked)
                 .apply();
        }

        // Force redraw of all widget instances
        updateAllWidgets(context);
    }

    private static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component  = new ComponentName(context, ShieldStatusWidget.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                updateWidget(context, manager, id);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static int scoreToColor(int score) {
        if (score >= 80) return COLOR_SAFE;
        if (score >= 50) return COLOR_WARN;
        return COLOR_DANGER;
    }
}
