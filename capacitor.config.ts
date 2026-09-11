import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.suya.app',
  appName: 'Suya',
  webDir: 'dist/mobile',
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
  },
};

export default config;
