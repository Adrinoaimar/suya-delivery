import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.suya.app',
  appName: 'Suya',
  webDir: 'dist/mobile',
  server: {
    androidScheme: 'https',
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
      // Brand-green bar keeps light icons readable on every route, including
      // the cream Home and StoreDetail surfaces on Samsung WebView.
      style: 'DARK',
      backgroundColor: '#0B7048',
      overlaysWebView: false,
    },
  },
};

export default config;
