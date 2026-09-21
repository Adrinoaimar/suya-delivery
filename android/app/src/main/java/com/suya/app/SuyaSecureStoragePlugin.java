package com.suya.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.Nullable;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.security.GeneralSecurityException;

import javax.crypto.SecretKey;

/**
 * Minimal encrypted storage for Supabase Auth sessions.
 * The ciphertext lives in app-private preferences; the AES key never leaves
 * Android Keystore. There is deliberately no plaintext fallback.
 */
@CapacitorPlugin(name = "SuyaSecureStorage")
public final class SuyaSecureStoragePlugin extends Plugin {
    // Rotate the storage namespace after the first release. This prevents an
    // invalidated Keystore entry left by an older install from rejecting a
    // valid login before a new session can be persisted.
    private static final String PREFERENCES = "suya_secure_auth_v2";
    private static final String KEY_ALIAS = "suya.auth.aes.v2";
    private static final String KEY_PREFIX = "auth:";

    @PluginMethod
    public void getItem(PluginCall call) {
        String key = validatedKey(call);
        if (key == null) return;
        try {
            String encoded = preferences().getString(storageKey(key), null);
            String value = encoded == null ? null : SecureAuthCipher.decrypt(encoded, secretKey());
            call.resolve(new com.getcapacitor.JSObject().put("value", value));
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            // A key-store restore/rotation mismatch must fail closed.
            call.reject("No se pudo leer la sesión segura.");
        }
    }

    @PluginMethod
    public void setItem(PluginCall call) {
        String key = validatedKey(call);
        String value = call.getString("value", null);
        if (key == null) return;
        if (value == null) {
            call.reject("El valor seguro es obligatorio.");
            return;
        }
        try {
            preferences().edit().putString(storageKey(key), SecureAuthCipher.encrypt(value, secretKey())).apply();
            call.resolve();
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            call.reject("No se pudo guardar la sesión segura.");
        }
    }

    @PluginMethod
    public void removeItem(PluginCall call) {
        String key = validatedKey(call);
        if (key == null) return;
        preferences().edit().remove(storageKey(key)).apply();
        call.resolve();
    }

    @Nullable
    private String validatedKey(PluginCall call) {
        String key = call.getString("key", "").trim();
        if (key.isEmpty() || key.length() > 256 || key.contains("\n") || key.contains("\r")) {
            call.reject("La clave segura no es válida.");
            return null;
        }
        return key;
    }

    private SharedPreferences preferences() {
        Context context = getContext();
        if (context == null) throw new IllegalStateException("Context unavailable");
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private String storageKey(String key) {
        return KEY_PREFIX + key;
    }

    private SecretKey secretKey() throws GeneralSecurityException {
        return SecureAuthCipher.getOrCreateKey(KEY_ALIAS);
    }
}
