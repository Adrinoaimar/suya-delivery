package com.suya.app;

import android.app.Notification;
import android.content.SharedPreferences;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Experimental, local-only Yape notification observer.
 *
 * This service deliberately never marks an order as paid and never sends data
 * to Suya. A notification can be forged or delayed; only an authenticated
 * provider webhook may confirm a payment in production.
 */
public final class YapeNotificationListenerService extends NotificationListenerService {
    private static final String PREFS = "suya_yape_lab";
    private static final String EVENTS_KEY = "observed_events";
    private static final int MAX_EVENTS = 100;
    private static final Set<String> ALLOWED_PACKAGES = new HashSet<>();
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("(?:s\\/?|s\\.)\\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CODE_PATTERN = Pattern.compile("(?:c[oó]digo(?:\\s+(?:de\\s+)?(?:seguridad|operaci[oó]n|aprobaci[oó]n))?|operaci[oó]n)\\s*[:#-]?\\s*([0-9]{3,12})", Pattern.CASE_INSENSITIVE);

    static {
        ALLOWED_PACKAGES.add("com.bcp.innovacxion.yapeapp");
        ALLOWED_PACKAGES.add("com.bcp.yape.app");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification statusBarNotification) {
        if (statusBarNotification == null || !ALLOWED_PACKAGES.contains(statusBarNotification.getPackageName())) return;
        Notification notification = statusBarNotification.getNotification();
        if (notification == null || notification.extras == null) return;

        String title = notification.extras.getString(Notification.EXTRA_TITLE, "");
        String text = notification.extras.getCharSequence(Notification.EXTRA_TEXT, "").toString();
        String bigText = notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT, "").toString();
        String combined = TextUtils.join(" ", new String[]{title, text, bigText}).replaceAll("\\s+", " ").trim();
        String lower = combined.toLowerCase(new Locale("es", "PE"));
        if (combined.isEmpty() || (!lower.contains("yape") && !lower.contains("recib"))) return;

        Matcher amountMatcher = AMOUNT_PATTERN.matcher(combined);
        if (!amountMatcher.find()) return;
        Long amountCents = normalizeAmount(amountMatcher.group(1));
        if (amountCents == null || amountCents <= 0) return;

        Matcher codeMatcher = CODE_PATTERN.matcher(combined);
        String code = codeMatcher.find() ? codeMatcher.group(1) : null;
        String observedAt = isoNow();
        String eventId = sha256(statusBarNotification.getPackageName() + "|" + statusBarNotification.getPostTime() + "|" + amountCents + "|" + (code == null ? "" : code));

        JSONObject event = new JSONObject();
        try {
            event.put("eventId", eventId);
            event.put("source", "yape_notification");
            event.put("verification", "unverified");
            event.put("amountCents", amountCents);
            event.put("currency", "PEN");
            event.put("code", code == null ? JSONObject.NULL : code);
            event.put("observedAt", observedAt);
        } catch (JSONException ignored) {
            return;
        }
        appendEvent(event);
    }

    @Nullable
    private static Long normalizeAmount(String raw) {
        String compact = raw.replace(" ", "");
        int comma = compact.lastIndexOf(',');
        int dot = compact.lastIndexOf('.');
        int decimalIndex = Math.max(comma, dot);
        boolean hasDecimal = decimalIndex >= 0 && compact.length() - decimalIndex - 1 == 2;
        String integer = (hasDecimal ? compact.substring(0, decimalIndex) : compact).replace(",", "").replace(".", "");
        String decimal = hasDecimal ? compact.substring(decimalIndex + 1) : "00";
        try {
            return Long.parseLong(integer) * 100L + Long.parseLong(decimal);
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private void appendEvent(JSONObject event) {
        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray current;
        try {
            current = new JSONArray(preferences.getString(EVENTS_KEY, "[]"));
        } catch (JSONException ignored) {
            current = new JSONArray();
        }
        String eventId = event.optString("eventId");
        for (int index = 0; index < current.length(); index++) {
            if (eventId.equals(current.optJSONObject(index).optString("eventId"))) return;
        }
        JSONArray next = new JSONArray();
        next.put(event);
        for (int index = 0; index < current.length() && next.length() < MAX_EVENTS; index++) {
            next.put(current.opt(index));
        }
        preferences.edit().putString(EVENTS_KEY, next.toString()).apply();
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte current : bytes) result.append(String.format(Locale.US, "%02x", current));
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
