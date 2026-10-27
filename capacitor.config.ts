import type { CapacitorConfig } from "@capacitor/cli"

// The phone apps are a native shell around the live site. Every `vercel --prod`
// updates them instantly; only native changes (plugins, icons, Info.plist) need a
// new app build. mobile/www holds the pages shown before the site loads.
const config: CapacitorConfig = {
  appId: "com.hilltyler.taxsnap",
  appName: "TaxSnap",
  webDir: "mobile/www",
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://taxsnap-jet.vercel.app",
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#f9fafb",
  },
  android: {
    backgroundColor: "#f9fafb",
    // Background trip tracking: without this, Android stops delivering location to the
    // web view after about 5 minutes in the background.
    useLegacyBridge: true,
  },
  plugins: {
    SystemBars: {
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1D9E75",
      showSpinner: false,
    },
  },
}

export default config
