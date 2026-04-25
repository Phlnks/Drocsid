import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.drocsid.app',
  appName: 'Drocsid',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'drocsid.app'
  }
};

export default config;
