package com.suya.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import javax.crypto.SecretKey;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Regression test for Android Keystore encryption used by Supabase Auth. */
@RunWith(AndroidJUnit4.class)
public class SecureAuthCipherTest {
    private static final String KEY_ALIAS = "suya.test.auth.cipher";

    @After
    public void cleanupKey() throws Exception {
        SecureAuthCipher.deleteKey(KEY_ALIAS);
    }

    @Test
    public void encryptsWithKeystoreGeneratedIvAndDecrypts() throws Exception {
        SecretKey key = SecureAuthCipher.getOrCreateKey(KEY_ALIAS);
        String first = SecureAuthCipher.encrypt("session-1", key);
        String second = SecureAuthCipher.encrypt("session-1", key);

        assertNotEquals(first, second);
        assertEquals("session-1", SecureAuthCipher.decrypt(first, key));
        assertEquals("session-1", SecureAuthCipher.decrypt(second, key));
    }
}
