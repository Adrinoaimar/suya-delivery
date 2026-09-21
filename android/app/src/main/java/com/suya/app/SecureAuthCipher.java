package com.suya.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** AES-GCM storage backed by a non-exportable Android Keystore key. */
final class SecureAuthCipher {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private SecureAuthCipher() {}

    static String encrypt(String value, SecretKey key) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        // Android Keystore controls the nonce for encryption. Supplying our own IV
        // is rejected by several provider/API combinations with
        // InvalidAlgorithmParameterException.
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_LENGTH_BYTES) {
            throw new GeneralSecurityException("Android Keystore devolvió un IV inválido");
        }
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] packed = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, packed, 0, iv.length);
        System.arraycopy(ciphertext, 0, packed, iv.length, ciphertext.length);
        return Base64.encodeToString(packed, Base64.NO_WRAP);
    }

    static String decrypt(String encoded, SecretKey key) throws GeneralSecurityException {
        byte[] packed;
        try {
            packed = Base64.decode(encoded, Base64.NO_WRAP);
        } catch (IllegalArgumentException error) {
            throw new GeneralSecurityException("Ciphertext inválido", error);
        }
        if (packed.length <= IV_LENGTH_BYTES) throw new GeneralSecurityException("Ciphertext inválido");
        byte[] iv = new byte[IV_LENGTH_BYTES];
        byte[] ciphertext = new byte[packed.length - IV_LENGTH_BYTES];
        System.arraycopy(packed, 0, iv, 0, iv.length);
        System.arraycopy(packed, iv.length, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    static SecretKey getOrCreateKey(String alias) throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        try {
            keyStore.load(null);
        } catch (IOException error) {
            throw new GeneralSecurityException("No se pudo abrir Android Keystore", error);
        }
        if (keyStore.containsAlias(alias)) {
            java.security.Key key = keyStore.getKey(alias, null);
            if (!(key instanceof SecretKey)) throw new GeneralSecurityException("Tipo de clave inválido");
            return (SecretKey) key;
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
        return generator.generateKey();
    }

    static void deleteKey(String alias) throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        try {
            keyStore.load(null);
        } catch (IOException error) {
            throw new GeneralSecurityException("No se pudo abrir Android Keystore", error);
        }
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias);
    }
}
