import type { CapacitorConfig } from '@capacitor/cli';

const liveUpdatePublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAi43fM/96xVYVtFVIrCxS
orvocd4rJvXRsT16bVWWmDsjjngitoRQC16BNDqAJeFvafiKy8JvBxBwyA3AkMMz
bD59lp5z5+SCt2lWSEeDl4DiV/zKXBxIeeBZWp/7mgqQQXxFkYhSf+bfHe72ske2
ht91VI/E0LhVfIp4tPjKVQVT4DgoAUuUcK7xwtJGXThnhITy4ZuyMo0yyDjbb0Li
KdkoTsAbIaamsbT5D8QHi6WtOeOdQN9gP77xzA4R6PeD2CDny0v3LxRWjDXQZnEQ
n1z2nBPm56x96spZ8c+UCcxxeiVvm+5VjWgIpydl2//WP4VWuSJYs+eb0Br45HFQ
9wIDAQAB
-----END PUBLIC KEY-----`;

const mobileAppId = process.env.SUYA_MOBILE_APP_ID?.trim() || 'com.suya.app';
const mobileAppName = process.env.SUYA_MOBILE_APP_NAME?.trim() || 'Suya';
const mobileWebDir = process.env.SUYA_MOBILE_WEB_DIR?.trim() || 'dist/mobile';

const config: CapacitorConfig = {
  appId: mobileAppId,
  appName: mobileAppName,
  webDir: mobileWebDir,
  server: {
    androidScheme: 'https',
  },
  android: {
    // Fondo del WebView antes del primer pintado: evita el fotograma blanco
    // entre el splash nativo y el HTML durante el arranque en frío.
    backgroundColor: '#F0F7F3',
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: '#0B7048',
      showSpinner: false,
    },
    StatusBar: {
      // Runtime bar blends into the light glass header; splash keeps brand green.
      style: 'DARK',
      backgroundColor: '#EEF6F1',
      overlaysWebView: false,
    },
    LiveUpdate: {
      autoUpdateStrategy: 'none',
      autoBlockRolledBackBundles: true,
      autoDeleteBundles: true,
      publicKey: liveUpdatePublicKey,
      readyTimeout: 10000,
    },
  },
};

export default config;
