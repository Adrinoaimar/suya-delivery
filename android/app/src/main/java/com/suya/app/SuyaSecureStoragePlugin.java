package com.suya.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import androidx.annotation.Nullable;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

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
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int IV_LENGTH_BYTES = 12;

    @PluginMethod
    public void getItem(PluginCall call) {
        String key = validatedKey(call);
        if (key == null) return;
        try {
            String encoded = preferences().getString(storageKey(key), null);
            String value = encoded == null ? null : decrypt(encoded);
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
            preferences().edit().putString(storageKey(key), encrypt(value)).apply();
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

    private String encrypt(String value) throws GeneralSecurityException {
        byte[] iv = new byte[IV_LENGTH_BYTES];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(), new GCMParameterSpec(128, iv));
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] packed = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, packed, 0, iv.length);
        System.arraycopy(ciphertext, 0, packed, iv.length, ciphertext.length);
        return Base64.encodeToString(packed, Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws GeneralSecurityException {
        byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
        if (packed.length <= IV_LENGTH_BYTES) throw new GeneralSecurityException("Invalid ciphertext");
        byte[] iv = new byte[IV_LENGTH_BYTES];
        byte[] ciphertext = new byte[packed.length - IV_LENGTH_BYTES];
        System.arraycopy(packed, 0, iv, 0, iv.length);
        System.arraycopy(packed, iv.length, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    private SecretKey secretKey() throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        try {
            keyStore.load(null);
        } catch (IOException error) {
            throw new GeneralSecurityException("No se pudo abrir Android Keystore", error);
        }
        if (keyStore.containsAlias(KEY_ALIAS)) {
            java.security.Key key = keyStore.getKey(KEY_ALIAS, null);
            if (!(key instanceof SecretKey)) throw new GeneralSecurityException("Invalid key type");
            return (SecretKey) key;
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
        return generator.generateKey();
    }
}
