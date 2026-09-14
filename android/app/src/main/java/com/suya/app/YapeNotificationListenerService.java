package com.suya.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
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
    private static final String KEY_ALIAS = "suya_yape_observed_events";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int MAX_EVENTS = 100;
    private static final ExecutorService SYNC_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Pattern MONEY_PATTERN = Pattern.compile("(S\\/?|S\\.|PEN|ARS|USD|US\\$|\\$)\\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CODE_PATTERN = Pattern.compile("(?:c[oó]digo(?:\\s+(?:de\\s+)?(?:seguridad|operaci[oó]n|aprobaci[oó]n))?|operaci[oó]n|referencia|reference|ref\\.?|id(?:\\s+de)?\\s+(?:transferencia|operaci[oó]n))\\b\\s*[:#-]?\\s*([a-z0-9-]{3,20})", Pattern.CASE_INSENSITIVE);
    private static final Pattern SENDER_PATTERN = Pattern.compile("(?:^|\\b)(?:de|from)\\s+([\\p{L}][\\p{L}'-]*(?:\\s+[\\p{L}][\\p{L}'-]*){0,3})(?=\\s+(?:te\\b|env[ií]o|sent\\b|por\\b|S\\/?|PEN\\b|$))|^([\\p{L}][\\p{L}'-]*(?:\\s+[\\p{L}][\\p{L}'-]*){0,3})(?=\\s+te\\s+(?:env[ií]o|sent))", Pattern.CASE_INSENSITIVE);
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
        WalletAdapter adapter = findAdapter(statusBarNotification.getPackageName());
        if (adapter == null) return;
        Notification notification = statusBarNotification.getNotification();
        if (notification == null || notification.extras == null) return;

        String title = notification.extras.getString(Notification.EXTRA_TITLE, "");
        String text = notification.extras.getCharSequence(Notification.EXTRA_TEXT, "").toString();
        String bigText = notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT, "").toString();
        String combined = TextUtils.join(" ", new String[]{title, text, bigText}).replaceAll("\\s+", " ").trim();
        String lower = combined.toLowerCase(new Locale("es", "PE"));
        if (combined.isEmpty() || !adapter.matchesText(lower)) return;

        Matcher amountMatcher = MONEY_PATTERN.matcher(combined);
        if (!amountMatcher.find()) return;
        Money money = parseMoney(amountMatcher.group(1), amountMatcher.group(2));
        if (money == null || !adapter.currencies.contains(money.currency)) return;

        Matcher codeMatcher = CODE_PATTERN.matcher(combined);
        String code = codeMatcher.find() ? codeMatcher.group(1) : null;
        String senderName = extractSenderName(combined);
        String observedAt = isoNow();
        String eventId = sha256(adapter.source + "|" + statusBarNotification.getPackageName() + "|" + statusBarNotification.getPostTime() + "|" + money.amountCents + "|" + money.currency + "|" + (code == null ? "" : code));

        JSONObject event = new JSONObject();
        try {
            event.put("eventId", eventId);
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

    @Nullable
    private static WalletAdapter findAdapter(String packageName) {
        for (WalletAdapter adapter : ADAPTERS) {
            if (adapter.packageNames.contains(packageName)) return adapter;
        }
        return null;
    }

    @Nullable
    private static Money parseMoney(String prefix, String rawAmount) {
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
            current = new JSONArray(decryptEvents(preferences.getString(EVENTS_KEY, null)));
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
        String encrypted = encryptEvents(next.toString());
        // Never fall back to plaintext if Android Keystore is unavailable.
        if (encrypted != null) preferences.edit().putString(EVENTS_KEY, encrypted).apply();
    }

    /** Stores the observer token encrypted and starts a best-effort background sync. */
    public static boolean configureDeviceToken(Context context, String token) {
        if (context == null || token == null || token.trim().length() < 48) return false;
        String encrypted = encryptValue(token.trim());
        if (encrypted == null) return false;
        context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(DEVICE_TOKEN_KEY, encrypted)
                .apply();
        syncPendingEvents(context);
        return true;
    }

    public static void clearDeviceToken(Context context) {
        if (context == null) return;
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(DEVICE_TOKEN_KEY).apply();
    }

    public static boolean isDeviceConfigured(Context context) {
        if (context == null) return false;
        String stored = context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(DEVICE_TOKEN_KEY, null);
        return stored != null && decryptValue(stored) != null;
    }

    /** Retries only unsent, encrypted local observations; notifications never authorize payments. */
    public static void syncPendingEvents(Context context) {
        if (context == null) return;
        final Context appContext = context.getApplicationContext();
        SYNC_EXECUTOR.execute(() -> syncPendingEventsBlocking(appContext));
    }

    private static void syncPendingEventsBlocking(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        String encryptedToken = preferences.getString(DEVICE_TOKEN_KEY, null);
        String token = encryptedToken == null ? null : decryptValue(encryptedToken);
        if (token == null || BuildConfig.SUYA_SUPABASE_URL.isEmpty() || BuildConfig.SUYA_SUPABASE_PUBLISHABLE_KEY.isEmpty()) return;

        JSONArray current;
        try {
            current = new JSONArray(decryptEvents(preferences.getString(EVENTS_KEY, null)));
        } catch (JSONException ignored) {
            return;
        }

        boolean changed = false;
        for (int index = 0; index < current.length(); index++) {
            JSONObject event = current.optJSONObject(index);
            if (event == null || event.optBoolean("synced", false)) continue;
            if (!uploadEvent(token, event)) break;
            try {
                event.put("synced", true);
                current.put(index, event);
                changed = true;
            } catch (JSONException ignored) {
                break;
            }
        }
        if (changed) {
            String encrypted = encryptEvents(current.toString());
            if (encrypted != null) preferences.edit().putString(EVENTS_KEY, encrypted).apply();
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
    private static String extractSenderName(String combined) {
        Matcher matcher = SENDER_PATTERN.matcher(combined);
        if (!matcher.find()) return null;
        String value = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
        if (value == null) return null;
        String normalized = value.replaceAll("\\s+", " ").trim();
        return normalized.length() >= 2 && normalized.length() <= 120 ? normalized : null;
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
