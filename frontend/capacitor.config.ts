import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.motman.fx',
  appName: 'مطمن',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // For live reload against LAN API while developing:
    // url: 'http://YOUR_LAN_IP:5173',
    cleartext: true,
  },
  plugins: {
    Preferences: {},
  },
}

export default config