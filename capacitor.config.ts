import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.suya.app',
  appName: 'Suya',
  webDir: 'dist/customer',
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
      backgroundColor: '#0A5335',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A5335',
      overlaysWebView: false,
    },
  },
};

export default config;
