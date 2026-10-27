import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "react-hot-toast"
import NativeShell from "./NativeShell"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "TaxSnap — IRS-ready receipt tracker",
  description: "Scan receipts, track mileage, and auto-fill your taxes.",
  manifest: "/manifest.json",
  icons: { apple: "/apple-touch-icon.png" },
}

// viewport-fit=cover lets the app draw under the notch and home bar; the layout pads
// itself with env(safe-area-inset-*) so nothing ends up hidden behind them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1D9E75",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          {children}
          <Toaster position="top-center" containerStyle={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }} />
          <NativeShell />
        </body>
      </html>
    </ClerkProvider>
  )
}
