package com.suya.app;

import android.app.Notification;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.util.Base64;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.KeyStore;
import java.security.GeneralSecurityException;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

/**
 * Experimental, opt-in wallet notification observer.
 *
 * This service deliberately never marks an order as paid. Before a device token
 * is configured, observations remain encrypted locally. After explicit setup,
 * only minimized evidence is sent to the wallet observation RPC. A notification
 * can be forged or delayed; it never authorizes a payment by itself.
 */
public final class YapeNotificationListenerService extends NotificationListenerService {
    private static final String PREFS = "suya_yape_lab";
    private static final String EVENTS_KEY = "observed_events";
    private static final String DEVICE_TOKEN_KEY = "device_token";
    private static final String DEVICE_BINDING_KEY = "device_binding_id";
    private static final String QUEUE_FULL_KEY = "queue_full";
    private static final String KEY_ALIAS = "suya_yape_observed_events";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int SYNC_JOB_ID = 170914;
    private static final int MAX_EVENTS = 500;
    private static final long MAX_OBSERVED_AMOUNT_CENTS = 100000000L;
    private static final Object QUEUE_LOCK = new Object();
    private static final ExecutorService SYNC_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Pattern MONEY_PATTERN = Pattern.compile("(?<![\\p{L}\\d+-])(?:S\\/?|S\\.|PEN|ARS|USD|US\\$|\\$)\\s*((?:\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?:[.,]\\d{2})?)(?!\\d)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CODE_PATTERN = Pattern.compile("(?:c[oó]digo(?:\\s+(?:de\\s+)?(?:seguridad|operaci[oó]n|aprobaci[oó]n))?|operaci[oó]n|referencia|reference|ref\\.?|id(?:\\s+de)?\\s+(?:transferencia|operaci[oó]n))\\b\\s*[:#-]?\\s*([a-z0-9-]{3,64})", Pattern.CASE_INSENSITIVE);
    private static final Pattern SENDER_PATTERN = Pattern.compile("(?:^|\\b)(?:de|from|remitente|sender)\\s*[:#-]?\\s*(?!(?:seguridad|operaci[oó]n|transferencia|pago|payment|referencia|reference)\\b)([\\p{L}][\\p{L}'-]*(?:\\s+[\\p{L}][\\p{L}'-]*){0,4})(?=\\s*(?:[.,;:·|]|$|\\b(?:te\\b|envi[oó]|sent\\b|por\\b|monto\\b|amount\\b|operaci[oó]n\\b|c[oó]digo\\b|ref(?:erencia)?\\b|S\\/?|PEN\\b|USD\\b|ARS\\b)))|(?:^|\\b)([\\p{L}][\\p{L}'-]*(?:\\s+[\\p{L}][\\p{L}'-]*){0,4})(?=\\s+te\\s+(?:envi[oó](?=\\s|$)|sent\\b))", Pattern.CASE_INSENSITIVE);
    private static final Pattern INCOMING_NOTIFICATION_PATTERN = Pattern.compile("(?:^|[^\\p{L}])(?:recib(?:e|es|iste|i[oó]|ido|ieron|imos)|received|payment\\s+received|te\\s+envi[oó]|you\\s+(?:received|got)|dep[oó]sito\\s+(?:recibido|received)|transferencia\\s+recibida)(?=$|[^\\p{L}])", Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_INCOMING_NOTIFICATION_PATTERN = Pattern.compile("(?:^|[^\\p{L}])(?:saldo|reversi[oó]n|devoluci[oó]n|promoci[oó]n|oferta|solicitud|solicitaste|enviaste|enviado|enviada|sent|failed|fall[oó])(?=$|[^\\p{L}])", Pattern.CASE_INSENSITIVE);
    private static final WalletAdapter[] ADAPTERS = new WalletAdapter[]{
            new WalletAdapter("yape", "yape_notification",
                    new String[]{"com.bcp.innovacxion.yapeapp", "com.bcp.yape.app"},
                    new String[]{"yape", "recib"}, new String[]{"PEN"}),
            // Verified from Lemon's official Google Play listing. Do not add guessed package IDs.
            new WalletAdapter("lemon", "lemon_notification", new String[]{"com.applemoncash"},
                    new String[]{"lemon", "recib", "received", "transfer"},
                    new String[]{"PEN", "ARS", "USD"}),
            // Plin notifications arrive through participating bank apps. IDs are official listings.
            new WalletAdapter("plin", "plin_notification",
                    new String[]{"com.bbva.nxt_peru", "pe.com.interbank.mobilebanking", "pe.com.scotiabank.blpm.android.client"},
                    new String[]{"plin"}, new String[]{"PEN"}),
            // Verified from Mercado Pago's official Google Play listing.
            new WalletAdapter("mercado_pago", "mercado_pago_notification",
                    new String[]{"com.mercadopago.wallet"},
                    new String[]{"mercado pago", "mercadopago", "recib", "received", "transfer"},
                    new String[]{"PEN"})
    };

    @Override
    public void onNotificationPosted(StatusBarNotification statusBarNotification) {
        if (statusBarNotification == null) return;
        String bindingId = currentBindingId(this);
        // No se capturan notificaciones antes de que el operador vincule el
        // dispositivo a una cuenta receptora concreta.
        if (bindingId == null) return;
        WalletAdapter adapter = findAdapter(statusBarNotification.getPackageName());
        if (adapter == null) return;
        Notification notification = statusBarNotification.getNotification();
        if (notification == null || notification.extras == null) return;

        String combined = combinedNotificationText(notification.extras);
        String lower = combined.toLowerCase(new Locale("es", "PE"));
        if (combined.isEmpty() || !adapter.matchesText(lower) || !isIncomingNotification(lower)) return;

        Matcher amountMatcher = MONEY_PATTERN.matcher(combined);
        if (!amountMatcher.find()) return;
        if (hasMalformedAmountContinuation(combined, amountMatcher.end())) return;
        String rawAmount = amountMatcher.group(1);
        String prefix = amountMatcher.group().substring(0, amountMatcher.group().length() - rawAmount.length()).trim();
        Money money = parseMoney(prefix, rawAmount);
        if (money == null || !adapter.currencies.contains(money.currency)) return;

        Matcher codeMatcher = CODE_PATTERN.matcher(combined);
        String code = codeMatcher.find() ? codeMatcher.group(1) : null;
        String senderName = extractSenderNameFromFields(notificationTextFields(notification.extras), combined);
        long postTime = statusBarNotification.getPostTime();
        String observedAt = isoAt(postTime);
        String notificationKey = statusBarNotification.getKey();
        if (TextUtils.isEmpty(notificationKey)) {
            notificationKey = statusBarNotification.getPackageName() + "|" + statusBarNotification.getId() + "|" + statusBarNotification.getTag();
        }
        // The notification key stays local and is only included in the digest.
        // Do not include notification content or the operation code: wallets
        // commonly post a truncated notification and then expand the same
        // notification with the code. The stable event lets the backend and
        // local queue enrich one observation instead of creating a duplicate.
        String eventId = sha256(bindingId + "|" + adapter.source + "|" + statusBarNotification.getPackageName() + "|" + notificationKey + "|" + postTime + "|" + money.amountCents + "|" + money.currency);

        JSONObject event = new JSONObject();
        try {
            event.put("eventId", eventId);
            event.put("bindingId", bindingId);
            event.put("provider", adapter.provider);
            event.put("source", adapter.source);
            event.put("verification", "unverified");
            event.put("amountCents", money.amountCents);
            event.put("currency", money.currency);
            event.put("code", code == null ? JSONObject.NULL : code);
            event.put("senderName", senderName == null ? JSONObject.NULL : senderName);
            event.put("synced", false);
            event.put("observedAt", observedAt);
        } catch (JSONException ignored) {
            return;
        }
        appendEvent(event);
        syncPendingEvents(this);
    }

    private static String combinedNotificationText(Bundle extras) {
        StringBuilder result = new StringBuilder();
        for (String value : notificationTextFields(extras)) {
            if (value == null || value.trim().isEmpty()) continue;
            if (result.length() > 0) result.append(' ');
            result.append(value);
        }
        return result.toString().replaceAll("\\s+", " ").trim();
    }

    private static String[] notificationTextFields(Bundle extras) {
        String[] keys = new String[]{
                Notification.EXTRA_TITLE,
                Notification.EXTRA_TEXT,
                Notification.EXTRA_BIG_TEXT,
                Notification.EXTRA_SUB_TEXT,
                Notification.EXTRA_INFO_TEXT,
                Notification.EXTRA_SUMMARY_TEXT
        };
        String[] values = new String[keys.length];
        for (int index = 0; index < keys.length; index++) {
            CharSequence value = extras.getCharSequence(keys[index]);
            values[index] = value == null ? null : value.toString();
        }
        return values;
    }

    static String extractSenderNameFromFields(String[] fields, String combined) {
        for (String field : fields) {
            if (field == null || field.trim().isEmpty()) continue;
            String candidate = extractSenderName(field.replaceAll("\\s+", " ").trim());
            if (candidate != null) return candidate;
        }
        return extractSenderName(combined);
    }

    static String extractSenderName(String combined) {
        Matcher matcher = SENDER_PATTERN.matcher(combined);
        if (!matcher.find()) return null;
        String value = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
        if (value == null) return null;
        String normalized = value.replaceAll("\\s+", " ").trim();
        return normalized.length() >= 2 && normalized.length() <= 120 ? normalized : null;
    }

    @Nullable
    private static WalletAdapter findAdapter(String packageName) {
        for (WalletAdapter adapter : ADAPTERS) {
            if (adapter.packageNames.contains(packageName)) return adapter;
        }
        return null;
    }

    @Nullable
    static Money parseMoney(String prefix, String rawAmount) {
        Long amountCents = normalizeAmount(rawAmount);
        if (amountCents == null || amountCents <= 0) return null;
        String normalized = prefix.toUpperCase(Locale.US);
        String currency = "USD";
        if (normalized.equals("S") || normalized.equals("S/") || normalized.equals("S.") || normalized.equals("PEN")) {
            currency = "PEN";
        } else if (normalized.equals("ARS")) {
            currency = "ARS";
        }
        return new Money(amountCents, currency);
    }

    static boolean containsIncomingMoney(String text) {
        return MONEY_PATTERN.matcher(text).find();
    }

    static boolean isIncomingNotification(String text) {
        return INCOMING_NOTIFICATION_PATTERN.matcher(text).find()
                && !NON_INCOMING_NOTIFICATION_PATTERN.matcher(text).find();
    }

    @Nullable
    static Long normalizeAmount(String raw) {
        if (raw == null) return null;
        String compact = raw.replace(" ", "");
        int comma = compact.lastIndexOf(',');
        int dot = compact.lastIndexOf('.');
        int decimalIndex = Math.max(comma, dot);
        boolean hasDecimal = decimalIndex >= 0 && compact.length() - decimalIndex - 1 == 2;
        String integerSource = hasDecimal ? compact.substring(0, decimalIndex) : compact;
        if (hasDecimal) {
            char decimalSeparator = compact.charAt(decimalIndex);
            if (!integerSource.matches("\\d+")) {
                if (!isGroupedInteger(integerSource)) return null;
                char groupingSeparator = firstSeparator(integerSource);
                if (groupingSeparator == decimalSeparator) return null;
            }
        } else if (!integerSource.matches("\\d+") && !isGroupedInteger(integerSource)) {
            return null;
        }
        String integer = integerSource.replace(",", "").replace(".", "");
        String decimal = hasDecimal ? compact.substring(decimalIndex + 1) : "00";
        try {
            long integerValue = Long.parseLong(integer);
            long decimalValue = Long.parseLong(decimal);
            if (integerValue > (MAX_OBSERVED_AMOUNT_CENTS - decimalValue) / 100L) return null;
            long amountCents = integerValue * 100L + decimalValue;
            return amountCents > 0 ? amountCents : null;
        } catch (NumberFormatException error) {
            return null;
        }
    }

    static boolean hasMalformedAmountContinuation(String text, int end) {
        if (text == null || end < 0 || end > text.length()) return false;
        return text.substring(end).matches("^[.,]\\d");
    }

    private static boolean isGroupedInteger(String value) {
        if (value == null || value.isEmpty()) return false;
        char separator = firstSeparator(value);
        if (separator == 0) return false;
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if ((current == ',' || current == '.') && current != separator) return false;
        }
        String[] groups = value.split(separator == '.' ? "\\." : ",", -1);
        if (groups.length < 2 || groups[0].length() < 1 || groups[0].length() > 3) return false;
        for (int index = 0; index < groups.length; index++) {
            if (index == 0) {
                if (!groups[index].matches("\\d+")) return false;
            } else if (!groups[index].matches("\\d{3}")) {
                return false;
            }
        }
        return true;
    }

    private static char firstSeparator(String value) {
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (current == ',' || current == '.') return current;
        }
        return 0;
    }

    private void appendEvent(JSONObject event) {
        synchronized (QUEUE_LOCK) {
            appendEventLocked(event);
        }
    }

    private void appendEventLocked(JSONObject event) {
        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray current;
        try {
            current = new JSONArray(decryptEvents(preferences.getString(EVENTS_KEY, null)));
        } catch (JSONException ignored) {
            current = new JSONArray();
        }
        String eventId = event.optString("eventId");
        for (int index = 0; index < current.length(); index++) {
            JSONObject existing = current.optJSONObject(index);
            if (!eventId.equals(existing == null ? null : existing.optString("eventId"))) continue;
            try {
                boolean enriched = mergeEvidenceField(existing, event, "code")
                        | mergeEvidenceField(existing, event, "senderName");
                if (enriched) {
                    // A previously uploaded event must be retried so the RPC
                    // can fill the missing identity fields server-side.
                    existing.put("synced", false);
                    current.put(index, existing);
                    persistEvents(preferences, current);
                }
            } catch (JSONException ignored) {
                // Keep the original encrypted event if enrichment fails.
            }
            return;
        }
        int pendingCount = 0;
        for (int index = 0; index < current.length(); index++) {
            JSONObject existing = current.optJSONObject(index);
            if (existing != null && !existing.optBoolean("synced", false)) pendingCount++;
        }
        // La cola nunca sustituye evidencia pendiente por historia sincronizada.
        // Si está llena, se conserva todo y el estado queda visible para la capa nativa.
        if (pendingCount >= MAX_EVENTS) {
            preferences.edit().putBoolean(QUEUE_FULL_KEY, true).apply();
            return;
        }
        JSONArray next = buildQueueWithPendingPriority(current, event);
        persistEvents(preferences, next);
    }

    private static void persistEvents(SharedPreferences preferences, JSONArray events) {
        String encrypted = encryptEvents(events.toString());
        // Never fall back to plaintext if Android Keystore is unavailable.
        if (encrypted != null) {
            preferences.edit()
                    .putString(EVENTS_KEY, encrypted)
                    .putBoolean(QUEUE_FULL_KEY, isPendingCapacityReached(events))
                    .apply();
        }
    }

    /**
     * Keeps the incoming event and every unsynced event before retaining synced
     * history. Once the cap is reached, only already uploaded history may be
     * discarded; a pending observation must never be displaced by old history.
     */
    static JSONArray buildQueueWithPendingPriority(JSONArray current, JSONObject incoming) {
        JSONArray next = new JSONArray();
        next.put(incoming);
        boolean[] synced = new boolean[current.length()];
        for (int index = 0; index < current.length(); index++) {
            JSONObject existing = current.optJSONObject(index);
            synced[index] = existing != null && existing.optBoolean("synced", false);
        }
        for (int index : pendingPriorityIndexes(synced)) {
            JSONObject existing = current.optJSONObject(index);
            if (existing != null) next.put(existing);
        }
        return next;
    }

    /** Returns current-event indexes in lossless pending-first order. */
    static int[] pendingPriorityIndexes(boolean[] synced) {
        int[] indexes = new int[Math.min(MAX_EVENTS - 1, synced.length)];
        int count = 0;
        for (int pass = 0; pass < 2 && count < indexes.length; pass++) {
            boolean wantSynced = pass == 1;
            for (int index = 0; index < synced.length && count < indexes.length; index++) {
                if (synced[index] != wantSynced) continue;
                indexes[count++] = index;
            }
        }
        return Arrays.copyOf(indexes, count);
    }

    static boolean isPendingCapacityReached(JSONArray events) {
        int pending = 0;
        for (int index = 0; index < events.length(); index++) {
            JSONObject event = events.optJSONObject(index);
            if (event != null && !event.optBoolean("synced", false)) pending++;
        }
        return pending >= MAX_EVENTS;
    }

    private static boolean mergeEvidenceField(JSONObject existing, JSONObject incoming, String key) throws JSONException {
        Object incomingValue = incoming.opt(key);
        if (incomingValue == null || incomingValue == JSONObject.NULL
                || TextUtils.isEmpty(incomingValue.toString().trim())) return false;
        Object existingValue = existing.opt(key);
        if (existingValue != null && existingValue != JSONObject.NULL
                && !TextUtils.isEmpty(existingValue.toString().trim())) return false;
        existing.put(key, incomingValue);
        return true;
    }

    /** Stores the observer token encrypted and starts a best-effort background sync. */
    public static boolean configureDeviceToken(Context context, String token) {
        if (context == null || token == null || token.trim().length() < 48) return false;
        String encrypted = encryptValue(token.trim());
        if (encrypted == null) return false;
        String bindingId = sha256(token.trim());
        synchronized (QUEUE_LOCK) {
            context.getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putString(DEVICE_TOKEN_KEY, encrypted)
                    .putString(DEVICE_BINDING_KEY, bindingId)
                    .remove(QUEUE_FULL_KEY)
                    .apply();
        }
        scheduleSyncJob(context);
        syncPendingEvents(context);
        return true;
    }

    public static void clearDeviceToken(Context context) {
        if (context == null) return;
        synchronized (QUEUE_LOCK) {
            // La cola se conserva cifrada; al rotar token, los eventos quedan
            // ligados al binding anterior y jamás se envían al nuevo restaurante.
            context.getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit().remove(DEVICE_TOKEN_KEY).remove(DEVICE_BINDING_KEY).apply();
        }
        cancelSyncJob(context);
    }

    public static boolean isDeviceConfigured(Context context) {
        if (context == null) return false;
        String stored = context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(DEVICE_TOKEN_KEY, null);
        return stored != null && decryptValue(stored) != null;
    }

    static int pendingEventCount(Context context) {
        if (context == null) return 0;
        synchronized (QUEUE_LOCK) {
            String stored = context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(EVENTS_KEY, null);
            try {
                JSONArray events = new JSONArray(decryptEvents(stored));
                int count = 0;
                for (int index = 0; index < events.length(); index++) {
                    JSONObject event = events.optJSONObject(index);
                    if (event != null && !event.optBoolean("synced", false)) count++;
                }
                return count;
            } catch (JSONException ignored) {
                return 0;
            }
        }
    }

    static boolean isQueueFull(Context context) {
        if (context == null) return false;
        synchronized (QUEUE_LOCK) {
            SharedPreferences preferences = context.getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONArray events;
            try {
                events = new JSONArray(decryptEvents(preferences.getString(EVENTS_KEY, null)));
            } catch (JSONException ignored) {
                events = new JSONArray();
            }
            boolean queueFull = isPendingCapacityReached(events);
            if (preferences.getBoolean(QUEUE_FULL_KEY, false) != queueFull) {
                preferences.edit().putBoolean(QUEUE_FULL_KEY, queueFull).apply();
            }
            return queueFull;
        }
    }

    @Nullable
    private static String currentBindingId(Context context) {
        if (context == null) return null;
        String binding = context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(DEVICE_BINDING_KEY, null);
        return TextUtils.isEmpty(binding) ? null : binding;
    }

    /** Retries only unsent, encrypted local observations; notifications never authorize payments. */
    public static void syncPendingEvents(Context context) {
        if (context == null) return;
        final Context appContext = context.getApplicationContext();
        SYNC_EXECUTOR.execute(() -> syncPendingEventsBlocking(appContext));
    }

    static void syncPendingEventsBlockingForJob(Context context) {
        syncPendingEventsBlocking(context.getApplicationContext());
    }

    private static void scheduleSyncJob(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return;
        JobInfo job = new JobInfo.Builder(
                SYNC_JOB_ID,
                new ComponentName(context, SuyaWalletSyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setPeriodic(15 * 60 * 1000L)
                .setBackoffCriteria(30 * 1000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .build();
        scheduler.schedule(job);
    }

    private static void cancelSyncJob(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler != null) scheduler.cancel(SYNC_JOB_ID);
    }

    private static void syncPendingEventsBlocking(Context context) {
        synchronized (QUEUE_LOCK) {
            syncPendingEventsBlockingLocked(context);
        }
    }

    private static void syncPendingEventsBlockingLocked(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        String encryptedToken = preferences.getString(DEVICE_TOKEN_KEY, null);
        String token = encryptedToken == null ? null : decryptValue(encryptedToken);
        String bindingId = currentBindingId(context);
        if (token == null || bindingId == null || BuildConfig.SUYA_SUPABASE_URL.isEmpty() || BuildConfig.SUYA_SUPABASE_PUBLISHABLE_KEY.isEmpty()) return;

        JSONArray current;
        try {
            current = new JSONArray(decryptEvents(preferences.getString(EVENTS_KEY, null)));
        } catch (JSONException ignored) {
            return;
        }

        boolean changed = false;
        for (int index = 0; index < current.length(); index++) {
            JSONObject event = current.optJSONObject(index);
            if (event == null || event.optBoolean("synced", false)
                    || !bindingId.equals(event.optString("bindingId", null))) continue;
            if (!uploadEvent(token, event)) break;
            try {
                event.put("synced", true);
                current.put(index, event);
                changed = true;
            } catch (JSONException ignored) {
                break;
            }
        }
        boolean queueFull = isPendingCapacityReached(current);
        if (changed || preferences.getBoolean(QUEUE_FULL_KEY, false) != queueFull) {
            persistEvents(preferences, current);
        }
    }

    private static boolean uploadEvent(String token, JSONObject event) {
        HttpURLConnection connection = null;
        try {
            URL endpoint = new URL(BuildConfig.SUYA_SUPABASE_URL.replaceAll("/+$", "") + "/rest/v1/rpc/ingest_wallet_observation");
            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(5_000);
            connection.setReadTimeout(5_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("apikey", BuildConfig.SUYA_SUPABASE_PUBLISHABLE_KEY);
            connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUYA_SUPABASE_PUBLISHABLE_KEY);
            connection.setRequestProperty("Content-Type", "application/json");
            JSONObject payload = new JSONObject();
            payload.put("p_device_token", token);
            payload.put("p_event_id", event.optString("eventId"));
            payload.put("p_provider", event.optString("provider"));
            payload.put("p_sender_name", event.opt("senderName"));
            payload.put("p_code", event.opt("code"));
            payload.put("p_amount_cents", event.optLong("amountCents"));
            payload.put("p_currency", event.optString("currency"));
            payload.put("p_observed_at", event.optString("observedAt"));
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            return status >= 200 && status < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Nullable
    private static String decryptValue(@Nullable String stored) {
        if (stored == null || stored.isEmpty()) return null;
        try {
            String[] parts = stored.split(":", 2);
            if (parts.length != 2) return null;
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            return null;
        }
    }

    @Nullable
    private static String encryptValue(String value) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
            String ciphertext = Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            return iv + ":" + ciphertext;
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            return null;
        }
    }

    private static String decryptEvents(@Nullable String stored) {
        if (stored == null || stored.isEmpty()) return "[]";
        try {
            String[] parts = stored.split(":", 2);
            if (parts.length != 2) return "[]";
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            // Corrupt or invalidated data is discarded logically; it is never
            // interpreted as an unencrypted event stream.
            return "[]";
        }
    }

    @Nullable
    private static String encryptEvents(String plaintext) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
            String ciphertext = Base64.encodeToString(cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            return iv + ":" + ciphertext;
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            return null;
        }
    }

    private static SecretKey getOrCreateKey() throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        try {
            keyStore.load(null);
        } catch (Exception error) {
            throw new GeneralSecurityException("No se pudo abrir Android Keystore", error);
        }
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((SecretKey) keyStore.getKey(KEY_ALIAS, null));
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static String isoAt(long timestamp) {
        return timestamp > 0 ? isoFormat().format(new Date(timestamp)) : isoNow();
    }

    private static SimpleDateFormat isoFormat() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format;
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

    private static final class Money {
        private final long amountCents;
        private final String currency;

        private Money(long amountCents, String currency) {
            this.amountCents = amountCents;
            this.currency = currency;
        }
    }

    private static final class WalletAdapter {
        private final String provider;
        private final String source;
        private final Set<String> packageNames;
        private final Set<String> keywords;
        private final Set<String> currencies;

        private WalletAdapter(String provider, String source, String[] packageNames, String[] keywords, String[] currencies) {
            this.provider = provider;
            this.source = source;
            this.packageNames = new HashSet<>(Arrays.asList(packageNames));
            this.keywords = new HashSet<>(Arrays.asList(keywords));
            this.currencies = new HashSet<>(Arrays.asList(currencies));
        }

        private boolean matchesText(String lowerText) {
            for (String keyword : keywords) {
                if (lowerText.contains(keyword)) return true;
            }
            return false;
        }
    }
}
