import type { CapacitorConfig } from '@capacitor/cli';

import { liveUpdatePublicKey } from './src/lib/mobileUpdatePublicKey';

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
